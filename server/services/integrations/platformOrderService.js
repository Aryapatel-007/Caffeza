/**
 * Delivery platform orders, from arrival to paid. P25 Part H, API-CONTRACT M21
 * section 7.
 *
 * A platform order arrives as a webhook event, processed by a job. It waits on
 * the incoming requests screen unless the connection accepts automatically
 * and nothing about it needs a person. Accepting calls the platform first;
 * only then is our own DELIVERY order created, through orderOpenService, at
 * the platform's prices, as the restaurant's integration user, and fired. On
 * pickup it is billed and paid by the platform's own payment method.
 *
 * Every outgoing call that nobody waits for is a job. Accepting and rejecting
 * run inline, because the person tapping needs the answer.
 *
 * openOrder and fireOrder take no session (P23 recorded the same), so accept
 * is: claim the platform order with a status-filtered write, call the
 * platform, create, fire. A failure after the platform accepted leaves the
 * order FAILED with an alert, to enter by hand; it never pretends.
 */
import { DISCOUNT_REASONS } from '../../config/discountReasons.js';
import { platformByCode } from '../../config/platforms.js';
import { PLATFORM_REJECT_REASONS } from '../../config/platformRejectReasons.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../models/AuditLog.js';
import { CONNECTION_STATUSES, IntegrationConnection } from '../../models/IntegrationConnection.js';
import { Kot } from '../../models/Kot.js';
import { MenuItem } from '../../models/MenuItem.js';
import { Order, ORDER_LINE_STATUSES, ORDER_STATUSES, ORDER_TYPES, ORIGIN_KINDS } from '../../models/Order.js';
import { PaymentMethod } from '../../models/PaymentMethod.js';
import { PlatformItemMapping } from '../../models/PlatformItemMapping.js';
import { ATTENTION_REASONS, PLATFORM_ORDER_STATUSES, PlatformOrder } from '../../models/PlatformOrder.js';
import {
  BusinessRuleError,
  IntegrationNotActiveError,
  NotFoundError,
  PartnerCallFailedError,
  RequestAlreadyDecidedError,
} from '../../utils/errors.js';
import { scoped } from '../../utils/scopedQuery.js';
import { withOptionalTransaction } from '../../utils/transaction.js';
import { nowUtc } from '../../utils/time.js';
import { IntegrationJob, JOB_STATUSES } from '../../models/IntegrationJob.js';
import { recordAudit } from '../auditService.js';
import { applyDiscount, createBill, readBill, recordPayment, voidBill } from '../billService.js';
import { assertDayOpen, isDayClosed, todayBusinessDate } from '../dayLockService.js';
import { cancelLineInSession } from '../lineCancelService.js';
import { fireOrder, markKotLinesReady } from '../kitchenService.js';
import { openOrder } from '../orderOpenService.js';
import { applyVersionedUpdate, assertWasPreparedRule, buildLineSnapshots, computeLineTotalInPaise, loadOrderInTenant } from '../orderService.js';
import { isFeatureOn } from '../settingsService.js';
import { secretsOf } from './connectionService.js';
import { logEvent } from './eventLog.js';
import { enqueueJob, registerJobHandler } from './jobRunner.js';
import { adapterFor, PROVIDER_KINDS, providerFor } from './providers.js';
import { asIntegration } from './systemActor.js';
import { PROCESS_WEBHOOK_EVENT } from './webhookService.js';

export const CHANNEL_CALL = 'CHANNEL_CALL';
/** How long a person waits for the platform to answer an accept or a reject. */
export const PARTNER_TIMEOUT_MS = 8_000;
/** The difference between our bill and the platform's total that is only rounding. */
const ROUNDING_TOLERANCE_PAISE = 50;
const WAITING = [PLATFORM_ORDER_STATUSES.RECEIVED, PLATFORM_ORDER_STATUSES.NEEDS_ATTENTION];
/** Reasons a person can acknowledge and still accept: they handle it themselves. */
const HANDLED_BY_STAFF = [ATTENTION_REASONS.CASH_ON_DELIVERY, ATTENTION_REASONS.RESTAURANT_DELIVERY];
const DUPLICATE_KEY = 11000;

/* --------------------------------------------------------------------------
 * Small helpers
 * ----------------------------------------------------------------------- */

