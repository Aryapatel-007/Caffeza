/**
 * The sandbox platform. P25 Parts G and H, API-CONTRACT M21 section 7.1.
 *
 * Behaves like a delivery platform so a restaurant can practise, and tests can
 * run, without one. Its webhooks are signed with HMAC-SHA256 of the raw body
 * under its `webhookSecret`, sent as lowercase hex in `x-sandbox-signature`.
 * Its body is one event, or `{ "events": [...] }`, each already in the
 * normalised shape of P25 Part H2. Its outgoing calls write an OUT event and
 * succeed, unless its config lists the call in `failCalls`, so tests can
 * exercise failures. Never in production: the registry and the connection
 * service refuse it there.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { PartnerCallFailedError } from '../../../utils/errors.js';
import { logEvent } from '../eventLog.js';

export const SIGNATURE_HEADER = 'x-sandbox-signature';
export const EVENT_TYPES = Object.freeze(['ORDER_PLACED', 'ORDER_CANCELLED', 'RIDER_ASSIGNED', 'RIDER_ARRIVED', 'ORDER_PICKED_UP', 'ORDER_DELIVERED']);

/** The signature the sandbox sends with a body. Exported for the developer tool and tests. */
export function signSandboxBody(rawBody, webhookSecret) {
  return createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
}

export function verifyWebhook({ rawBody, headers, secrets }) {
  const sent = String(headers?.[SIGNATURE_HEADER] ?? '');
  if (!/^[0-9a-f]{64}$/.test(sent) || !secrets?.webhookSecret) return false;
  const expected = signSandboxBody(rawBody, secrets.webhookSecret);
  return timingSafeEqual(Buffer.from(sent, 'hex'), Buffer.from(expected, 'hex'));
}

const paise = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);
const text = (value, max = 200) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

/** One order in the normalised shape. The customer's phone number is dropped here. */
function normaliseOrder(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('The order is missing.');
  const items = Array.isArray(raw.items) ? raw.items : [];
  if (items.length === 0) throw new Error('The order has no items.');
  return {
    platformOrderId: String(raw.platformOrderId),
    placedAt: raw.placedAt ? new Date(raw.placedAt) : new Date(),
    acceptBy: raw.acceptBy ? new Date(raw.acceptBy) : null,
    customerName: text(raw.customerName, 60),
    items: items.map((item) => {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) throw new Error('An item quantity is not a whole number above 0.');
      return {
        externalItemId: String(item.externalItemId),
        externalVariantId: item.externalVariantId ? String(item.externalVariantId) : null,
        name: text(item.name) ?? 'Item',
        quantity,
        unitPriceInPaise: paise(item.unitPriceInPaise),
        addOns: (Array.isArray(item.addOns) ? item.addOns : []).map((addOn) => ({
          externalId: String(addOn.externalId),
          name: text(addOn.name) ?? 'Extra',
          priceInPaise: paise(addOn.priceInPaise),
        })),
        note: text(item.note),
      };
    }),
    packagingChargeInPaise: paise(raw.packagingChargeInPaise),
    merchantDiscountInPaise: paise(raw.merchantDiscountInPaise),
    platformDiscountInPaise: paise(raw.platformDiscountInPaise),
    totalInPaise: paise(raw.totalInPaise),
    paymentMode: raw.paymentMode === 'CASH_ON_DELIVERY' ? 'CASH_ON_DELIVERY' : 'PREPAID',
    deliveredBy: raw.deliveredBy === 'RESTAURANT' ? 'RESTAURANT' : 'PLATFORM',
    instructions: text(raw.instructions, 300),
  };
}

export function parseWebhook({ rawBody }) {
  const body = JSON.parse(rawBody.toString('utf8'));
  const events = Array.isArray(body?.events) ? body.events : [body];
  return events
    .filter((event) => EVENT_TYPES.includes(event?.type))
    .map((event) => {
      const platformOrderId = String(event.platformOrderId ?? event.order?.platformOrderId ?? '');
      if (!/^[A-Za-z0-9]{3,40}$/.test(platformOrderId)) throw new Error('The platform order number is not letters and digits.');
      return {
        type: event.type,
        platformOrderId,
        ...(event.type === 'ORDER_PLACED' ? { order: normaliseOrder({ ...event.order, platformOrderId }) } : {}),
      };
    });
}

export const capabilities = Object.freeze({ acceptReject: true, foodReady: true, itemAvailability: true, storeStatus: true, menuPush: true });

/** Every outgoing call: an OUT event, then success, or a failure when the config asks for one. */
async function call(connection, name, externalId, request) {
  const fails = (connection.config?.failCalls ?? []).includes(name);
  await logEvent(connection, {
    direction: 'OUT',
    kind: name,
    externalId,
    outcome: fails ? 'FAILED' : 'OK',
    httpStatus: fails ? 503 : 200,
    request,
    response: fails ? { error: 'The sandbox was told to fail this call.' } : { ok: true },
  });
  if (fails) throw new PartnerCallFailedError(`The sandbox platform refused ${name}.`);
  return { ok: true };
}

export const acceptOrder = (connection, _secrets, platformOrderId, { prepMinutes }) => call(connection, 'acceptOrder', platformOrderId, { platformOrderId, prepMinutes });
export const rejectOrder = (connection, _secrets, platformOrderId, reasonCode) => call(connection, 'rejectOrder', platformOrderId, { platformOrderId, reasonCode });
export const markFoodReady = (connection, _secrets, platformOrderId) => call(connection, 'markFoodReady', platformOrderId, { platformOrderId });
export const setItemAvailability = (connection, _secrets, items) => call(connection, 'setItemAvailability', null, { items });
export const setStoreStatus = (connection, _secrets, { open }) => call(connection, 'setStoreStatus', null, { open });
export const pushMenu = (connection, _secrets, menu) => call(connection, 'pushMenu', null, { categories: menu?.categories?.length ?? 0 });

export function testConnection() {
  return Promise.resolve({ ok: true });
}

export default {
  acceptOrder,
  capabilities,
  markFoodReady,
  parseWebhook,
  pushMenu,
  rejectOrder,
  setItemAvailability,
  setStoreStatus,
  signSandboxBody,
  testConnection,
  verifyWebhook,
};
