/**
 * Every attendance business rule and permission rule, in one file.
 *
 * Anyone asking "can a manager fix their own shift?" or "what happens on a
 * second clock-in?" reads the answer here, not in the controller. The
 * controller wires HTTP to these functions and formats the response; it makes
 * no decisions of its own. Same split as services/userPermissionService.js.
 *
 * Rules enforced here, all server-side:
 *
 *   - Clock in while a shift is open        -> 409 ALREADY_CLOCKED_IN
 *   - Clock out with nothing open           -> 409 NOT_CLOCKED_IN
 *   - A resulting clockOutAt <= clockInAt   -> 422 CLOCK_OUT_BEFORE_CLOCK_IN
 *   - Any change to a voided entry          -> 422 ENTRY_VOIDED
 *   - Acting on your own entry              -> 422 SELF_CORRECTION_FORBIDDEN
 *   - A record from another restaurant      -> 404 NOT_FOUND, never 403
 *
 * Timestamps are the server's clock everywhere except the two manager
 * endpoints (createManualEntry, correctEntry) that reconstruct a missed or
 * mistaken entry. workedMinutes is recomputed from the timestamps on every
 * write and is never accepted from a caller.
 */
import { AttendanceEntry, OPEN_SHIFT_ALERT_MINUTES } from '../models/AttendanceEntry.js';
import { User } from '../models/User.js';
import {
  AlreadyClockedInError,
  ClockOutBeforeClockInError,
  EntryVoidedError,
  NotClockedInError,
  NotFoundError,
  SelfCorrectionForbiddenError,
} from '../utils/errors.js';
import { businessDateFor, minutesBetween, nowUtc } from '../utils/time.js';
import { verifyPin } from './authService.js';

const MONGO_DUPLICATE_KEY = 11000;

/**
 * How long after a station clock event `action: "undo"` is accepted.
 *
 * The clock screen holds a full-screen confirmation with a large UNDO button
 * for about this long, then returns to the grid. A server constant, not an env
 * var, following the same choice made for the login rate limits.
 */
export const STATION_UNDO_WINDOW_MS = 8000;

const sameId = (a, b) => String(a) === String(b);

/** The open shift for one person in this tenant, or null. */
function findOpenShift(scope, userId) {
  return AttendanceEntry.findOne({ ...scope, userId, clockOutAt: null });
}

/** Loads one entry inside the caller's tenant, or 404. Never 403. */
async function loadEntryInTenant(scope, entryId) {
  const entry = await AttendanceEntry.findOne({ ...scope, _id: entryId });
  if (!entry) throw new NotFoundError('Attendance entry not found.');
  return entry;
}

/** Confirms a user id belongs to this tenant, or 404. */
async function loadUserInTenant(scope, userId) {
  const user = await User.findOne({ ...scope, _id: userId }).select('name role isActive');
  if (!user) throw new NotFoundError('User not found.');
  return user;
}

/**
 * Attaches the user's name and role to an entry for the response.
 *
 * A read-time convenience so the register and the clock screen do not each
 * fetch the user list. Never stored on the entry.
 */
async function withUser(scope, entry) {
  const user = await User.findOne({ ...scope, _id: entry.userId }).select('name role');
  return decorate(entry, user);
}

/** Shared shape for every single-entry and list response. */
function decorate(entry, user) {
  const json = entry.toJSON();
  json.userName = user?.name ?? null;
  json.userRole = user?.role ?? null;

  if (entry.clockOutAt === null && !entry.isVoided) {
    json.openMinutes = Math.max(0, minutesBetween(entry.clockInAt, nowUtc()));
    json.requiresAttention = json.openMinutes >= OPEN_SHIFT_ALERT_MINUTES;
  } else {
    json.requiresAttention = false;
  }

  return json;
}

// ---------------------------------------------------------------------------
// Clock in and out
// ---------------------------------------------------------------------------

