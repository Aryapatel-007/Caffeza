/**
 * Staff management API calls.
 *
 * Every fetch for this module lives here. Components call these and never
 * touch the network themselves.
 */
import { api, requestWithMeta } from './client.js';

/** Builds a query string, leaving out anything empty. */
function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** Returns { data, meta } so a screen can render "3 of 47". */
export function listUsers({ page, limit, role, isActive, search } = {}) {
  return requestWithMeta(`/users${toQuery({ page, limit, role, isActive, search })}`);
}

export function getUser(userId) {
  return api.get(`/users/${userId}`);
}

export function createUser({ name, phone, email, role, password, stationId }) {
  const body = { name, phone, email: email || null, role, password };
  // P05. Only a KITCHEN user has a station.
  if (role === 'KITCHEN') body.stationId = stationId || null;
  return api.post('/users', body);
}

/** Only name, email and role. Phone is the login identity and cannot change. */
export function updateUser(userId, { name, email, role, stationId }) {
  const body = { name, email: email || null, role };
  if (role === 'KITCHEN') body.stationId = stationId || null;
  return api.patch(`/users/${userId}`, body);
}

export function setUserStatus(userId, isActive) {
  return api.patch(`/users/${userId}/status`, { isActive });
}

export function resetUserPassword(userId, newPassword) {
  return api.patch(`/users/${userId}/password`, { newPassword });
}

/** P25 Part E. The owners and managers who can approve with a PIN: id, name and role only. */
export function listApprovers() {
  return api.get('/users/approvers');
}

/** P28. Sets someone's PIN, 4 to 6 digits, for approving on another person's screen and the attendance clock. */
export function setUserPin(userId, pin) {
  return api.patch(`/users/${userId}/pin`, { pin });
}
