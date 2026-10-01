/**
 * Orders. Shapes come from Part 4 section M2.2 of docs/PROJECT-PLAN.md.
 *
 * Two things in this file are load-bearing and neither is obvious from reading
 * the happy path:
 *
 * Every price on a line is written by the server from the menu item, never sent
 * by the client. services/orderService.js does that copying.
 *
 * Every write goes through applyVersionedUpdate, which puts the client's
 * version into the update filter. There is no read-modify-save anywhere in
 * here, on purpose. See the note at the bottom of models/Order.js.
 */
import {
  LINE_CANCEL_REASONS,
  ORDER_CANCEL_REASONS,
  reasonText,
} from '../config/cancelReasons.js';
import { platformByCode } from '../config/platforms.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { COUNTER_NAMES } from '../models/Counter.js';
import {
  OCCUPYING_ORDER_STATUSES,
  Order,
  ORDER_LINE_STATUSES,
  PREPARED_LINE_STATUSES,
  ORDER_STATUSES,
  ORDER_TYPES,
  TAX_TREATMENTS,
} from '../models/Order.js';
import { Table } from '../models/Table.js';
import { recordAudit } from '../services/auditService.js';
import { nextNumber } from '../services/counterService.js';
import { cancelKotLinesFor, fireOrder as fireOrderToKitchen } from '../services/kitchenService.js';
// M4. wasPrepared: false means the kitchen had already deducted for this line
// and it was never actually made, so the ingredients go back. Keyed on the
// ledger, not on the flag alone -- see stockMovementService.js.
import { returnStockForCancelledLine } from '../services/stockMovementService.js';
import { getSetting, isFeatureOn } from '../services/settingsService.js';
import {
  applyVersionedUpdate,
  assertOrderIsOpen,
  assertOrderWasPreparedRule,
  assertWasPreparedRule,
  buildLineSnapshots,
  computeLineTotalInPaise,
  findLine,
  isReadyToBill,
  loadOrderInTenant,
  serialiseOrder,
} from '../services/orderService.js';
import { BusinessRuleError, DuplicateError, NotFoundError, TableOccupiedError } from '../utils/errors.js';
import { sumPaise } from '../utils/money.js';
import { sendList, sendSuccess } from '../utils/response.js';
import { scoped } from '../utils/scopedQuery.js';
import { withOptionalTransaction } from '../utils/transaction.js';
import { nowUtc } from '../utils/time.js';

const MONGO_DUPLICATE_KEY = 11000;

/**
 * Confirms a table exists in this tenant and can take an order.
 *
 * 404 when it does not exist or belongs to another restaurant, 422 when it
 * exists but is switched off. The same split as M1's assertCategoryUsable, for
 * the same reason: "you named something that isn't there" and "you named
 * something real that cannot be used right now" are different answers and the
 * floor view shows different things for each.
 *
 * Part 4 does not spell out the inactive case. A table is only ever switched
 * off while nothing is open on it, so seating a new party on one would quietly
 * undo that decision.
 */
async function assertTableUsable(req, tableId) {
  const table = await Table.findOne({ ...scoped(req), _id: tableId });
  if (!table) throw new NotFoundError('Table not found.');
  if (!table.isActive) {
    throw new BusinessRuleError(`Table ${table.name} is turned off. Turn it back on to seat anyone.`);
  }
  return table;
}

/**
 * Turns the partial unique index's duplicate key error into the contract's 409.
 *
 * This is the two waiters problem landing, and it is meant to land here. The
 * index on (restaurantId, tableId, status) filtered to OCCUPYING_ORDER_STATUSES
 * means the database refuses the second insert; nothing in this file checks
 * first, because a check followed by a write has a gap in the middle and
 * Friday night will find it.
 *
 * The lookup below uses the same status list as the index, for the same
 * reason: a table holding a READY_TO_BILL order is occupied too, and a query
 * that only matched OPEN would find nothing and answer as if the table were
 * actually free when the index just said otherwise.
 *
 * The existing order's id goes back with the error so the client opens that
 * order rather than showing the second waiter a dead end.
 */