/**
 * Opens a shift for `userId`.
 *
 * The pre-check is only for the friendly error. The partial unique index is
 * what actually guarantees one open shift, so a duplicate key from the race
 * between two tablets is caught and turned into the same 409.
 */
export async function clockIn(scope, { userId, source, businessDayStartMinutes }) {
  if (await findOpenShift(scope, userId)) throw new AlreadyClockedInError();

  const now = nowUtc();
  try {
    return await AttendanceEntry.create({
      ...scope,
      userId,
      clockInAt: now,
      businessDate: businessDateFor(now, businessDayStartMinutes),
      clockInSource: source,
    });
  } catch (error) {
    if (error?.code === MONGO_DUPLICATE_KEY) throw new AlreadyClockedInError();
    throw error;
  }
}

/** Closes the open shift for `userId`. */
export async function clockOut(scope, { userId, source }) {
  const open = await findOpenShift(scope, userId);
  if (!open) throw new NotClockedInError();

  open.clockOutAt = nowUtc();
  open.clockOutSource = source;
  open.workedMinutes = minutesBetween(open.clockInAt, open.clockOutAt);
  await open.save();
  return open;
}

// ---------------------------------------------------------------------------
// The shared-tablet station clock
// ---------------------------------------------------------------------------

/**
 * POST /attendance/station/clock
 *
 * Verifies `pin` for `targetUserId` within the tablet's restaurant and branch,
 * then records a clock event against that user. `verifyPin` issues no token of
 * any kind, so nothing that outlives the request is handed to whoever typed the
 * PIN.
 *
 * `action: "clock"` toggles: clock in if there is no open shift, clock out if
 * there is. `action: "undo"` reverses the caller's own most recent station
 * event, if it is still inside the undo window.
 */
export async function stationClock(scope, { targetUserId, pin, action, businessDayStartMinutes }) {
  // Throws InvalidPinError (401) or PinLockedError (429). Returns { userId }.
  await verifyPin({ ...scope, userId: targetUserId }, pin);

  const target = await User.findOne({ ...scope, _id: targetUserId }).select('name');
  const userName = target?.name ?? null;

  if (action === 'undo') return stationUndo(scope, targetUserId, userName);

  const open = await findOpenShift(scope, targetUserId);

  if (!open) {
    const entry = await clockIn(scope, {
      userId: targetUserId,
      source: 'STATION',
      businessDayStartMinutes,
    });
    return {
      event: 'CLOCK_IN',
      userName,
      at: entry.clockInAt,
      entryId: String(entry._id),
      openMinutes: 0,
      undoUntil: new Date(entry.clockInAt.getTime() + STATION_UNDO_WINDOW_MS),
    };
  }

  const entry = await clockOut(scope, { userId: targetUserId, source: 'STATION' });
  return {
    event: 'CLOCK_OUT',
    userName,
    at: entry.clockOutAt,
    entryId: String(entry._id),
    workedMinutes: entry.workedMinutes,
    undoUntil: new Date(entry.clockOutAt.getTime() + STATION_UNDO_WINDOW_MS),
  };
}

/**
 * Reverses the target's most recent station event, if it is fresh enough.
 *
 * This is the one self-service change to an attendance entry. It is safe
 * because it is PIN-authenticated, expires in seconds, and can only touch the
 * caller's own last station action. `SELF_CORRECTION_FORBIDDEN` does not apply.
 */
