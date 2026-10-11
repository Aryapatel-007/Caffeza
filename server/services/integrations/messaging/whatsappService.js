/**
 * WhatsApp: sending, templates, the receipt and what guests send back. P37,
 * API-CONTRACT "P37", DB-SCHEMA section 47.
 *
 * `sendTemplate` is the one way a message to a guest is queued. It refuses a
 * connection that is not on and a template Meta has not approved, gates a
 * marketing template on live offers consent through `assertMayReceive`, and
 * queues the send as a job whose idempotency key is the job's `dedupeKey`, on
 * a unique index: the same key twice never sends a guest two copies.
 *
 * A guest's number never travels: a job names the guest by id and reads the
 * number when it runs, and every call to Meta is logged through redactForLog.
 */
import { logger } from '../../../config/logger.js';
import { Customer } from '../../../models/Customer.js';
import { CONNECTION_STATUSES, IntegrationConnection } from '../../../models/IntegrationConnection.js';
import { IntegrationJob } from '../../../models/IntegrationJob.js';
import { MessageTemplate, TEMPLATE_CATEGORIES, TEMPLATE_KEYS, TEMPLATE_STATUSES } from '../../../models/MessageTemplate.js';
import { Order } from '../../../models/Order.js';
import { Restaurant } from '../../../models/Restaurant.js';
import {
  BusinessRuleError,
  DuplicateError,
  GuestOptedOutError,
  MessagingNotConnectedError,
  TemplateNotApprovedError,
  ValidationError,
} from '../../../utils/errors.js';
import { paiseToRupees } from '../../../utils/money.js';
import { nowUtc } from '../../../utils/time.js';
import { withdrawOffersFromMessage } from '../../customerService.js';
import { buildInvoiceData } from '../../receiptService.js';
import { getSettings } from '../../settingsService.js';
import { secretsOf } from '../connectionService.js';
import { enqueueJob, registerJobHandler } from '../jobRunner.js';
import {
  listTemplates as listMetaTemplates,
  localNumber,
  NOT_ON_WHATSAPP_CODE,
  sendInteractiveMessage,
  sendTemplateMessage,
  sendTextMessage,
  submitTemplate,
  templateStatusFromMeta,
} from './whatsappAdapter.js';

/** Meta's service window: 24 hours after the guest's last message. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60_000;

export const PROVIDER = 'WHATSAPP';
export const SEND_WHATSAPP_TEMPLATE = 'SEND_WHATSAPP_TEMPLATE';
export const SEND_WHATSAPP_TEXT = 'SEND_WHATSAPP_TEXT';
export const DELIVERY_STATUSES = Object.freeze({ SENT: 'SENT', DELIVERED: 'DELIVERED', READ: 'READ', FAILED: 'FAILED' });
export const STOP_REASON = 'Replied STOP on WhatsApp';

const DUPLICATE_KEY = 11000;
/** A later receipt never moves a message backwards: read stays read if "delivered" arrives late. */
const DELIVERY_RANK = { SENT: 1, DELIVERED: 2, READ: 3 };

const tenantOf = (ctx) => ({ restaurantId: ctx.restaurantId, branchId: ctx.branchId });
/** India's country code, before the ten digits `customers.phone` holds. */
const toWhatsAppNumber = (phone) => `91${phone}`;

/** This branch's WhatsApp connection with its sealed credentials, or 422 MESSAGING_NOT_CONNECTED. */
async function messagingConnection(ctx) {
  const connection = await IntegrationConnection.findOne({ ...tenantOf(ctx), provider: PROVIDER }).select('+credentials');
  if (!connection || connection.status !== CONNECTION_STATUSES.ACTIVE) throw new MessagingNotConnectedError();
  return connection;
}

/** The category a template is priced and gated by: Meta's decision, never our own ask. */
export const effectiveCategory = (template) => template.approvedCategory ?? template.category;

/**
 * Whether this guest may receive a template of this category. The one place
 * the rule lives, for every send: a utility template (a bill) needs no consent;
 * a marketing template needs live offers consent, or it is 422 GUEST_OPTED_OUT.
 */