async function rethrowTableConflict(req, tableId, error) {
  const isDuplicate = error?.code === MONGO_DUPLICATE_KEY;
  const onTableIndex = Object.hasOwn(error?.keyPattern ?? {}, 'tableId');

  if (!isDuplicate || !onTableIndex) throw error;

  const existing = await Order.findOne({
    ...scoped(req),
    tableId,
    status: { $in: OCCUPYING_ORDER_STATUSES },
  }).select('_id');

  throw new TableOccupiedError(existing?._id);
}

/**
 * P06. The platform order index refused a second live order with the same
 * platform number. Turned into a 409 naming the order that already has it, so
 * the counter can open that one instead of entering it twice.
 */
async function rethrowPlatformConflict(req, platform, error) {
  const isDuplicate = error?.code === MONGO_DUPLICATE_KEY;
  const onPlatformIndex = Object.hasOwn(error?.keyPattern ?? {}, 'platform.orderId');
  if (!isDuplicate || !onPlatformIndex) throw error;

  const existing = await Order.findOne({
    ...scoped(req),
    'platform.code': platform.code,
    'platform.orderId': platform.orderId,
    isCancelled: false,
  }).select('_id orderNumber');

  throw new DuplicateError(
    `${platform.name} order ${platform.orderId} is already entered as order ${existing?.orderNumber ?? '?'}.`,
    { 'platform.orderId': 'Already entered.' },
    existing ? { existingOrderId: String(existing._id) } : undefined,
  );
}

/** POST /orders */
export async function createOrder(req, res) {
  const { orderType, tableId, guestCount, customerName, customerPhone, lines, platform } = req.body;

  const isDineIn = orderType === ORDER_TYPES.DINE_IN;
  const table = isDineIn ? await assertTableUsable(req, tableId) : null;

  /**
   * P06. A delivery order freezes its platform, with the name from the list,
   * and its tax treatment: when the platform collects the GST, every line on
   * this order is frozen at 0%, now and for lines added later.
   */
  const listed = platform ? platformByCode(platform.code) : null;
  const frozenPlatform = listed ? { code: listed.code, name: listed.name, orderId: platform.orderId } : null;
  const taxTreatment =
    orderType === ORDER_TYPES.DELIVERY &&
    listed &&
    (await getSetting(req.restaurantId, 'delivery.platformCollectsGst', { req }))
      ? TAX_TREATMENTS.PLATFORM_COLLECTS
      : TAX_TREATMENTS.NORMAL;

  const snapshotLines = lines?.length ? await buildLineSnapshots(req, lines, { taxTreatment }) : [];

  /**
   * The number is reserved before the document is written, so a failed insert
   * leaves a gap in the sequence rather than reusing a number. That is the
   * agreed trade for orders and kitchen tickets, and explicitly not the trade
   * M3 can make for bills. See models/Counter.js.
   */
  const orderNumber = await nextNumber({
    restaurantId: req.restaurantId,
    branchId: req.branchId,
    name: COUNTER_NAMES.ORDER,
  });

  const order = new Order({
    ...scoped(req),
    orderNumber,
    orderType,
    tableId: table?._id ?? null,
    // Snapshot, so renaming T1 to "Window 1" next month does not rewrite this.
    tableName: table?.name ?? null,
    guestCount: guestCount ?? null,
    customerName: customerName ?? null,
    customerPhone: customerPhone ?? null,
    platform: frozenPlatform,
    taxTreatment,
    lines: snapshotLines,
    openedBy: req.user.id,
    openedAt: nowUtc(),
  });

  const saved = await order
    .save()
    .catch((error) => rethrowPlatformConflict(req, frozenPlatform, error))
    .catch((error) => rethrowTableConflict(req, tableId, error));

  req.log?.info(
    {
      actorId: req.user.id,
      orderId: String(saved._id),
      orderNumber: saved.orderNumber,
      orderType: saved.orderType,
      lineCount: snapshotLines.length,
    },
    'Order opened.',
  );

  return sendSuccess(res, serialiseOrder(saved), 201);
}