async function stationUndo(scope, targetUserId, userName) {
  const entry = await AttendanceEntry.findOne({ ...scope, userId: targetUserId }).sort({
    createdAt: -1,
  });

  if (!entry) throw new NotClockedInError();
  if (entry.isVoided) throw new EntryVoidedError();

  const now = nowUtc();
  const fresh = (instant) => now.getTime() - instant.getTime() <= STATION_UNDO_WINDOW_MS;

  // A mistaken clock-in: still open, station-sourced, inside the window. Void it.
  if (entry.clockOutAt === null) {
    if (entry.clockInSource !== 'STATION' || !fresh(entry.clockInAt)) {
      throw new NotClockedInError();
    }
    entry.isVoided = true;
    entry.voidedAt = now;
    entry.voidedBy = targetUserId;
    entry.voidReason = 'MIS_TAP';
    await entry.save();
    return { event: 'UNDO', userName, at: now, entryId: String(entry._id), undoUntil: now };
  }

  // A mistaken clock-out: just closed via a station tap, inside the window. Reopen.
  if (entry.clockOutSource !== 'STATION' || !fresh(entry.clockOutAt)) {
    throw new AlreadyClockedInError();
  }

  const previous = entry.clockOutAt.toISOString();
  entry.clockOutAt = null;
  entry.workedMinutes = null;
  entry.clockOutSource = null;
  entry.corrections.push({
    correctedAt: now,
    correctedBy: targetUserId,
    field: 'clockOutAt',
    previousValue: previous,
    newValue: null,
    reason: 'MIS_TAP',
  });

  try {
    await entry.save();
  } catch (error) {
    // The user opened another shift in the seconds since. The partial unique
    // index rejects a second open one; there is nothing to undo.
    if (error?.code === MONGO_DUPLICATE_KEY) throw new AlreadyClockedInError();
    throw error;
  }

  return {
    event: 'UNDO',
    userName,
    at: now,
    entryId: String(entry._id),
    openMinutes: Math.max(0, minutesBetween(entry.clockInAt, now)),
    undoUntil: now,
  };
}

// ---------------------------------------------------------------------------
// Manager writes
// ---------------------------------------------------------------------------

/**
 * Creates an entry for a shift that was never clocked.
 *
 * The times come from the manager here, the one place a client-supplied time is
 * trusted. The reason is recorded as the first `corrections[]` entry, tagged
 * `CREATION`, so the trail starts with why the entry exists.
 */
export async function createManualEntry(
  scope,
  actorId,
  { userId, clockInAt, clockOutAt, reason, businessDayStartMinutes },
) {
  if (sameId(userId, actorId)) throw new SelfCorrectionForbiddenError();
  await loadUserInTenant(scope, userId);

  const inAt = new Date(clockInAt);
  const outAt = clockOutAt === undefined || clockOutAt === null ? null : new Date(clockOutAt);
  if (outAt !== null && outAt.getTime() <= inAt.getTime()) {
    throw new ClockOutBeforeClockInError();
  }

  if (outAt === null && (await findOpenShift(scope, userId))) {
    throw new AlreadyClockedInError();
  }

  const now = nowUtc();
  try {
    return await AttendanceEntry.create({
      ...scope,
      userId,
      clockInAt: inAt,
      clockOutAt: outAt,
      workedMinutes: outAt === null ? null : minutesBetween(inAt, outAt),
      businessDate: businessDateFor(inAt, businessDayStartMinutes),
      clockInSource: 'MANAGER',
      clockOutSource: outAt === null ? null : 'MANAGER',
      corrections: [
        {
          correctedAt: now,
          correctedBy: actorId,
          field: 'CREATION',
          previousValue: null,
          newValue: null,
          reason,
        },
      ],
    });
  } catch (error) {
    if (error?.code === MONGO_DUPLICATE_KEY) throw new AlreadyClockedInError();
    throw error;
  }
}

/**
 * Corrects a clock time on an existing entry.
 *
 * Each changed timestamp appends one `corrections[]` entry carrying its old and
 * new value and the reason. workedMinutes is recomputed. businessDate is not
 * recomputed from a changed clockInAt: to move an entry to another day a
 * manager voids it and recreates it.
 *
 * A MANAGER may correct an OWNER's entry here, unlike the M0-C user endpoints.
 * Attendance is operational data, every change is on the trail, and a
 * single-owner shop still needs its owner's forgotten clock-out fixed by
 * someone. The only rule that binds everyone is self-correction.
 */
