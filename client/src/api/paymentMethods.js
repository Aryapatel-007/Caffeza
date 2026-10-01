/**
 * Payment method API calls. M10, built in P08.
 * Shapes from docs/API-CONTRACT.md "M10 Payments" section 1.
 */
import { api } from './client.js';

/** Active methods in display order. `includeInactive` is for OWNER and MANAGER. */
export function listPaymentMethods({ includeInactive = false } = {}) {
  return api.get(`/payment-methods${includeInactive ? '?includeInactive=true' : ''}`);
}

/** OWNER. `code` and `kind` are set here and never change. */
export function createPaymentMethod(body) {
  return api.post('/payment-methods', body);
}

/** OWNER. Any of name, orderTypes, platformCode, tallyLedgerCode, commissionBps, displayOrder, isActive. */
export function updatePaymentMethod(methodId, changes) {
  return api.patch(`/payment-methods/${methodId}`, changes);
}