/**
 * GET /orders
 *
 * Paginated, unlike the floor view's table list. An order list grows without
 * bound over the life of a restaurant.
 */
export async function listOrders(req, res) {
  const { page, limit, status, orderType, tableId } = req.query;

  const filter = { ...scoped(req) };
  if (status !== undefined) filter.status = { $in: status };
  if (orderType !== undefined) filter.orderType = orderType;
  if (tableId !== undefined) filter.tableId = tableId;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);

  // The same serialisation as a single read, totals included. A list of orders
  // that could not show a running total would send every screen back for a
  // second request per row.
  return sendList(res, orders.map(serialiseOrder), { page, limit, total });
}

/** GET /orders/:orderId */
export async function getOrder(req, res) {
  const order = await loadOrderInTenant(req, req.params.orderId);
  return sendSuccess(res, serialiseOrder(order));
}

/**
 * POST /orders/:orderId/lines
 *
 * The client sends ids and a quantity. Every price, name and tax rate on the
 * stored line is copied here from the menu item, and after this nothing reads
 * the menu for a price again.
 */
export async function addOrderLines(req, res) {
  const { orderId } = req.params;
  const { version, lines } = req.body;

  const order = await loadOrderInTenant(req, orderId);
  assertOrderIsOpen(order);

  /**
   * Snapshotted before the write, on the order as we last read it. If someone
   * else changes the order in between, the version in the update filter will
   * not match and nothing is written, so the worst case is wasted work rather
   * than a line priced against a stale read.
   */
  // P06: a PLATFORM_COLLECTS order freezes every new line at 0% too.
  const snapshotLines = await buildLineSnapshots(req, lines, { taxTreatment: order.taxTreatment });

  const updated = await applyVersionedUpdate(req, {
    orderId,
    version,
    update: { $push: { lines: { $each: snapshotLines } } },
  });

  req.log?.info(
    {
      actorId: req.user.id,
      orderId: String(updated._id),
      orderNumber: updated.orderNumber,
      addedLines: snapshotLines.length,
    },
    'Lines added to order.',
  );

  return sendSuccess(res, serialiseOrder(updated));
}

/**
 * PATCH /orders/:orderId/lines/:lineId
 *
 * Quantity and notes only. Changing what was ordered is a cancel plus a new
 * line, because the snapshot on a line has to keep being the thing that was
 * actually ordered.
 */
export async function editOrderLine(req, res) {
  const { orderId, lineId } = req.params;
  const { version, quantity, notes } = req.body;

  const order = await loadOrderInTenant(req, orderId);
  assertOrderIsOpen(order);

  const line = findLine(order, lineId);
  if (line.status !== ORDER_LINE_STATUSES.PENDING) {
    throw new BusinessRuleError(
      'The kitchen already has this one. It can be cancelled, but not changed.',
    );
  }

  const changes = {};
  if (quantity !== undefined) changes['lines.$[line].quantity'] = quantity;
  if (notes !== undefined) changes['lines.$[line].notes'] = notes;

  const updated = await applyVersionedUpdate(req, {
    orderId,
    version,
    update: { $set: changes },
    /**
     * The positional filter carries the line's status as well as its id. If the
     * line is fired between the read above and this write, the filter matches
     * nothing, the update touches no line, and the version check still passes
     * because the order itself did change. Belt and braces, cheaply.
     */
    arrayFilters: [{ 'line._id': lineId, 'line.status': ORDER_LINE_STATUSES.PENDING }],
  });

  return sendSuccess(res, serialiseOrder(updated));
}

/**
 * POST /orders/:orderId/lines/:lineId/cancel
 *
 * The line is never removed from the array. It keeps every snapshot value and
 * becomes evidence: who cancelled it, when, why, and whether the kitchen had
 * already made it.
 */