export async function correctEntry(scope, actorId, entryId, { clockInAt, clockOutAt, reason }) {
  const entry = await loadEntryInTenant(scope, entryId);
  if (entry.isVoided) throw new EntryVoidedError();
  if (sameId(entry.userId, actorId)) throw new SelfCorrectionForbiddenError();

  const nextClockInAt = clockInAt === undefined ? entry.clockInAt : new Date(clockInAt);
  const nextClockOutAt =
    clockOutAt === undefined ? entry.clockOutAt : new Date(clockOutAt);

  if (nextClockOutAt !== null && nextClockOutAt.getTime() <= nextClockInAt.getTime()) {
    throw new ClockOutBeforeClockInError();
  }

  const now = nowUtc();
  const corrections = [];

  if (clockInAt !== undefined && nextClockInAt.getTime() !== entry.clockInAt.getTime()) {
    corrections.push({
      correctedAt: now,
      correctedBy: actorId,
      field: 'clockInAt',
      previousValue: entry.clockInAt.toISOString(),
      newValue: nextClockInAt.toISOString(),
      reason,
    });
  }

  if (clockOutAt !== undefined) {
    const previous = entry.clockOutAt === null ? null : entry.clockOutAt.toISOString();
    const next = nextClockOutAt.toISOString();
    if (previous !== next) {
      corrections.push({
        correctedAt: now,
        correctedBy: actorId,
        field: 'clockOutAt',
        previousValue: previous,
        newValue: next,
        reason,
      });
    }
  }

  entry.clockInAt = nextClockInAt;
  if (clockOutAt !== undefined) {
    const wasOpen = entry.clockOutAt === null;
    entry.clockOutAt = nextClockOutAt;
    if (wasOpen) entry.clockOutSource = 'MANAGER';
  }
  entry.workedMinutes =
    entry.clockOutAt === null ? null : minutesBetween(entry.clockInAt, entry.clockOutAt);
  entry.corrections.push(...corrections);

  await entry.save();
  return entry;
}

