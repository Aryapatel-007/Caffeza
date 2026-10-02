/**
 * Reading the audit trail. M8, built in P17. docs/API-CONTRACT.md "M8".
 *
 * Three reads: the feed for a range, one record's history, and the owner's
 * summary. Writing stays in auditService.js, alone.
 *
 * The manager restriction is part of every query, never a filter applied to a
 * response afterwards: a post-filter would leak the true `total` in the paging
 * block, and the number of hidden lines is itself information.
 *
 * Attendance corrections stay embedded on the attendance entry (M5 decision
 * D3) and are merged into the feed here, at read time, for the owner only and
 * only while the attendance feature is on. Nothing copies them.
 */
import mongoose from 'mongoose';

import { ROLES } from '../config/roles.js';
import { AttendanceEntry } from '../models/AttendanceEntry.js';
import {
  ATTENDANCE_CORRECTED,
  ATTENDANCE_ENTITY,
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AuditLog,
  MANAGER_VISIBLE_ACTIONS,
} from '../models/AuditLog.js';
import { User } from '../models/User.js';
import { NotFoundError } from '../utils/errors.js';
import { scoped, scopedForAggregate } from '../utils/scopedQuery.js';
import { businessDateRangeToUtc } from '../utils/time.js';
import { getSetting, isFeatureOn } from './settingsService.js';

const isManager = (req) => req.user.role === ROLES.MANAGER;

/** The instants a business-date range covers, from the restaurant's own day start. */
async function instantsFor(req, from, to) {
  const startMinutes = await getSetting(req.restaurantId, 'business.businessDayStartsAtMinutes', { req });
  return businessDateRangeToUtc(from, to, startMinutes);
}

/**
 * The actions this caller may read, narrowed by the ones asked for. An empty
 * list means nothing at all, never "no filter".
 */
function allowedActions(req, requested) {
  const visible = isManager(req) ? MANAGER_VISIBLE_ACTIONS : Object.values(AUDIT_ACTIONS);
  return requested ? visible.filter((action) => requested.includes(action)) : [...visible];
}

/** Whether attendance corrections join this read: owner, feature on, and asked for or not excluded. */
function includeAttendance(req, { action, entityType }) {
  if (isManager(req)) return Promise.resolve(false);
  if (entityType && entityType !== ATTENDANCE_ENTITY) return Promise.resolve(false);
  if (action && !action.includes(ATTENDANCE_CORRECTED)) return Promise.resolve(false);
  return isFeatureOn(req, 'attendance');
}

/** People's current names, and roles, by id. Names are never stored on an audit line. */
async function peopleById(req, ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const users = await User.find({ ...scoped(req), _id: { $in: unique } }).select('name role').lean();
  return new Map(users.map((user) => [String(user._id), user]));
}

function presentLine(line, people) {
  const actor = people.get(String(line.actorId));
  const target = line.entityType === AUDIT_ENTITY_TYPES.USER ? people.get(String(line.entityId)) : null;
  return {
    id: String(line._id),
    action: line.action,
    entityType: line.entityType,
    entityId: String(line.entityId),
    // A staff member's name is resolved now rather than written into the log.
    entityLabel: line.entityLabel ?? target?.name ?? null,
    actorId: String(line.actorId),
    actorName: actor?.name ?? null,
    actorRole: line.actorRole,
    at: line.at,
    reason: line.reason,
    amountInPaise: line.amountInPaise ?? null,
    details: line.details ?? {},
    source: 'AUDIT_LOG',
  };
}