export async function cancelOrderLine(req, res) {
  const { orderId, lineId } = req.params;
  const { version, reasonCode, note, wasPrepared } = req.body;

  const order = await loadOrderInTenant(req, orderId);
  assertOrderIsOpen(order);

  const line = findLine(order, lineId);
  if (line.status === ORDER_LINE_STATUSES.CANCELLED) {
    throw new BusinessRuleError('That line is already cancelled.');
  }

  // 400 when the question does not apply, 422 when it does and was not
  // answered. See the note on this function.
  assertWasPreparedRule(line.status, wasPrepared);

  const inventoryOn = await isFeatureOn(req, 'inventory');

  const updated = await withOptionalTransaction(async (session) => {
    const order2 = await applyVersionedUpdate(req, {
      orderId,
      version,
      update: {
        $set: {
          'lines.$[line].status': ORDER_LINE_STATUSES.CANCELLED,
          'lines.$[line].cancelledAt': nowUtc(),
          'lines.$[line].cancelledBy': req.user.id,
          'lines.$[line].cancelReasonCode': reasonCode,
          // P04: the free-text field now holds the optional note.
          'lines.$[line].cancelReason': note ?? null,
          'lines.$[line].wasPrepared': wasPrepared ?? null,
        },
      },
      arrayFilters: [{ 'line._id': lineId }],
      session,
    });

    /**
     * P04. Food the kitchen made and that nobody will pay for is an exception
     * an owner needs to see. Written inside the same transaction, so a cancel
     * that rolls back (a version conflict, say) leaves no audit line behind.
     * A line cancelled before preparation writes nothing: that is normal
     * operation, and normal operation is not audited.
     */
    if (wasPrepared === true) {
      await recordAudit(
        req,
        {
          action: AUDIT_ACTIONS.LINE_CANCELLED_AFTER_PREP,
          entityType: AUDIT_ENTITY_TYPES.ORDER,
          entityId: order._id,
          entityLabel: `Order ${order.orderNumber}`,
          reason: reasonText(LINE_CANCEL_REASONS, reasonCode, note),
          amountInPaise: computeLineTotalInPaise(line),
          details: {
            lineId: String(line._id),
            itemName: line.itemName,
            variantName: line.variantName ?? null,
            quantity: line.quantity,
            reasonCode,
            tableName: order.tableName ?? null,
          },
        },
        session,
      );
    }

    // If it reached the kitchen, take it off the ticket too, or the pass keeps
    // cooking a dish the floor has already voided.
    await cancelKotLinesFor(req, { orderId, orderLineIds: [line._id] }, session);

    // M4: it never got made, so whatever was deducted for it comes back.
    // A safe no-op if the line was still PENDING and nothing was ever
    // deducted for it in the first place.
    // P02: with inventory switched off nothing was deducted, so nothing returns.
    if (wasPrepared === false && inventoryOn) {
      await returnStockForCancelledLine(req, { orderLineId: line._id, orderId }, session);
    }

    return order2;
  });

  req.log?.info(
    {
      actorId: req.user.id,
      role: req.user.role,
      orderId: String(updated._id),
      orderNumber: updated.orderNumber,
      lineId: String(lineId),
      previousStatus: line.status,
      wasPrepared: wasPrepared ?? null,
    },
    'Order line cancelled.',
  );

  return sendSuccess(res, serialiseOrder(updated));
}

/**
 * POST /orders/:orderId/fire
 *
 * Everything pending goes to the kitchen as one new ticket. The work is in
 * services/kitchenService.js, because it writes an order and a KOT together
 * and those two must not drift.
 */
export async function fireOrder(req, res) {
  const { kot, kots, order } = await fireOrderToKitchen(req, {
    orderId: req.params.orderId,
    version: req.body.version,
  });

  // P05: `kots` is every ticket, one per station; `kot` is the first of them.
  return sendSuccess(res, { kot, kots, order });
}

/**
 * PATCH /orders/:orderId/lines/:lineId/served
 *
 * The one place M2 moves an order's own status without being asked to. When
 * the last live line is served there is nothing left to do on the floor, so the
 * order goes to the cashier's queue by itself.
 */