export function assertMayReceive(customer, category) {
  if (category === TEMPLATE_CATEGORIES.MARKETING && customer?.offers?.given !== true) throw new GuestOptedOutError();
}

/** The template's numbered variables, in order, from what the caller named. */
function parametersFor(template, variables) {
  return template.variables.map((name) => {
    const value = variables?.[name];
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new ValidationError(`The template needs ${name}.`, { [`variables.${name}`]: 'Is required.' });
    }
    return String(value);
  });
}

/**
 * Queues one template message to a guest. Returns `{ queued, jobId }`, or
 * `{ queued: false, duplicate: true }` for a key already used, or
 * `{ queued: false, skipped }` for a guest it must not or cannot reach.
 */
export async function sendTemplate({ restaurantId, branchId, phone, templateKey, variables = {}, idempotencyKey }) {
  const ctx = { restaurantId, branchId };
  const connection = await messagingConnection(ctx);

  const template = await MessageTemplate.findOne({ ...tenantOf(ctx), key: templateKey });
  if (!template || template.status !== TEMPLATE_STATUSES.APPROVED) throw new TemplateNotApprovedError();

  const customer = await Customer.findOne({ restaurantId, phone: localNumber(phone) }).lean();
  if (!customer) return { queued: false, skipped: 'NO_CUSTOMER' };
  // P39. A guest who asked for no messages at all gets none, bills included.
  if (customer.whatsappStoppedAt) return { queued: false, skipped: 'STOPPED' };
  assertMayReceive(customer, effectiveCategory(template));
  if (customer.whatsappUnreachableAt) return { queued: false, skipped: 'UNREACHABLE' };

  const job = await enqueueJob(ctx, {
    connectionId: connection._id,
    type: SEND_WHATSAPP_TEMPLATE,
    payload: { customerId: String(customer._id), templateId: String(template._id), parameters: parametersFor(template, variables) },
    dedupeKey: `whatsapp:${idempotencyKey}`,
  });
  return job ? { queued: true, jobId: String(job._id) } : { queued: false, duplicate: true };
}

/* --------------------------------------------------------------------------
 * The jobs
 * ----------------------------------------------------------------------- */

const ctxOf = (job) => ({ restaurantId: job.restaurantId, branchId: job.branchId });

async function jobConnection(job) {
  const connection = await IntegrationConnection.findOne({ restaurantId: job.restaurantId, _id: job.connectionId }).select('+credentials');
  // Retried on the ladder: the owner may switch it back on.
  if (!connection || connection.status !== CONNECTION_STATUSES.ACTIVE) throw new Error('WhatsApp is not switched on.');
  return connection;
}

const markUnreachable = (ctx, customerId) =>
  Customer.updateOne({ restaurantId: ctx.restaurantId, _id: customerId }, { $set: { whatsappUnreachableAt: nowUtc() } });

/** What became of a call: sent, with Meta's id, or refused by Meta, never retried. */
async function outcomeOf(ctx, connection, customerId, answer) {
  if (!answer.ok) {
    if (answer.error.code === NOT_ON_WHATSAPP_CODE) await markUnreachable(ctx, customerId);
    return { failed: answer.error.code ?? 'REFUSED', message: answer.error.message, customerId };
  }
  const at = nowUtc();
  await IntegrationConnection.updateOne({ restaurantId: ctx.restaurantId, _id: connection._id }, { $set: { lastSuccessAt: at } });
  return { messageId: String(answer.body?.messages?.[0]?.id ?? ''), customerId, deliveryStatus: DELIVERY_STATUSES.SENT, deliveryAt: at };
}