/** Attendance corrections as feed lines. `actorRole` is the role now, and says so. */
async function attendanceLines(req, { start, end, actorId, entityId }) {
  const match = {
    ...scopedForAggregate(req),
    ...(entityId ? { _id: new mongoose.Types.ObjectId(entityId) } : {}),
  };
  const correctionMatch = {
    ...(start ? { 'corrections.correctedAt': { $gte: start, $lt: end } } : {}),
    ...(actorId ? { 'corrections.correctedBy': new mongoose.Types.ObjectId(actorId) } : {}),
  };
  const rows = await AttendanceEntry.aggregate([
    { $match: match },
    { $unwind: '$corrections' },
    { $match: correctionMatch },
    { $project: { userId: 1, businessDate: 1, correction: '$corrections' } },
  ]);
  return rows.map((row) => ({
    id: String(row.correction._id ?? `${row._id}-${row.correction.correctedAt.getTime()}`),
    action: ATTENDANCE_CORRECTED,
    entityType: ATTENDANCE_ENTITY,
    entityId: String(row._id),
    entityLabel: null,
    staffId: String(row.userId),
    businessDate: row.businessDate,
    actorId: String(row.correction.correctedBy),
    actorName: null,
    actorRole: null,
    actorRoleIsCurrent: true,
    at: row.correction.correctedAt,
    reason: row.correction.reason,
    amountInPaise: null,
    details: {
      field: row.correction.field,
      previousValue: row.correction.previousValue ?? null,
      newValue: row.correction.newValue ?? null,
    },
    source: 'ATTENDANCE_CORRECTION',
  }));
}

/** Names on merged corrections: the actor and their current role, and the staff member plus date. */
async function nameAttendance(req, lines) {
  const people = await peopleById(req, lines.flatMap((line) => [line.actorId, line.staffId]));
  return lines.map(({ staffId, businessDate, ...line }) => {
    const actor = people.get(line.actorId);
    const staff = people.get(staffId);
    return {
      ...line,
      actorName: actor?.name ?? null,
      actorRole: actor?.role ?? null,
      entityLabel: `${staff?.name ?? 'Staff member'}, ${businessDate}`.slice(0, 100),
    };
  });
}

/**
 * GET /audit. Newest first, paged. With attendance corrections merged, the
 * page is cut from both sources sorted together, and `total` counts both.
 */
export async function listAudit(req, { from, to, action, entityType, actorId, page, limit }) {
  const { start, end } = await instantsFor(req, from, to);
  const actions = allowedActions(req, action);
  const withAttendance = await includeAttendance(req, { action, entityType });
  const auditOnly = entityType !== ATTENDANCE_ENTITY;

  const filter = {
    ...scoped(req),
    at: { $gte: start, $lt: end },
    action: { $in: actions },
    ...(entityType && auditOnly ? { entityType } : {}),
    ...(actorId ? { actorId } : {}),
  };

  const wanted = page * limit;
  const [lines, auditTotal] = auditOnly && actions.length > 0
    ? await Promise.all([AuditLog.find(filter).sort({ at: -1, _id: -1 }).limit(wanted).lean(), AuditLog.countDocuments(filter)])
    : [[], 0];

  const people = await peopleById(req, lines.flatMap((line) => [line.actorId, line.entityType === AUDIT_ENTITY_TYPES.USER ? line.entityId : null]));
  let merged = lines.map((line) => presentLine(line, people));
  let total = auditTotal;

  if (withAttendance) {
    const corrections = await attendanceLines(req, { start, end, actorId });
    total += corrections.length;
    merged = [...merged, ...(await nameAttendance(req, corrections))];
    merged.sort((a, b) => new Date(b.at) - new Date(a.at) || (a.id < b.id ? 1 : -1));
  }

  return { lines: merged.slice((page - 1) * limit, wanted), total };
}

/**
 * GET /audit/entity/:entityType/:entityId. Oldest first, so it reads as a
 * history. 404 when this restaurant has no line for the record at all: a
 * record of another restaurant is indistinguishable from one that does not
 * exist, and never a 403.
 */