export async function markLineServed(req, res) {
  const { orderId, lineId } = req.params;
  const { version } = req.body;

  const order = await loadOrderInTenant(req, orderId);
  assertOrderIsOpen(order);

  const line = findLine(order, lineId);
  if (line.status !== ORDER_LINE_STATUSES.READY) {
    throw new BusinessRuleError(
      line.status === ORDER_LINE_STATUSES.SERVED
        ? 'That one has already been served.'
        : 'The kitchen has not marked that ready yet.',
    );
  }

  const servedAt = nowUtc();

  /**
   * Whether this is the last one is worked out from the order as read, with
   * this line counted as served. If someone else changes the order in between,
   * the version filter rejects the write and none of this is applied, so the
   * conclusion cannot be acted on while stale.
   */
  const linesAfter = order.lines.map((existing) =>
    String(existing._id) === String(lineId)
      ? { status: ORDER_LINE_STATUSES.SERVED }
      : { status: existing.status },
  );

  const closesTheOrder = isReadyToBill(linesAfter);

  const update = {
    $set: {
      'lines.$[line].status': ORDER_LINE_STATUSES.SERVED,
      'lines.$[line].servedAt': servedAt,
      ...(closesTheOrder
        ? { status: ORDER_STATUSES.READY_TO_BILL, readyToBillAt: servedAt }
        : {}),
    },
  };

  const updated = await applyVersionedUpdate(req, {
    orderId,
    version,
    update,
    arrayFilters: [{ 'line._id': lineId, 'line.status': ORDER_LINE_STATUSES.READY }],
  });

  if (closesTheOrder) {
    req.log?.info(
      { actorId: req.user.id, orderId: String(updated._id), orderNumber: updated.orderNumber },
      'Order ready to bill.',
    );
  }

  return sendSuccess(res, serialiseOrder(updated));
}

/**
 * PATCH /orders/:orderId/table
 *
 * `tableName` is re-snapshotted to the new table, because it describes where
 * the order is now, not where it started.
 */
export async function moveOrderToTable(req, res) {
  const { orderId } = req.params;
  const { version, tableId } = req.body;

  const order = await loadOrderInTenant(req, orderId);
  assertOrderIsOpen(order);

  if (order.orderType !== ORDER_TYPES.DINE_IN) {
    throw new BusinessRuleError('A takeaway order is not on a table, so it cannot be moved to one.');
  }

  const table = await assertTableUsable(req, tableId);

  const updated = await applyVersionedUpdate(req, {
    orderId,
    version,
    update: { $set: { tableId: table._id, tableName: table.name } },
  }).catch((error) => rethrowTableConflict(req, tableId, error));

  req.log?.info(
    {
      actorId: req.user.id,
      orderId: String(updated._id),
      orderNumber: updated.orderNumber,
      fromTable: order.tableName,
      toTable: table.name,
    },
    'Order moved to another table.',
  );

  return sendSuccess(res, serialiseOrder(updated));
}

/**
 * POST /orders/:orderId/cancel
 *
 * OWNER and MANAGER only, and that is the whole point of the endpoint.
 *
 * A waiter can cancel one line, which is an ordinary correction. Making a whole
 * table disappear is the move a dishonest staff member uses to pocket a cash
 * bill, and it is the exact gap restaurant owners lose money to today. The
 * route gating is in routes/orderRoutes.js; this comment is here because this
 * is where someone would come to "simplify" it.
 *
 * Nothing is deleted. The order and every line stay in the database forever.
 */
