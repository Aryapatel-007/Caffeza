/**
 * Attendance API calls (M5).
 *
 * Every fetch for this module lives here. Components call these and never touch
 * the network themselves. Shapes come from docs/API-CONTRACT.md sections 7 to 10.
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

/* --- the shared-tablet clock --- */

/**
 * One PIN, one clock event. Never returns a token.
 *
 * `action` is "clock" (toggle in/out) or "undo" (reverse the last station event
 * for this person, if still inside the ~8s window).
 */
export function stationClock({ userId, pin, action = 'clock' }) {
  return api.post('/attendance/station/clock', { userId, pin, action });
}

/* --- my own attendance --- */

export function getMyAttendance() {
  return api.get('/attendance/me');
}

/* --- the manager register --- */

export function listRegister({ from, to, openOnly, includeVoided, page, limit } = {}) {
  return requestWithMeta(
    `/attendance${toQuery({ from, to, openOnly, includeVoided, page, limit })}`,
  );
}

export function listUserAttendance(userId, { from, to, page, limit } = {}) {
  return requestWithMeta(`/users/${userId}/attendance${toQuery({ from, to, page, limit })}`);
}

/** A shift that was never clocked. Times come from the manager here. */
export function createEntry({ userId, clockInAt, clockOutAt, reason }) {
  const body = { userId, clockInAt, reason };
  if (clockOutAt) body.clockOutAt = clockOutAt;
  return api.post('/attendance', body);
}

/** Correct a clock time. At least one of clockInAt / clockOutAt, plus a reason. */
export function correctEntry(entryId, { clockInAt, clockOutAt, reason }) {
  const body = { reason };
  if (clockInAt) body.clockInAt = clockInAt;
  if (clockOutAt) body.clockOutAt = clockOutAt;
  return api.patch(`/attendance/${entryId}`, body);
}

/** The soft delete. There is no DELETE verb in M5. */
export function voidEntry(entryId, reason) {
  return api.patch(`/attendance/${entryId}/void`, { reason });
}

/* --- the hours-worked summary --- */

export function getSummary({ from, to }) {
  return api.get(`/attendance/summary${toQuery({ from, to })}`);
}
