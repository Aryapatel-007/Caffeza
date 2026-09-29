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

export function createUser({ name, phone, email, role, password }) {
  return api.post('/users', { name, phone, email: email || null, role, password });
}

/** Only name, email and role. Phone is the login identity and cannot change. */
export function updateUser(userId, { name, email, role }) {
  return api.patch(`/users/${userId}`, { name, email: email || null, role });
}

export function setUserStatus(userId, isActive) {
  return api.patch(`/users/${userId}/status`, { isActive });
}

export function resetUserPassword(userId, newPassword) {
  return api.patch(`/users/${userId}/password`, { newPassword });
}
