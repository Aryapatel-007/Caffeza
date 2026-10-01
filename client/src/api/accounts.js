/**
 * On Hold accounts and platform payouts. P09.
 * Shapes from docs/API-CONTRACT.md "M16" section 2 and "M17" section 6.
 */
import { api } from './client.js';

function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** Each account with `outstandingInPaise` and `oldestUncollectedDate`. */
export function listAccounts({ includeInactive = false } = {}) {
  return api.get(`/accounts${toQuery({ includeInactive: includeInactive || undefined })}`);
}

export function createAccount(body) {
  return api.post('/accounts', body);
}

export function updateAccount(accountId, changes) {
  return api.patch(`/accounts/${accountId}`, changes);
}

/** OWNER and MANAGER. Puts what is still owed on the bill onto the account. */
export function chargeToAccount(billId, accountId) {
  return api.post(`/bills/${billId}/charge-to-account`, { accountId });
}

/** An in-hand method only, never more than is owed. */
export function recordCollection(accountId, { method, amountInPaise, reference, note }) {
  return api.post(`/accounts/${accountId}/collections`, {
    method,
    amountInPaise,
    reference: reference || null,
    note: note || null,
  });
}

/** OWNER. `direction` is 'UP' or 'DOWN'. */
export function adjustAccount(accountId, { direction, amountInPaise, reason }) {
  return api.post(`/accounts/${accountId}/adjustments`, { direction, amountInPaise, reason });
}

export function getStatement(accountId, { from, to } = {}) {
  return api.get(`/accounts/${accountId}/statement${toQuery({ from, to })}`);
}

/** Each payout with `expectedInPaise`, `differenceInPaise` and `rateNotSet`. */
export function listPayouts({ method, from, to } = {}) {
  return api.get(`/platform-payouts${toQuery({ method, from, to })}`);
}

export function recordPayout(body) {
  return api.post('/platform-payouts', { ...body, reference: body.reference || null, note: body.note || null });
}

export function voidPayout(payoutId, reason) {
  return api.post(`/platform-payouts/${payoutId}/void`, { reason });
}
