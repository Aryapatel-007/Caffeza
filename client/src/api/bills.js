/**
 * Billing API calls.
 *
 * Every fetch for M3's billing screens lives here. Components call these and
 * never touch the network themselves.
 *
 * Shapes come from docs/API-CONTRACT.md sections 14 and 15.
 *
 * The rule running through this file, same as api/orders.js: the client never
 * sends a computed figure. It sends what it wants done — bill this order, take
 * this off, this was paid — and reads back whatever the server worked out.
 * There is no function here that takes a subtotal, a tax amount or a grand
 * total.
 */
import { api, requestWithMeta } from './client.js';

function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** Creates the bill for an order. The order's current version, from the order screen. */
export function createBill({ orderId, version }) {
  return api.post('/bills', { orderId, version });
}

export function getBill(billId) {
  return api.get(`/bills/${billId}`);
}

/**
 * The day's bills, with a running total for the whole matched range in
 * `meta.totals`, not just the current page. Defaults to today's business day.
 */
export function listBills({ from, to, status, includeVoided, page, limit } = {}) {
  return requestWithMeta(`/bills${toQuery({ from, to, status, includeVoided, page, limit })}`);
}

/**
 * `kind` is 'FLAT' or 'PERCENT'. P08: a fixed reason code, an optional note
 * (required for OTHER), and who paid for it. OWNER and MANAGER, plus a CASHIER
 * for platform reasons when the owner allows it; the server decides.
 */
export function applyDiscount(billId, { kind, valueInPaise, rateBps, reasonCode, note, fundedBy }) {
  const body = { kind, reasonCode, note: note || null, fundedBy: fundedBy ?? 'RESTAURANT' };
  if (kind === 'FLAT') body.valueInPaise = valueInPaise;
  if (kind === 'PERCENT') body.rateBps = rateBps;
  return api.post(`/bills/${billId}/discount`, body);
}

export function recordPayment(billId, { method, amountInPaise, reference }) {
  const body = { method, amountInPaise };
  if (reference) body.reference = reference;
  return api.post(`/bills/${billId}/payments`, body);
}

/** P08. Changes only the method of one payment, with a reason. OWNER and MANAGER. */
export function correctPayment(billId, paymentId, { method, reason }) {
  return api.post(`/bills/${billId}/payments/${paymentId}/correct`, { method, reason });
}

/**
 * OWNER and MANAGER only on the server. The number stays spent, never reissued.
 * A fixed reason code plus an optional note, required for OTHER (P04).
 */
/** P24. Puts the order's online advance on the bill. Any leftover is refunded by the server. */
export function applyAdvance(billId) {
  return api.post(`/bills/${billId}/apply-advance`, {});
}

export function voidBill(billId, { reasonCode, note }) {
  return api.post(`/bills/${billId}/void`, { reasonCode, note: note || null });
}

/** width is 32 (58mm) or 48 (80mm). The server lays it out; the client only prints it. */
export function getReceipt(billId, width = 32) {
  return api.get(`/bills/${billId}/receipt?width=${width}`);
}

/** P25. The bill as data for a full A4 or A5 tax invoice, from the same builder as the receipt. */
export function getInvoice(billId) {
  return api.get(`/bills/${billId}/invoice`);
}

export function getBillsSummary({ from, to }) {
  return api.get(`/bills/summary${toQuery({ from, to })}`);
}
