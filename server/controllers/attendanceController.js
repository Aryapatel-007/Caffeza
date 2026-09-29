/**
 * Employee attendance.
 *
 * Shapes come from docs/API-CONTRACT.md sections 7 to 10. Every rule and
 * permission check lives in services/attendanceService.js; this file wires HTTP
 * to it and formats the response.
 *
 * `POST /attendance/station/clock`, the shared-tablet PIN path, is wired here
 * to `attendanceService.stationClock`, which calls `authService.verifyPin`.
 * That verification issues no session; see docs/DB-SCHEMA.md section 3.
 */
import * as attendance from '../services/attendanceService.js';
import { getSetting } from '../services/settingsService.js';
import { sendList, sendSuccess } from '../utils/response.js';
import { scoped } from '../utils/scopedQuery.js';
import { businessDateFor } from '../utils/time.js';

/**
 * The business-day boundary for the caller's restaurant.
 *
 * Through settingsService as of M7, so no controller reaches into
 * `restaurant.settings` itself. It stays cheap: `authenticate` has already
 * loaded the restaurant onto the request and the service reads it from there
 * rather than issuing a query, which is what this helper did before.
 */
function businessDayStartMinutes(req) {
  return getSetting(req.restaurantId, 'business.businessDayStartsAtMinutes', { req });
}

/** POST /attendance/clock-in */
export async function clockInSelf(req, res) {
  const entry = await attendance.clockIn(scoped(req), {
    userId: req.user.id,
    source: 'SELF',
    businessDayStartMinutes: await businessDayStartMinutes(req),
  });

  req.log?.info({ actorId: req.user.id, entryId: String(entry._id) }, 'Clocked in.');
  return sendSuccess(res, await attendance.withUser(scoped(req), entry), 201);
}

/** POST /attendance/clock-out */
export async function clockOutSelf(req, res) {
  const entry = await attendance.clockOut(scoped(req), {
    userId: req.user.id,
    source: 'SELF',
  });

  req.log?.info(
    { actorId: req.user.id, entryId: String(entry._id), workedMinutes: entry.workedMinutes },
    'Clocked out.',
  );
  return sendSuccess(res, await attendance.withUser(scoped(req), entry));
}

/**
 * POST /attendance/station/clock
 *
 * Authenticated by the tablet's session (any role); the PIN in the body decides
 * whose shift is written. Returns a clock event, never a token.
 */
export async function stationClock(req, res) {
  const { userId, pin, action } = req.body;

  const data = await attendance.stationClock(scoped(req), {
    targetUserId: userId,
    pin,
    action,
    businessDayStartMinutes: await businessDayStartMinutes(req),
  });

  req.log?.info(
    { actorId: req.user.id, targetUserId: String(userId), event: data.event },
    'Station clock event.',
  );
  return sendSuccess(res, data);
}

/** GET /attendance/me */
export async function getMyAttendance(req, res) {
  const data = await attendance.myAttendance(scoped(req), req.user.id, {
    businessDayStartMinutes: await businessDayStartMinutes(req),
  });
  return sendSuccess(res, data);
}

/** GET /attendance */
export async function listRegister(req, res) {
  const { page, limit, from, to, openOnly, includeVoided } = req.query;
  const today = businessDateFor(new Date(), await businessDayStartMinutes(req));

  const { entries, total } = await attendance.listRegister(scoped(req), {
    fromDate: from ?? today,
    toDate: to ?? today,
    openOnly,
    includeVoided,
    page,
    limit,
  });

  return sendList(res, entries, { page, limit, total });
}

/** GET /users/:userId/attendance */
export async function listUserHistory(req, res) {
  const { page, limit, from, to } = req.query;

  const { entries, total } = await attendance.listForUser(scoped(req), req.params.userId, {
    fromDate: from,
    toDate: to,
    page,
    limit,
  });

  return sendList(res, entries, { page, limit, total });
}

/** POST /attendance */
export async function createEntry(req, res) {
  const { userId, clockInAt, clockOutAt, reason } = req.body;

  const entry = await attendance.createManualEntry(scoped(req), req.user.id, {
    userId,
    clockInAt,
    clockOutAt,
    reason,
    businessDayStartMinutes: await businessDayStartMinutes(req),
  });

  req.log?.info(
    { actorId: req.user.id, targetUserId: String(userId), entryId: String(entry._id) },
    'Attendance entry created by a manager.',
  );
  return sendSuccess(res, await attendance.withUser(scoped(req), entry), 201);
}

/** PATCH /attendance/:entryId */
export async function correctEntry(req, res) {
  const { clockInAt, clockOutAt, reason } = req.body;

  const entry = await attendance.correctEntry(scoped(req), req.user.id, req.params.entryId, {
    clockInAt,
    clockOutAt,
    reason,
  });

  req.log?.info(
    { actorId: req.user.id, entryId: String(entry._id) },
    'Attendance entry corrected.',
  );
  return sendSuccess(res, await attendance.withUser(scoped(req), entry));
}

/** PATCH /attendance/:entryId/void */
export async function voidEntry(req, res) {
  const entry = await attendance.voidEntry(
    scoped(req),
    req.user.id,
    req.params.entryId,
    req.body.reason,
  );

  req.log?.info(
    { actorId: req.user.id, entryId: String(entry._id) },
    'Attendance entry voided.',
  );
  return sendSuccess(res, await attendance.withUser(scoped(req), entry));
}

/** GET /attendance/summary */
export async function getSummary(req, res) {
  const { from, to } = req.query;
  return sendSuccess(res, await attendance.summary(scoped(req), { fromDate: from, toDate: to }));
}