/** Sends a queued template. Everything is checked again at send time, consent included. */
export async function runTemplateJob(job) {
  const ctx = ctxOf(job);
  const connection = await jobConnection(job);
  const { customerId, templateId, parameters = [] } = job.payload ?? {};
  const template = await MessageTemplate.findOne({ restaurantId: ctx.restaurantId, _id: templateId });
  if (!template || template.status !== TEMPLATE_STATUSES.APPROVED) return { refused: 'TEMPLATE_NOT_APPROVED', customerId };
  const customer = await Customer.findOne({ restaurantId: ctx.restaurantId, _id: customerId }).lean();
  if (!customer) return { refused: 'NO_CUSTOMER', customerId };
  if (customer.whatsappUnreachableAt) return { refused: 'UNREACHABLE', customerId };
  if (customer.whatsappStoppedAt) return { refused: 'STOPPED', customerId };
  try {
    assertMayReceive(customer, effectiveCategory(template));
  } catch {
    return { refused: 'GUEST_OPTED_OUT', customerId };
  }
  const answer = await sendTemplateMessage(connection, secretsOf(connection), {
    to: toWhatsAppNumber(customer.phone),
    metaName: template.metaName,
    language: template.language,
    parameters,
    externalId: String(job._id),
  });
  return outcomeOf(ctx, connection, customerId, answer);
}

/**
 * Sends a plain reply, with buttons when given (P39), inside the service window
 * the guest's own message opened. A guest who stopped all messages still gets
 * the answer to a message they just wrote, and nothing else.
 */
export async function runTextJob(job) {
  const ctx = ctxOf(job);
  const connection = await jobConnection(job);
  const { customerId, text, buttons = [], replyToInboundAt = null } = job.payload ?? {};
  const customer = await Customer.findOne({ restaurantId: ctx.restaurantId, _id: customerId }).lean();
  if (!customer) return { refused: 'NO_CUSTOMER', customerId };
  const answering = replyToInboundAt && nowUtc().getTime() - new Date(replyToInboundAt).getTime() < SERVICE_WINDOW_MS;
  if (customer.whatsappStoppedAt && !answering) return { refused: 'STOPPED', customerId };
  const secrets = secretsOf(connection);
  const to = toWhatsAppNumber(customer.phone);
  const answer =
    buttons.length > 0
      ? await sendInteractiveMessage(connection, secrets, { to, text, buttons, externalId: String(job._id) })
      : await sendTextMessage(connection, secrets, { to, text, externalId: String(job._id) });
  return outcomeOf(ctx, connection, customerId, answer);
}

registerJobHandler(SEND_WHATSAPP_TEMPLATE, runTemplateJob);
registerJobHandler(SEND_WHATSAPP_TEXT, runTextJob);

/* --------------------------------------------------------------------------
 * What Meta posts back
 * ----------------------------------------------------------------------- */

/** A delivery receipt, recorded on the job that sent the message. */
async function recordDelivery(ctx, event) {
  const sent = await IntegrationJob.findOne({
    restaurantId: ctx.restaurantId,
    type: { $in: [SEND_WHATSAPP_TEMPLATE, SEND_WHATSAPP_TEXT] },
    'result.messageId': event.messageId,
  }).lean();
  if (!sent) return { ignored: 'A message this server did not send.' };
  const current = sent.result?.deliveryStatus;
  const failed = event.status === DELIVERY_STATUSES.FAILED;
  if (!failed && (DELIVERY_RANK[event.status] ?? 0) <= (DELIVERY_RANK[current] ?? 0)) return { kept: current };
  await IntegrationJob.updateOne(
    { restaurantId: ctx.restaurantId, _id: sent._id },
    { $set: { 'result.deliveryStatus': failed ? DELIVERY_STATUSES.FAILED : event.status, 'result.deliveryAt': nowUtc(), ...(failed ? { 'result.deliveryError': event.errorCode ?? null } : {}) } },
  );
  if (failed && event.errorCode === NOT_ON_WHATSAPP_CODE && sent.result?.customerId) await markUnreachable(ctx, sent.result.customerId);
  return { deliveryStatus: event.status };
}