export async function entityHistory(req, entityType, entityId) {
  if (entityType === ATTENDANCE_ENTITY) {
    const entry = await AttendanceEntry.findOne({ ...scoped(req), _id: entityId }).select('_id').lean();
    if (!entry) throw new NotFoundError('Nothing has been recorded for that record.');
    if (isManager(req) || !(await isFeatureOn(req, 'attendance'))) return [];
    const lines = await nameAttendance(req, await attendanceLines(req, { entityId }));
    return lines.sort((a, b) => new Date(a.at) - new Date(b.at));
  }

  const base = { ...scoped(req), entityType, entityId };
  const exists = await AuditLog.exists(base);
  if (!exists) throw new NotFoundError('Nothing has been recorded for that record.');

  const lines = await AuditLog.find({ ...base, action: { $in: allowedActions(req) } }).sort({ at: 1, _id: 1 }).lean();
  const people = await peopleById(req, lines.flatMap((line) => [line.actorId, entityType === AUDIT_ENTITY_TYPES.USER ? line.entityId : null]));
  return lines.map((line) => presentLine(line, people));
}

/**
 * GET /audit/summary. OWNER only. Who voided, discounted, gave away and
 * corrected the most, ranked by value voided. Every figure is the
 * `amountInPaise` frozen on the audit line when it happened.
 */
export async function auditSummary(req, { from, to }) {
  const { start, end } = await instantsFor(req, from, to);
  const match = { ...scopedForAggregate(req), at: { $gte: start, $lt: end } };
  const is = (action) => ({ $eq: ['$action', action] });
  const amount = { $ifNull: ['$amountInPaise', 0] };

  const [byAction, byActorRaw] = await Promise.all([
    AuditLog.aggregate([
      { $match: match },
      { $group: { _id: '$action', count: { $sum: 1 }, amountInPaise: { $sum: amount } } },
    ]),
    AuditLog.aggregate([
      { $match: match },
      { $sort: { at: 1 } },
      {
        $group: {
          _id: '$actorId',
          actorRole: { $last: '$actorRole' },
          totalCount: { $sum: 1 },
          voidCount: { $sum: { $cond: [is(AUDIT_ACTIONS.BILL_VOIDED), 1, 0] } },
          voidAmountInPaise: { $sum: { $cond: [is(AUDIT_ACTIONS.BILL_VOIDED), amount, 0] } },
          discountCount: { $sum: { $cond: [is(AUDIT_ACTIONS.DISCOUNT_APPLIED), 1, 0] } },
          discountAmountInPaise: { $sum: { $cond: [is(AUDIT_ACTIONS.DISCOUNT_APPLIED), amount, 0] } },
          noChargeCount: { $sum: { $cond: [is(AUDIT_ACTIONS.NO_CHARGE_GIVEN), 1, 0] } },
          noChargeAmountInPaise: { $sum: { $cond: [is(AUDIT_ACTIONS.NO_CHARGE_GIVEN), amount, 0] } },
          paymentCorrectionCount: { $sum: { $cond: [is(AUDIT_ACTIONS.PAYMENT_METHOD_CORRECTED), 1, 0] } },
        },
      },
    ]),
  ]);

  const actions = byAction
    .map(({ _id, count, amountInPaise }) => ({ action: _id, count, amountInPaise }))
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action));

  if (await isFeatureOn(req, 'attendance')) {
    const corrections = await attendanceLines(req, { start, end });
    if (corrections.length > 0) actions.push({ action: ATTENDANCE_CORRECTED, count: corrections.length, amountInPaise: 0 });
  }

  const people = await peopleById(req, byActorRaw.map((row) => row._id));
  const byActor = byActorRaw
    .map(({ _id, ...row }) => ({ actorId: String(_id), actorName: people.get(String(_id))?.name ?? null, ...row }))
    .sort((a, b) => b.voidAmountInPaise - a.voidAmountInPaise || b.totalCount - a.totalCount);

  return {
    from,
    to,
    byAction: actions,
    byActor,
    totalEventCount: actions.reduce((sum, row) => sum + row.count, 0),
  };
}

export default { auditSummary, entityHistory, listAudit };