function withTimeout(promise, ms = PARTNER_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new PartnerCallFailedError('The platform did not answer in time.')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const ctxOf = (record) => ({ restaurantId: record.restaurantId, branchId: record.branchId });
const referenceOf = (platformCode, platformOrderId) => `${platformByCode(platformCode)?.name ?? platformCode} ${platformOrderId}`;

async function loadConnection(ctx, connectionId) {
  const connection = await IntegrationConnection.findOne({ restaurantId: ctx.restaurantId, _id: connectionId }).select('+credentials');
  if (!connection) throw new NotFoundError('That connection no longer exists.');
  return connection;
}

/** The platform an order channel bills as: the sandbox's `actsAs`, or the provider itself. */
export function platformCodeOf(connection) {
  return connection.provider === 'SANDBOX_PLATFORM' ? connection.config?.actsAs ?? 'ZOMATO' : connection.provider;
}

const businessDateNow = (ctx) => todayBusinessDate(ctx);

/** Our dish, size and extras for each platform item, or null for an unmapped one. */
async function mappingsFor(ctx, connection, items) {
  const mappings = await PlatformItemMapping.find({
    restaurantId: ctx.restaurantId,
    connectionId: connection._id,
    externalItemId: { $in: [...new Set(items.map((item) => item.externalItemId))] },
  }).lean();
  return items.map(
    (item) =>
      mappings.find((mapping) => mapping.externalItemId === item.externalItemId && (mapping.externalVariantId ?? null) === (item.externalVariantId ?? null)) ??
      null,
  );
}

/** Why an order needs a person, worked out now: a mapping may have been fixed since it arrived. */
async function attentionFor(ctx, connection, order, existing = []) {
  const reasons = new Set(existing.filter((reason) => reason === ATTENTION_REASONS.DAY_CLOSED));
  const mappings = await mappingsFor(ctx, connection, order.items);
  if (mappings.some((mapping) => !mapping)) reasons.add(ATTENTION_REASONS.UNMAPPED_ITEMS);
  if (order.paymentMode === 'CASH_ON_DELIVERY') reasons.add(ATTENTION_REASONS.CASH_ON_DELIVERY);
  if (order.deliveredBy === 'RESTAURANT') reasons.add(ATTENTION_REASONS.RESTAURANT_DELIVERY);
  const method = await PaymentMethod.findOne({ restaurantId: ctx.restaurantId, isActive: true, platformCode: platformCodeOf(connection) }).select('_id');
  if (!method) reasons.add(ATTENTION_REASONS.NO_PLATFORM_PAYMENT_METHOD);
  if (order.packagingChargeInPaise > 0 && !connection.config?.packagingItemId) reasons.add(ATTENTION_REASONS.PACKAGING_NOT_MAPPED);
  return { reasons: [...reasons], mappings };
}

function pushHistory(record, status, { by = null, note = null } = {}) {
  record.history.push({ status, at: nowUtc(), by, note });
}

/** Our order lines for a platform order, at the platform's prices. */
function lineRequestsFor(connection, order, mappings) {
  const lines = order.items.map((item, index) => {
    const mapping = mappings[index];
    const addOnIds = [];
    const platformAddOnPrices = {};
    for (const addOn of item.addOns ?? []) {
      const ours = mapping.addOnMap?.[addOn.externalId];
      if (!ours) continue;
      addOnIds.push(ours);
      platformAddOnPrices[String(ours)] = addOn.priceInPaise;
    }
    return {
      menuItemId: String(mapping.menuItemId),
      ...(mapping.variantId ? { variantId: String(mapping.variantId) } : {}),
      quantity: item.quantity,
      addOnIds,
      platformAddOnPrices,
      platformUnitPriceInPaise: item.unitPriceInPaise,
      notes: item.note ?? null,
    };
  });
  if (order.packagingChargeInPaise > 0 && connection.config?.packagingItemId) {
    lines.push({ menuItemId: String(connection.config.packagingItemId), quantity: 1, addOnIds: [], platformUnitPriceInPaise: order.packagingChargeInPaise });
  }
  return lines;
}

/* --------------------------------------------------------------------------
 * Arrival
 * ----------------------------------------------------------------------- */

/** ORDER_PLACED. Stored once; a duplicate changes nothing. */
async function received(ctx, connection, order) {
  const { reasons } = await attentionFor(ctx, connection, order);
  const now = nowUtc();
  let record;
  try {
    record = await PlatformOrder.create({
      restaurantId: ctx.restaurantId,
      branchId: ctx.branchId,
      connectionId: connection._id,
      provider: connection.provider,
      platformCode: platformCodeOf(connection),
      platformOrderId: order.platformOrderId,
      status: reasons.length > 0 ? PLATFORM_ORDER_STATUSES.NEEDS_ATTENTION : PLATFORM_ORDER_STATUSES.RECEIVED,
      attentionReasons: reasons,
      order,
      acceptBy: order.acceptBy ?? null,
      receivedAt: now,
      businessDate: await businessDateNow(ctx),
      history: [{ status: reasons.length > 0 ? PLATFORM_ORDER_STATUSES.NEEDS_ATTENTION : PLATFORM_ORDER_STATUSES.RECEIVED, at: now, by: null, note: null }],
    });
  } catch (error) {
    if (error?.code === DUPLICATE_KEY) {
      await logEvent(connection, { direction: 'IN', kind: 'ORDER_PLACED', externalId: order.platformOrderId, outcome: 'DUPLICATE' });
      return null;
    }
    throw error;
  }

  // Remember every external item's latest name on its mapping, for the mapping screen.
  for (const item of order.items) {
    await PlatformItemMapping.updateOne(
      { restaurantId: ctx.restaurantId, connectionId: connection._id, externalItemId: item.externalItemId, externalVariantId: item.externalVariantId ?? null },
      { $set: { externalName: item.name, lastSeenAt: now } },
    );
  }

  if (connection.config?.autoAccept && connection.storeOpen !== false && reasons.length === 0) {
    const req = await asIntegration(ctx.restaurantId, ctx.branchId, providerFor(connection.provider)?.name);
    try {
      await acceptPlatformOrder(req, record._id, {});
    } catch {
      // Left waiting on the incoming screen, with why on the record.
    }
  }
  return record;
}

/* --------------------------------------------------------------------------
 * Accept and reject
 * ----------------------------------------------------------------------- */

async function loadPlatformOrder(req, id) {
  const record = await PlatformOrder.findOne({ ...scoped(req), _id: id });
  if (!record) throw new NotFoundError('Platform order not found.');
  return record;
}

/**
 * POST /platform-orders/:id/accept. The platform is told first; only then is
 * our order made. `acknowledgeHandling` lets a person accept cash on delivery
 * or a delivery by our own rider, which they handle by hand.
 */
export async function acceptPlatformOrder(req, id, { prepMinutes, acknowledgeHandling = false }) {
  const record = await loadPlatformOrder(req, id);
  if (!WAITING.includes(record.status)) throw new RequestAlreadyDecidedError(record.status);
  const connection = await loadConnection(req, record.connectionId);
  if (connection.status !== CONNECTION_STATUSES.ACTIVE) throw new IntegrationNotActiveError();

  const { reasons, mappings } = await attentionFor(req, connection, record.order, record.attentionReasons);
  const blocking = reasons.filter((reason) => !HANDLED_BY_STAFF.includes(reason));
  if (blocking.length > 0) {
    record.attentionReasons = reasons;
    await record.save();
    throw new BusinessRuleError(`This order needs attention first: ${blocking.map((reason) => reason.toLowerCase().replaceAll('_', ' ')).join(', ')}.`);
  }
  if (reasons.some((reason) => HANDLED_BY_STAFF.includes(reason)) && !acknowledgeHandling) {
    throw new BusinessRuleError('This order is cash on delivery or delivered by your own rider. Confirm you will handle that, then accept.');
  }
  await assertDayOpen(req, await businessDateNow(req));

  const integration = await asIntegration(req.restaurantId, req.branchId, providerFor(connection.provider)?.name);
  const lines = lineRequestsFor(connection, record.order, mappings);
  const taxTreatmentCheck = await buildLineSnapshots(integration, lines, { platformPrices: true }).catch((error) => error);
  // Something we cannot make (switched off, out of stock): say so before the platform is told yes.
  if (taxTreatmentCheck instanceof Error) throw new BusinessRuleError(`${taxTreatmentCheck.message} Reject it with "Item out of stock", or switch the dish back on.`);

  const minutes = prepMinutes ?? connection.config?.defaultPrepMinutes ?? 20;
  const claimed = await PlatformOrder.findOneAndUpdate(
    { ...scoped(req), _id: record._id, status: { $in: WAITING } },
    { $set: { status: PLATFORM_ORDER_STATUSES.ACCEPTED, decidedBy: req.user.id, decidedAt: nowUtc(), prepMinutes: minutes, attentionReasons: reasons } },
    { new: true },
  );
  if (!claimed) throw new RequestAlreadyDecidedError((await loadPlatformOrder(req, id)).status);

  const adapter = await adapterFor(connection.provider);
  try {
    await withTimeout(adapter.acceptOrder(connection, secretsOf(connection), record.platformOrderId, { prepMinutes: minutes }));
  } catch (error) {
    // Nothing is created here: back to waiting, and the person is told why.
    await PlatformOrder.updateOne(
      { ...scoped(req), _id: record._id, status: PLATFORM_ORDER_STATUSES.ACCEPTED, orderId: null },
      { $set: { status: record.status, decidedBy: null, decidedAt: null } },
    );
    throw error instanceof PartnerCallFailedError ? error : new PartnerCallFailedError(error?.message ?? 'The platform could not be reached.');
  }

  let order;
  try {
    order = await openOrder(integration, {
      orderType: ORDER_TYPES.DELIVERY,
      customerName: record.order.customerName ?? undefined,
      platform: { code: record.platformCode, orderId: record.platformOrderId },
      origin: { kind: ORIGIN_KINDS.PLATFORM_ORDER, id: record._id, reference: referenceOf(record.platformCode, record.platformOrderId) },
      lines,
      platformPrices: true,
    });
    if (connection.config?.autoFire !== false) await fireOrder(integration, { orderId: order._id, version: order.version });
  } catch (error) {
    const failure = `Accepted on ${providerFor(connection.provider)?.name ?? 'the platform'} but not created here. Enter it by hand. (${error?.message ?? 'unknown error'})`.slice(0, 500);
    await PlatformOrder.updateOne(
      { ...scoped(req), _id: record._id },
      { $set: { status: PLATFORM_ORDER_STATUSES.FAILED, failure, ...(order ? { orderId: order._id } : {}) }, $push: { history: { status: PLATFORM_ORDER_STATUSES.FAILED, at: nowUtc(), by: req.user.id, note: failure.slice(0, 300) } } },
    );
    throw new BusinessRuleError(failure);
  }

  claimed.orderId = order._id;
  pushHistory(claimed, PLATFORM_ORDER_STATUSES.ACCEPTED, { by: req.user.id, note: `Prep ${minutes} minutes` });
  await claimed.save();
  return claimed;
}

/** POST /platform-orders/:id/reject. The platform is told; nothing is made here. */
export async function rejectPlatformOrder(req, id, { reasonCode, note = null }) {
  const record = await loadPlatformOrder(req, id);
  if (!WAITING.includes(record.status)) throw new RequestAlreadyDecidedError(record.status);
  const connection = await loadConnection(req, record.connectionId);
  if (connection.status !== CONNECTION_STATUSES.ACTIVE) throw new IntegrationNotActiveError();

  const adapter = await adapterFor(connection.provider);
  try {
    await withTimeout(adapter.rejectOrder(connection, secretsOf(connection), record.platformOrderId, reasonCode));
  } catch (error) {
    throw error instanceof PartnerCallFailedError ? error : new PartnerCallFailedError(error?.message ?? 'The platform could not be reached.');
  }

  const rejected = await PlatformOrder.findOneAndUpdate(
    { ...scoped(req), _id: record._id, status: { $in: WAITING } },
    {
      $set: { status: PLATFORM_ORDER_STATUSES.REJECTED, decidedBy: req.user.id, decidedAt: nowUtc(), rejectReasonCode: reasonCode, rejectNote: note },
      $push: { history: { status: PLATFORM_ORDER_STATUSES.REJECTED, at: nowUtc(), by: req.user.id, note } },
    },
    { new: true },
  );
  if (!rejected) throw new RequestAlreadyDecidedError((await loadPlatformOrder(req, id)).status);

  const label = PLATFORM_REJECT_REASONS.find((reason) => reason.code === reasonCode)?.label ?? reasonCode;
  await recordAudit(req, {
    action: AUDIT_ACTIONS.PLATFORM_ORDER_REJECTED,
    entityType: AUDIT_ENTITY_TYPES.PLATFORM_ORDER,
    entityId: rejected._id,
    entityLabel: referenceOf(rejected.platformCode, rejected.platformOrderId),
    reason: note ? `${label}: ${note}` : label,
    amountInPaise: rejected.order.totalInPaise ?? null,
    details: { provider: rejected.provider, platformOrderId: rejected.platformOrderId, reasonCode },
  });
  return rejected;
}

/* --------------------------------------------------------------------------
 * Pickup: bill and pay
 * ----------------------------------------------------------------------- */

/** Every ticket line still cooking is handed over now; every live line is served. */
async function handOver(integration, orderId) {
  const kots = await Kot.find({ restaurantId: integration.restaurantId, orderId, 'lines.status': 'PENDING' }).select('_id');
  for (const kot of kots) await markKotLinesReady(integration, { kotId: kot._id });
  const at = nowUtc();
  await Order.updateOne(
    { restaurantId: integration.restaurantId, _id: orderId },
    {
      $set: { 'lines.$[live].status': ORDER_LINE_STATUSES.SERVED, 'lines.$[live].servedAt': at, status: ORDER_STATUSES.READY_TO_BILL },
      $inc: { version: 1 },
    },
    { arrayFilters: [{ 'live.status': { $in: [ORDER_LINE_STATUSES.PENDING, ORDER_LINE_STATUSES.FIRED, ORDER_LINE_STATUSES.READY] } }] },
  );
  return loadOrderInTenant(integration, orderId);
}

/**
 * ORDER_PICKED_UP, or staff's "Handed over". As the integration user: bill,
 * the merchant's own discount, then one payment by the platform's method. A
 * platform-funded discount never goes on our bill.
 */
async function pickedUp(ctx, record, { by = null } = {}) {
  if (record.status !== PLATFORM_ORDER_STATUSES.ACCEPTED || !record.orderId) {
    throw new BusinessRuleError('Only an accepted order can be handed over.');
  }
  const connection = await loadConnection(ctx, record.connectionId);
  const integration = await asIntegration(ctx.restaurantId, ctx.branchId, providerFor(connection.provider)?.name);

  const order = await handOver(integration, record.orderId);
  let bill = await createBill(integration, { orderId: order._id, version: order.version });

  const merchant = record.order.merchantDiscountInPaise ?? 0;
  if (merchant > 0) {
    bill = await applyDiscount(integration, bill._id, {
      kind: 'FLAT',
      valueInPaise: Math.min(merchant, bill.subtotalInPaise),
      reasonCode: DISCOUNT_REASONS.find((reason) => reason.code === 'MERCHANT_PROMO')?.code ?? 'MERCHANT_PROMO',
      fundedBy: 'RESTAURANT',
    });
  }

  const method = await PaymentMethod.findOne({ restaurantId: ctx.restaurantId, isActive: true, platformCode: record.platformCode });
  if (method) {
    bill = await recordPayment(integration, bill._id, { method: method.code, amountInPaise: bill.grandTotalInPaise, reference: record.platformOrderId });
  }

  const platformTotal = (record.order.totalInPaise ?? 0) - (record.order.platformDiscountInPaise ?? 0);
  const mismatch = record.order.totalInPaise > 0 && Math.abs(platformTotal - bill.grandTotalInPaise) > ROUNDING_TOLERANCE_PAISE
    ? { oursInPaise: bill.grandTotalInPaise, platformInPaise: platformTotal }
    : null;

  await PlatformOrder.updateOne(
    { restaurantId: ctx.restaurantId, _id: record._id },
    {
      $set: { status: PLATFORM_ORDER_STATUSES.PICKED_UP, billId: bill._id, amountMismatch: mismatch },
      $push: { history: { status: PLATFORM_ORDER_STATUSES.PICKED_UP, at: nowUtc(), by, note: method ? null : 'No payment method for this platform' } },
    },
  );
  return readBill(integration, bill._id);
}

/** POST /platform-orders/:id/handed-over: the rider took it and the platform has not said so. */
export async function handedOver(req, id) {
  const record = await loadPlatformOrder(req, id);
  await pickedUp(ctxOf(record), record, { by: req.user.id });
  return loadPlatformOrder(req, id);
}

/* --------------------------------------------------------------------------
 * Cancelled by the platform
 * ----------------------------------------------------------------------- */

const PREPARED = [ORDER_LINE_STATUSES.READY, ORDER_LINE_STATUSES.SERVED];

async function cancelledByPlatform(ctx, record) {
  const note = 'Cancelled by the platform';
  if (!record.orderId) {
    record.status = PLATFORM_ORDER_STATUSES.CANCELLED_BY_PLATFORM;
    pushHistory(record, record.status, { note });
    await record.save();
    return record;
  }

  const connection = await loadConnection(ctx, record.connectionId);
  const integration = await asIntegration(ctx.restaurantId, ctx.branchId, providerFor(connection.provider)?.name);
  const order = await Order.findOne({ restaurantId: ctx.restaurantId, _id: record.orderId });

  // A closed day changes nothing: the owner reopens it, or sorts it out by hand.
  if (await isDayClosed(integration, record.businessDate)) {
    record.status = PLATFORM_ORDER_STATUSES.NEEDS_ATTENTION;
    record.attentionReasons = [...new Set([...record.attentionReasons, ATTENTION_REASONS.DAY_CLOSED])];
    pushHistory(record, record.status, { note: `${note} on a closed day` });
    await record.save();
    return record;
  }

  if (order?.billId) {
    const bill = await readBill(integration, order.billId);
    if (!bill.isVoided) await voidBill(integration, bill._id, { reasonCode: 'PLATFORM_CANCELLED', note });
  }
  const fresh = await Order.findOne({ restaurantId: ctx.restaurantId, _id: record.orderId });
  if (fresh && ![ORDER_STATUSES.CANCELLED, ORDER_STATUSES.BILLED].includes(fresh.status)) {
    await cancelEveryLine(integration, fresh, note);
  }
  record.status = PLATFORM_ORDER_STATUSES.CANCELLED_BY_PLATFORM;
  pushHistory(record, record.status, { note });
  await record.save();
  return record;
}

/**
 * Cancels every live line with its own answer (made when the kitchen had it
 * ready, not made when it was still cooking or never sent), then the order
 * itself, through the same line-cancel code staff use. One transaction.
 */
async function cancelEveryLine(integration, order, note) {
  const inventoryOn = await isFeatureOn(integration, 'inventory');
  await withOptionalTransaction(async (session) => {
    let current = order;
    let valueInPaise = 0;
    for (const line of order.lines.filter((entry) => entry.status !== ORDER_LINE_STATUSES.CANCELLED)) {
      const wasPrepared = line.status === ORDER_LINE_STATUSES.PENDING ? undefined : PREPARED.includes(line.status);
      assertWasPreparedRule(line.status, wasPrepared);
      valueInPaise += computeLineTotalInPaise(line);
      const fresh = current.lines.id(line._id);
      current = await cancelLineInSession(
        integration,
        { order: current, line: fresh, version: current.version, reasonCode: 'PLATFORM_CANCELLED', note, wasPrepared, inventoryOn },
        session,
      );
    }
    const at = nowUtc();
    await applyVersionedUpdate(integration, {
      orderId: order._id,
      version: current.version,
      update: { $set: { status: ORDER_STATUSES.CANCELLED, isCancelled: true, cancelledAt: at, cancelledBy: integration.user.id, cancelReasonCode: 'PLATFORM_CANCELLED', cancelReason: note } },
      session,
    });
    await recordAudit(
      integration,
      {
        action: AUDIT_ACTIONS.ORDER_CANCELLED,
        entityType: AUDIT_ENTITY_TYPES.ORDER,
        entityId: order._id,
        entityLabel: `Order ${order.orderNumber}`,
        reason: note,
        amountInPaise: valueInPaise,
        details: { orderNumber: order.orderNumber, reasonCode: 'PLATFORM_CANCELLED' },
      },
      session,
    );
  });
}

/* --------------------------------------------------------------------------
 * The job that processes every webhook event, and the outgoing calls
 * ----------------------------------------------------------------------- */

const ORDER_EVENTS = {
  ORDER_PLACED: (ctx, connection, event) => received(ctx, connection, event.order),
  ORDER_CANCELLED: (ctx, _connection, _event, record) => record && cancelledByPlatform(ctx, record),
  ORDER_PICKED_UP: (ctx, _connection, _event, record) => record && pickedUp(ctx, record),
  ORDER_DELIVERED: (_ctx, _connection, _event, record) => {
    if (!record) return null;
    record.status = PLATFORM_ORDER_STATUSES.DELIVERED;
    pushHistory(record, record.status);
    return record.save();
  },
  RIDER_ASSIGNED: (_ctx, _connection, _event, record) => {
    if (!record) return null;
    pushHistory(record, record.status, { note: 'Rider assigned' });
    return record.save();
  },
  RIDER_ARRIVED: (_ctx, _connection, _event, record) => {
    if (!record) return null;
    pushHistory(record, record.status, { note: 'Rider arrived' });
    return record.save();
  },
};

/** Runs one webhook event. A Pine Labs postback is handled by its own module. */
export async function processWebhookEvent(job) {
  const ctx = ctxOf(job);
  const connection = await loadConnection(ctx, job.connectionId);
  const event = job.payload?.event ?? {};
  if (providerFor(connection.provider)?.kind !== PROVIDER_KINDS.ORDER_CHANNEL) {
    // A card machine's postback (Part I) is processed by its own module.
    const terminals = await import('./terminals/terminalService.js').catch(() => null);
    return terminals ? terminals.processTerminalEvent(job, connection) : { ignored: 'No terminal module.' };
  }
  const handler = ORDER_EVENTS[event.type];
  if (!handler) return { ignored: event.type };
  const record = event.type === 'ORDER_PLACED'
    ? null
    : await PlatformOrder.findOne({ restaurantId: ctx.restaurantId, connectionId: connection._id, platformOrderId: event.platformOrderId });
  await handler(ctx, connection, event, record);
  return { type: event.type };
}

/** Queues one outgoing call to an order channel, for the job runner. */
export function queueChannelCall(ctx, connection, call, args, dedupeKey = null, { runAfter = undefined } = {}) {
  return enqueueJob(ctx, { connectionId: connection._id, type: CHANNEL_CALL, payload: { call, args }, dedupeKey, ...(runAfter ? { runAfter } : {}) });
}

/** Runs one queued outgoing call. */
export async function runChannelCall(job) {
  const connection = await loadConnection(ctxOf(job), job.connectionId);
  if (connection.status !== CONNECTION_STATUSES.ACTIVE) return { skipped: 'The connection is not on.' };
  const adapter = await adapterFor(connection.provider);
  const { call, args } = job.payload;
  const secrets = secretsOf(connection);
  if (call === 'markFoodReady') return adapter.markFoodReady(connection, secrets, args.platformOrderId);
  if (call === 'setItemAvailability') return adapter.setItemAvailability(connection, secrets, args.items);
  if (call === 'setStoreStatus') return adapter.setStoreStatus(connection, secrets, { open: args.open });
  if (call === 'pushMenu') return adapter.pushMenu(connection, secrets, args.menu);
  throw new Error(`Unknown channel call ${call}.`);
}

registerJobHandler(PROCESS_WEBHOOK_EVENT, processWebhookEvent);
registerJobHandler(CHANNEL_CALL, runChannelCall);

/* --------------------------------------------------------------------------
 * Hooks from the kitchen and the menu
 * ----------------------------------------------------------------------- */

/** Called after a kitchen line turns ready: once every live line is, tell the platform. */
export async function notifyFoodReadyIfDone(req, orderId) {
  const order = await Order.findOne({ ...scoped(req), _id: orderId }).select('origin lines status').lean();
  if (order?.origin?.kind !== ORIGIN_KINDS.PLATFORM_ORDER) return null;
  const live = order.lines.filter((line) => line.status !== ORDER_LINE_STATUSES.CANCELLED);
  if (live.length === 0 || !live.every((line) => PREPARED.includes(line.status))) return null;
  const record = await PlatformOrder.findOne({ ...scoped(req), _id: order.origin.id });
  if (!record) return null;
  const connection = await loadConnection(req, record.connectionId);
  // P29 Part E. A minute's wait, so a wrong tick undone in the kitchen never reaches the platform.
  return queueChannelCall(req, connection, 'markFoodReady', { platformOrderId: record.platformOrderId }, foodReadyKey(record._id), {
    runAfter: new Date(nowUtc().getTime() + FOOD_READY_DELAY_MS),
  });
}

/** P29 Part E. How long a "food is ready" call waits, so an undo can stop it. */
export const FOOD_READY_DELAY_MS = 60_000;
const foodReadyKey = (platformOrderRecordId) => `ready:${platformOrderRecordId}`;

/**
 * P29 Part E. A kitchen undo on a platform order. Stops the queued "food is
 * ready" call while it still waits, and frees its key so the next ready queues
 * a fresh one. Returns `{ platformAlreadyTold }`: true when the call had
 * already run, so the screen can say the platform was told.
 */
export async function cancelFoodReadyIfQueued(req, orderId) {
  const order = await Order.findOne({ ...scoped(req), _id: orderId }).select('origin').lean();
  if (order?.origin?.kind !== ORIGIN_KINDS.PLATFORM_ORDER) return { platformAlreadyTold: false };
  const key = foodReadyKey(order.origin.id);
  const job = await IntegrationJob.findOne({ ...scoped(req), dedupeKey: key });
  if (!job) return { platformAlreadyTold: false };
  if (job.status === JOB_STATUSES.QUEUED) {
    const stopped = await IntegrationJob.updateOne(
      { ...scoped(req), _id: job._id, status: JOB_STATUSES.QUEUED },
      { $set: { status: JOB_STATUSES.CANCELLED, dedupeKey: `${key}:cancelled:${job._id}`, lastError: 'Stopped by a kitchen undo' } },
    );
    if (stopped.modifiedCount === 1) return { platformAlreadyTold: false };
  }
  return { platformAlreadyTold: true };
}

/**
 * Called after a dish or size is switched in or out of stock: one
 * availability call for every active channel where it is mapped.
 */
export async function queueAvailabilityFor(req, menuItemId) {
  const item = await MenuItem.findOne({ ...scoped(req), _id: menuItemId }).select('isAvailable variants').lean();
  if (!item) return [];
  const mappings = await PlatformItemMapping.find({ ...scoped(req), menuItemId }).lean();
  const byConnection = new Map();
  for (const mapping of mappings) {
    const variant = mapping.variantId ? item.variants.find((entry) => String(entry._id) === String(mapping.variantId)) : null;
    const available = item.isAvailable && (variant ? variant.isAvailable !== false : true);
    const list = byConnection.get(String(mapping.connectionId)) ?? [];
    list.push({ externalItemId: mapping.externalItemId, externalVariantId: mapping.externalVariantId ?? null, available });
    byConnection.set(String(mapping.connectionId), list);
  }
  const queued = [];
  for (const [connectionId, items] of byConnection) {
    const connection = await IntegrationConnection.findOne({ ...scoped(req), _id: connectionId });
    if (!connection || connection.status !== CONNECTION_STATUSES.ACTIVE) continue;
    if (!(await adapterFor(connection.provider))?.capabilities?.itemAvailability) continue;
    queued.push(await queueChannelCall(req, connection, 'setItemAvailability', { items }));
  }
  return queued;
}

/* --------------------------------------------------------------------------
 * Reads, store status, menu push
 * ----------------------------------------------------------------------- */

export async function listPlatformOrders(req, { status = null, date = null, page = 1, limit = 50 }) {
  const filter = { ...scoped(req) };
  if (status === 'WAITING') filter.status = { $in: WAITING };
  else if (status) filter.status = status;
  if (date) filter.businessDate = date;
  const [rows, total] = await Promise.all([
    PlatformOrder.find(filter).sort({ receivedAt: -1 }).skip((page - 1) * limit).limit(limit),
    PlatformOrder.countDocuments(filter),
  ]);
  return { rows, total, page, limit };
}

export const readPlatformOrder = loadPlatformOrder;

/** POST /integrations/:provider/store-status. */
export async function setStoreStatus(req, provider, { open }) {
  const connection = await IntegrationConnection.findOne({ ...scoped(req), provider });
  if (!connection || connection.status !== CONNECTION_STATUSES.ACTIVE) throw new IntegrationNotActiveError();
  if (providerFor(provider)?.kind !== PROVIDER_KINDS.ORDER_CHANNEL) throw new BusinessRuleError('Only a delivery platform has a store to open or close.');
  connection.storeOpen = open;
  await connection.save();
  await queueChannelCall(req, connection, 'setStoreStatus', { open });
  return { provider, storeOpen: open };
}

/** POST /integrations/:provider/menu-push. Availability, never prices. */
export async function pushMenu(req, provider) {
  const connection = await IntegrationConnection.findOne({ ...scoped(req), provider });
  if (!connection || connection.status !== CONNECTION_STATUSES.ACTIVE) throw new IntegrationNotActiveError();
  const adapter = await adapterFor(provider);
  if (!adapter?.capabilities?.menuPush) throw new BusinessRuleError('This platform does not take a menu from here.');
  const mappings = await PlatformItemMapping.find({ ...scoped(req), connectionId: connection._id }).lean();
  const items = await MenuItem.find({ ...scoped(req), _id: { $in: mappings.map((mapping) => mapping.menuItemId) } }).select('isAvailable').lean();
  const available = new Map(items.map((item) => [String(item._id), item.isAvailable]));
  const menu = {
    categories: [],
    items: mappings.map((mapping) => ({ externalItemId: mapping.externalItemId, externalVariantId: mapping.externalVariantId ?? null, available: available.get(String(mapping.menuItemId)) ?? false })),
  };
  await queueChannelCall(req, connection, 'pushMenu', { menu });
  return { queued: true, items: menu.items.length };
}