/** STOP: offers consent withdrawn at once, and the guest told once. Bills continue. */
async function optOut(ctx, connection, event) {
  if (!event.customerId) return { ignored: 'A number with no guest record here.' };
  const { changed } = await withdrawOffersFromMessage(ctx, event.customerId, STOP_REASON);
  const restaurant = await Restaurant.findById(ctx.restaurantId).select('name').lean();
  const text = `You will not get offers from ${restaurant?.name ?? 'us'} on WhatsApp any more. Your bills will still come here.`;
  const at = nowUtc();
  await enqueueJob(ctx, {
    connectionId: connection._id,
    type: SEND_WHATSAPP_TEXT,
    payload: { customerId: event.customerId, text, replyToInboundAt: at.toISOString() },
    dedupeKey: `whatsapp:opt-out-reply:${event.externalId}`,
  });
  // P39. Kept in the guest's chat, so staff see it.
  const { openChatFor, recordReply } = await import('../../chatbot/chatTurns.js');
  const conversation = await openChatFor(ctx, event.customerId, 'STOP', at);
  await recordReply(ctx, conversation._id, text);
  return { withdrawn: changed };
}

/** Runs one stored WhatsApp event. Called by the M21 webhook job for a messaging provider. */
export function processWhatsAppEvent(job, connection) {
  const ctx = ctxOf(job);
  const event = job.payload?.event ?? {};
  if (event.type === 'MESSAGE_STATUS') return recordDelivery(ctx, event);
  if (event.type === 'OPT_OUT') return optOut(ctx, connection, event);
  // P39. Anything else the guest wrote, for the assistant.
  if (event.type === 'INBOUND_MESSAGE') return import('../../chatbot/assistant.js').then(({ handleInboundMessage }) => handleInboundMessage(job, connection, event));
  return { ignored: event.type ?? 'unknown' };
}

/* --------------------------------------------------------------------------
 * Templates
 * ----------------------------------------------------------------------- */

const VARIABLE = /\{\{(\d+)\}\}/g;

/** A template as the API shows it, with `categoryChanged` when Meta approved it as something else. */
export function presentTemplate(template) {
  const plain = template.toJSON ? template.toJSON() : template;
  return { ...plain, categoryChanged: Boolean(plain.approvedCategory && plain.approvedCategory !== plain.category) };
}

/** GET /integrations/whatsapp/templates. */
export async function listTemplates(req) {
  const rows = await MessageTemplate.find({ restaurantId: req.restaurantId, branchId: req.branchId }).sort({ createdAt: 1 });
  return rows.map(presentTemplate);
}

/** The numbered variables `bodyText` uses must be 1 to N with none missing, and match `variables` and `example`. */
function checkVariables({ bodyText, variables, example, submit }) {
  const numbers = [...new Set([...bodyText.matchAll(VARIABLE)].map((match) => Number(match[1])))].sort((a, b) => a - b);
  if (numbers.some((number, index) => number !== index + 1)) {
    throw new ValidationError('Number the variables {{1}}, {{2}} and so on, with none missing.', { bodyText: 'Number the variables from {{1}}, with none missing.' });
  }
  if (variables.length !== numbers.length) {
    throw new ValidationError(`The text has ${numbers.length} variables; name each one.`, { variables: `Name ${numbers.length}.` });
  }
  if (submit && example.length !== numbers.length) {
    throw new ValidationError('Meta needs an example for each variable.', { example: `Give ${numbers.length}.` });
  }
}

/** POST /integrations/whatsapp/templates. Sent to Meta for review, or linked to one made in Meta's screens. */
export async function createTemplate(req, { key, metaName, category, language, bodyText, variables = [], example = [], submit = true }) {
  const connection = await messagingConnection(req);
  checkVariables({ bodyText, variables, example, submit });
  if (await MessageTemplate.exists({ restaurantId: req.restaurantId, branchId: req.branchId, key })) {
    throw new DuplicateError('A template with that name already exists.');
  }

  let fromMeta = {};
  if (submit) {
    const answer = await submitTemplate(connection, secretsOf(connection), { metaName, category, language, bodyText, example });
    if (!answer.ok) throw new BusinessRuleError(`Meta did not take it: ${answer.error.message}`);
    const status = templateStatusFromMeta(answer.body?.status ?? 'PENDING');
    fromMeta = {
      status,
      metaTemplateId: answer.body?.id ? String(answer.body.id) : null,
      approvedCategory: status === TEMPLATE_STATUSES.APPROVED ? answer.body?.category ?? category : null,
    };
  }

  try {
    await MessageTemplate.create({
      restaurantId: req.restaurantId,
      branchId: req.branchId,
      key,
      metaName,
      category,
      language,
      bodyText,
      variables,
      example,
      createdBy: req.user.id,
      ...fromMeta,
    });
  } catch (error) {
    if (error?.code === DUPLICATE_KEY) throw new DuplicateError('A template with that name already exists.');
    throw error;
  }
  // One linked by hand is read back from Meta at once.
  if (!submit) return syncTemplates(req);
  return listTemplates(req);
}