export async function cancelOrder(req, res) {
  const { orderId } = req.params;
  const { version, reasonCode, note, wasPrepared } = req.body;

  const order = await loadOrderInTenant(req, orderId);

  if (order.status === ORDER_STATUSES.CANCELLED) {
    throw new BusinessRuleError('That order is already cancelled.');
  }
  if (order.status === ORDER_STATUSES.BILLED) {
    throw new BusinessRuleError('That order has been billed. A bill is voided, not cancelled.');
  }

  // One answer covers every fired line: the manager is answering "did the
  // kitchen make any of this", not auditing it dish by dish.
  assertOrderWasPreparedRule(order, wasPrepared);

  const now = nowUtc();

  const liveLines = order.lines.filter((line) => line.status !== ORDER_LINE_STATUSES.CANCELLED);
  const stillLive = liveLines.map((line) => line._id);
  const liveValueInPaise = sumPaise(...liveLines.map(computeLineTotalInPaise));

  const inventoryOn = await isFeatureOn(req, 'inventory');

  const updated = await withOptionalTransaction(async (session) => {
    const cancelled = await applyVersionedUpdate(req, {
      orderId,
      version,
      update: {
        $set: {
          status: ORDER_STATUSES.CANCELLED,
          isCancelled: true,
          cancelledAt: now,
          cancelledBy: req.user.id,
          cancelReasonCode: reasonCode,
          // P04: the free-text field now holds the optional note.
          cancelReason: note ?? null,
          // Every line that is not already cancelled goes with it, keeping its
          // own snapshot. The positional filter leaves already-cancelled lines
          // alone so their original reason and wasPrepared survive.
          'lines.$[live].status': ORDER_LINE_STATUSES.CANCELLED,
          'lines.$[live].cancelledAt': now,
          'lines.$[live].cancelledBy': req.user.id,
          'lines.$[live].cancelReason': note ?? null,
          // The order's reasons are a different list from a line's. The line
          // keeps the note; its code stays null rather than borrowing an order
          // code the line enum does not contain.
          /**
           * The one answer only lands on lines that actually reached the
           * kitchen. A line still PENDING was never fired, so no stock was
           * ever deducted for it and there is nothing to give back; writing
           * "yes it was made" onto it would be recording something untrue.
           *
           * This is the same rule the single-line cancel enforces, where
           * answering for a line that never went to the kitchen is a 400. The
           * whole-order path used to contradict it by writing the answer onto
           * every live line.
           *
           * arrayFilters are matched against the document as it was before
           * this update, so `kitchen` selects the lines that were FIRED,
           * READY or SERVED going in.
           */
          'lines.$[kitchen].wasPrepared': wasPrepared ?? null,
        },
      },
      arrayFilters: [
        { 'live.status': { $ne: ORDER_LINE_STATUSES.CANCELLED } },
        { 'kitchen.status': { $in: [...PREPARED_LINE_STATUSES] } },
      ],
      session,
    });

    await cancelKotLinesFor(req, { orderId, orderLineIds: stillLive }, session);

    /**
     * P04. ORDER_CANCELLED was in the audit list from M3 and nothing wrote it,
     * so a table could disappear without a trace. Every whole-order cancel
     * writes one line now, inside the transaction, carrying the value of every
     * line that was still live.
     */
    await recordAudit(
      req,
      {
        action: AUDIT_ACTIONS.ORDER_CANCELLED,
        entityType: AUDIT_ENTITY_TYPES.ORDER,
        entityId: order._id,
        entityLabel: `Order ${order.orderNumber}`,
        reason: reasonText(ORDER_CANCEL_REASONS, reasonCode, note),
        amountInPaise: liveValueInPaise,
        details: {
          orderNumber: order.orderNumber,
          tableName: order.tableName ?? null,
          lineCount: stillLive.length,
          reasonCode,
          wasPrepared: wasPrepared ?? null,
        },
      },
      session,
    );

    /**
     * M4: the same one-answer-covers-the-whole-order rule as wasPrepared
     * itself. Called for every live line, including ones that were still
     * PENDING and never fired -- returnStockForCancelledLine reads the ledger
     * for each and is a safe no-op wherever there is nothing to return.
     */
    if (wasPrepared === false && inventoryOn) {
      for (const orderLineId of stillLive) {
        await returnStockForCancelledLine(req, { orderLineId, orderId }, session);
      }
    }

    return cancelled;
  });

  req.log?.warn(
    {
      actorId: req.user.id,
      role: req.user.role,
      orderId: String(updated._id),
      orderNumber: updated.orderNumber,
      lineCount: updated.lines.length,
      wasPrepared: wasPrepared ?? null,
    },
    'Whole order cancelled.',
  );

  return sendSuccess(res, serialiseOrder(updated));
}