/** Voids an entry. It is excluded from totals afterwards but never removed. */
export async function voidEntry(scope, actorId, entryId, reason) {
  const entry = await loadEntryInTenant(scope, entryId);
  if (entry.isVoided) throw new EntryVoidedError();
  if (sameId(entry.userId, actorId)) throw new SelfCorrectionForbiddenError();

  entry.isVoided = true;
  entry.voidedAt = nowUtc();
  entry.voidedBy = actorId;
  entry.voidReason = reason;
  await entry.save();
  return entry;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Decorates a page of entries with their user's name and role in one query. */
async function decoratePage(scope, entries) {
  const ids = [...new Set(entries.map((entry) => String(entry.userId)))];
  const users = ids.length
    ? await User.find({ ...scope, _id: { $in: ids } }).select('name role')
    : [];
  const byId = new Map(users.map((user) => [String(user._id), user]));
  return entries.map((entry) => decorate(entry, byId.get(String(entry.userId))));
}

/**
 * GET /attendance
 *
 * `openOnly` ignores the date range and returns every currently open shift.
 * Otherwise the range is matched against `businessDate`. Voided entries are
 * hidden unless `includeVoided` is set.
 */
export async function listRegister(
  scope,
  { fromDate, toDate, openOnly, includeVoided, page, limit },
) {
  const filter = { ...scope };
  if (openOnly) filter.clockOutAt = null;
  else filter.businessDate = { $gte: fromDate, $lte: toDate };
  if (!includeVoided) filter.isVoided = false;

  const [entries, total] = await Promise.all([
    AttendanceEntry.find(filter)
      .sort({ clockInAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AttendanceEntry.countDocuments(filter),
  ]);

  return { entries: await decoratePage(scope, entries), total };
}

/**
 * GET /users/:userId/attendance
 *
 * One person's entries. A path, not `GET /attendance?userId=`, because
 * CONVENTIONS section 3 keeps a person's identifier out of the query string.
 */
export async function listForUser(scope, userId, { fromDate, toDate, page, limit }) {
  await loadUserInTenant(scope, userId);

  const filter = { ...scope, userId, isVoided: false };
  if (fromDate !== undefined) filter.businessDate = { $gte: fromDate, $lte: toDate };

  const [entries, total] = await Promise.all([
    AttendanceEntry.find(filter)
      .sort({ clockInAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AttendanceEntry.countDocuments(filter),
  ]);

  return { entries: await decoratePage(scope, entries), total };
}

/**
 * GET /attendance/me
 *
 * The caller's own open shift, their entries over the last seven business days,
 * and the total minutes those closed entries add up to.
 */
export async function myAttendance(scope, userId, { businessDayStartMinutes }) {
  const open = await AttendanceEntry.findOne({
    ...scope,
    userId,
    clockOutAt: null,
    isVoided: false,
  });

  const now = nowUtc();
  const rangeTo = businessDateFor(now, businessDayStartMinutes);
  const rangeFrom = businessDateFor(
    new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
    businessDayStartMinutes,
  );

  const recentDocs = await AttendanceEntry.find({
    ...scope,
    userId,
    isVoided: false,
    clockOutAt: { $ne: null },
    businessDate: { $gte: rangeFrom, $lte: rangeTo },
  }).sort({ clockInAt: -1 });

  const openShift = open
    ? {
        id: String(open._id),
        clockInAt: open.clockInAt,
        openMinutes: Math.max(0, minutesBetween(open.clockInAt, now)),
        businessDate: open.businessDate,
      }
    : null;

  const recent = recentDocs.map((entry) => ({
    id: String(entry._id),
    clockInAt: entry.clockInAt,
    clockOutAt: entry.clockOutAt,
    workedMinutes: entry.workedMinutes,
    businessDate: entry.businessDate,
    clockInSource: entry.clockInSource,
    clockOutSource: entry.clockOutSource,
  }));

  const rangeMinutes = recentDocs.reduce(
    (sum, entry) => sum + (entry.clockOutAt === null ? 0 : entry.workedMinutes),
    0,
  );

  return { openShift, recent, rangeMinutes, rangeFrom, rangeTo };
}

/**
 * GET /attendance/summary
 *
 * Minutes worked per user across a range of business days. Grouped in memory:
 * a restaurant has tens of staff, not thousands, and this dodges an aggregate
 * pipeline that would need its own tenant-filter handling. Voided entries are
 * in no count. Open entries contribute nothing but are counted separately so a
 * manager can see the total is provisional.
 */
export async function summary(scope, { fromDate, toDate }) {
  const entries = await AttendanceEntry.find({
    ...scope,
    isVoided: false,
    businessDate: { $gte: fromDate, $lte: toDate },
  }).select('userId workedMinutes clockOutAt');

  const byUser = new Map();
  for (const entry of entries) {
    const key = String(entry.userId);
    if (!byUser.has(key)) {
      byUser.set(key, { userId: key, totalMinutes: 0, entryCount: 0, openEntryCount: 0 });
    }
    const row = byUser.get(key);
    row.entryCount += 1;
    if (entry.clockOutAt === null) row.openEntryCount += 1;
    else row.totalMinutes += entry.workedMinutes ?? 0;
  }

  const ids = [...byUser.keys()];
  const users = ids.length
    ? await User.find({ ...scope, _id: { $in: ids } }).select('name role isActive')
    : [];
  const byId = new Map(users.map((user) => [String(user._id), user]));

  const rows = [...byUser.values()]
    .map((row) => {
      const user = byId.get(row.userId);
      return {
        userId: row.userId,
        userName: user?.name ?? null,
        userRole: user?.role ?? null,
        isActive: user?.isActive ?? null,
        totalMinutes: row.totalMinutes,
        entryCount: row.entryCount,
        openEntryCount: row.openEntryCount,
      };
    })
    .sort((a, b) => (a.userName ?? '').localeCompare(b.userName ?? ''));

  return { from: fromDate, to: toDate, rows };
}

export { withUser };