/** POST /integrations/whatsapp/templates/sync. Every template's state, read from Meta. */
export async function syncTemplates(req) {
  const connection = await messagingConnection(req);
  const answer = await listMetaTemplates(connection, secretsOf(connection));
  if (!answer.ok) throw new BusinessRuleError(`Meta did not answer the templates: ${answer.error.message}`);
  const fromMeta = answer.body?.data ?? [];
  const at = nowUtc();
  const rows = await MessageTemplate.find({ restaurantId: req.restaurantId, branchId: req.branchId });
  for (const row of rows) {
    const match = fromMeta.find((entry) => entry.name === row.metaName && entry.language === row.language);
    if (!match) continue;
    const status = templateStatusFromMeta(match.status);
    row.status = status;
    row.metaTemplateId = match.id ? String(match.id) : row.metaTemplateId;
    row.approvedCategory = status === TEMPLATE_STATUSES.APPROVED ? match.category ?? row.category : null;
    row.rejectionReason = status === TEMPLATE_STATUSES.REJECTED && match.rejected_reason && match.rejected_reason !== 'NONE' ? String(match.rejected_reason).slice(0, 500) : null;
    row.lastSyncedAt = at;
    await row.save();
  }
  return listTemplates(req);
}

/* --------------------------------------------------------------------------
 * The receipt
 * ----------------------------------------------------------------------- */

/**
 * Queues the guest's bill on WhatsApp, for a bill just paid. Called after the
 * payment's write commits (models/Bill.js), never inside it, and it never
 * throws: a guest whose receipt is late is nothing; a payment that failed
 * because WhatsApp was down would be a disaster. The figures are the bill's
 * own, from buildInvoiceData; nothing is computed here.
 */
export async function queueBillReceipt(bill) {
  try {
    if (bill.status !== 'PAID' || bill.isVoided || bill.platform?.code) return null;
    const ctx = { restaurantId: bill.restaurantId, branchId: bill.branchId };
    const connection = await IntegrationConnection.findOne({ ...tenantOf(ctx), provider: PROVIDER }).lean();
    if (!connection || connection.status !== CONNECTION_STATUSES.ACTIVE || connection.config?.sendBillOnPayment !== true) return null;
    const order = await Order.findOne({ restaurantId: ctx.restaurantId, _id: bill.orderId }).select('customerPhone platform').lean();
    if (!order?.customerPhone || order.platform?.code) return null;

    const restaurant = await Restaurant.findById(ctx.restaurantId);
    const { receipt } = await getSettings(ctx.restaurantId);
    const data = buildInvoiceData({ restaurant, bill, receipt });
    return await sendTemplate({
      ...ctx,
      phone: order.customerPhone,
      templateKey: TEMPLATE_KEYS.BILL_RECEIPT,
      variables: {
        restaurantName: data.restaurant.name,
        billNumber: data.billNumber,
        billTotal: paiseToRupees(data.billTotalInPaise, { symbol: true }),
      },
      idempotencyKey: `bill:${bill._id}:receipt`,
    });
  } catch (error) {
    // The bill and the restaurant by id only: never the guest.
    logger.warn({ restaurantId: String(bill.restaurantId), billId: String(bill._id), reason: error?.code ?? error?.message }, 'The WhatsApp bill was not queued.');
    return null;
  }
}

export default { assertMayReceive, createTemplate, listTemplates, processWhatsAppEvent, queueBillReceipt, sendTemplate, syncTemplates };
