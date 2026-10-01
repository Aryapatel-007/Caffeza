/**
 * Cash drawer and Day Close. P10. Shapes from docs/API-CONTRACT.md "M16"
 * sections 3 and 6. The blind count is applied by the server: a manager's
 * responses simply do not carry the expected cash.
 */
import { api } from './client.js';

export function listCashMovements(date) {
  return api.get(`/cash-movements${date ? `?date=${date}` : ''}`);
}

/** `type` is OPENING_FLOAT, PAID_IN or PAID_OUT. The server dates it today. */
export function recordCashMovement({ type, amountInPaise, reason }) {
  return api.post('/cash-movements', { type, amountInPaise, ...(reason ? { reason } : {}) });
}

export function voidCashMovement(movementId, reason) {
  return api.post(`/cash-movements/${movementId}/void`, { reason });
}

/** The close for one date, or its live figures and blockers when open. */
export function getDay(businessDate) {
  return api.get(`/day-close/${businessDate}`);
}

export function listDays({ from, to } = {}) {
  const search = new URLSearchParams();
  if (from) search.set('from', from);
  if (to) search.set('to', to);
  const query = search.toString();
  return api.get(`/day-close${query ? `?${query}` : ''}`);
}

export function closeDay({ businessDate, countedCashInPaise, note }) {
  return api.post('/day-close', { businessDate, countedCashInPaise, note: note || null });
}

export function reopenDay(businessDate, reason) {
  return api.post(`/day-close/${businessDate}/reopen`, { reason });
}

export function getDayPrint(businessDate, width = 32) {
  return api.get(`/day-close/${businessDate}/print?width=${width}`);
}
