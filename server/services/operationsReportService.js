/**
 * The operations side of M6: stock consumption, labour hours, and the two
 * dashboard panels that read neither bills nor orders.
 *
 * Separate from salesReportService.js because these read entirely different
 * collections -- `stockmovements`, `attendanceentries`, `ingredients` -- and
 * one of them, stock consumption, has a range rule the sales reports do not.
 */
import mongoose from 'mongoose';

import { AttendanceEntry } from '../models/AttendanceEntry.js';
import { Ingredient } from '../models/Ingredient.js';
import { MOVEMENT_TYPES, StockMovement } from '../models/StockMovement.js';
import { Restaurant } from '../models/Restaurant.js';
import { scoped } from '../utils/scopedQuery.js';
import { businessDateRangeToUtc, DEFAULT_BUSINESS_DAY_START_MINUTES } from '../utils/time.js';
import { liveInRange, tenantMatch } from './reportRangeService.js';
import { getSetting, isFeatureOn } from './settingsService.js';

/** The restaurant's own business-day boundary. Looked up by _id from a verified token. */
async function businessDayStartFor(restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId).select('settings');
  return restaurant?.settings?.businessDayStartsAtMinutes ?? DEFAULT_BUSINESS_DAY_START_MINUTES;
}

/* ---------------------------------------------------------------------- *
 * 9. Stock consumption
 * ---------------------------------------------------------------------- */

/**
 * What was actually used, wasted, and received over a range.
 *
 * The one report whose range is not a straight `businessDate` string match:
 * `stockmovements` stores only `at`, a real instant, and has no
 * `businessDate` field. So the range is converted to a UTC instant window
 * first, using this restaurant's own boundary, by `businessDateRangeToUtc` in
 * `server/utils/time.js` -- written there, once, exactly as the contract
 * asks, and never inlined here.
 *
 * Converting this direction rather than deriving a business date per movement
 * is also what lets the query use the existing
 * `{ restaurantId, branchId, at }` index. Deriving per row could not.
 *
 * `netConsumedInBase` is the number that answers "how much paneer did we
 * actually use": deductions less the returns that reversed them.
 * `wastageInBase` deliberately sums WASTAGE and SPILLAGE together, because
 * the actionable question is "how much are we throwing away", not which of
 * two words someone picked at the time.
 */
export async function stockConsumption(req, { from, to, ingredientId }) {
  const startMinutes = await businessDayStartFor(req.restaurantId);
  const { start, end } = businessDateRangeToUtc(from, to, startMinutes);

  const match = { at: { $gte: start, $lt: end } };
  if (ingredientId) match.ingredientId = new mongoose.Types.ObjectId(String(ingredientId));

  const sumOf = (...types) => ({
    $sum: { $cond: [{ $in: ['$type', types] }, { $abs: '$qtyInBase' }, 0] },
  });

  const rows = await StockMovement.aggregate([
    tenantMatch(req, match),
    {
      $group: {
        _id: '$ingredientId',
        consumedInBase: sumOf(MOVEMENT_TYPES.DEDUCTION),
        returnedInBase: sumOf(MOVEMENT_TYPES.CANCELLATION_RETURN),
        wastageInBase: sumOf(MOVEMENT_TYPES.WASTAGE, MOVEMENT_TYPES.SPILLAGE),
        receivedInBase: sumOf(MOVEMENT_TYPES.RECEIVED, MOVEMENT_TYPES.RETURN),
        /**
         * A RECOUNT is the one movement type whose sign is meaningful rather
         * than implied by the type -- it is the signed difference a physical
         * count found -- so it is summed as-is, not through $abs.
         */
        recountAdjustmentInBase: {
          $sum: { $cond: [{ $eq: ['$type', MOVEMENT_TYPES.RECOUNT] }, '$qtyInBase', 0] },
        },
      },
    },
    {
      $lookup: { from: 'ingredients', localField: '_id', foreignField: '_id', as: 'ingredient' },
    },
    {
      $project: {
        _id: 0,
        ingredientId: { $toString: '$_id' },
        name: { $ifNull: [{ $first: '$ingredient.name' }, 'Deleted ingredient'] },
        baseUnit: { $first: '$ingredient.baseUnit' },
        consumedInBase: 1,
        returnedInBase: 1,
        netConsumedInBase: { $subtract: ['$consumedInBase', '$returnedInBase'] },
        wastageInBase: 1,
        receivedInBase: 1,
        recountAdjustmentInBase: 1,
      },
    },
    { $sort: { netConsumedInBase: -1 } },
  ]);

  return rows;
}

/* ---------------------------------------------------------------------- *
 * 10. Labour hours
 * ---------------------------------------------------------------------- */

/**
 * Minutes worked per person over a range, and every shift still open.
 *
 * OPEN SHIFTS CONTRIBUTE ZERO MINUTES and are listed separately. This is the
 * single most important rule in this function. `workedMinutes` is null while
 * a shift is open because M5 deliberately refuses to invent a clock-out time,
 * and M6 refuses in exactly the same way: nothing here computes elapsed time
 * for an open shift. A figure that grows while you look at it is not an
 * hours-worked number, and this feeds payroll in M11, where inventing minutes
 * would mean paying someone for them.
 *
 * `openShifts` exists so a forgotten clock-out surfaces to whoever reads the
 * report rather than silently dragging an average down.
 */
export async function labourHours(req, { from, to, userId }) {
  const match = {};
  if (userId) match.userId = new mongoose.Types.ObjectId(String(userId));

  const closed = { $ne: [{ $ifNull: ['$workedMinutes', null] }, null] };

  const byUser = await AttendanceEntry.aggregate([
    { $match: { ...liveInRange(req, { from, to }).$match, ...match } },
    {
      $group: {
        _id: '$userId',
        totalMinutes: { $sum: { $cond: [closed, '$workedMinutes', 0] } },
        shiftCount: { $sum: { $cond: [closed, 1, 0] } },
        openShiftCount: { $sum: { $cond: [closed, 0, 1] } },
      },
    },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    {
      $project: {
        _id: 0,
        userId: { $toString: '$_id' },
        name: { $ifNull: [{ $first: '$user.name' }, 'Unknown user'] },
        role: { $first: '$user.role' },
        totalMinutes: 1,
        shiftCount: 1,
        openShiftCount: 1,
        averageShiftMinutes: {
          $cond: [
            { $gt: ['$shiftCount', 0] },
            { $floor: { $divide: ['$totalMinutes', '$shiftCount'] } },
            0,
          ],
        },
      },
    },
    { $sort: { totalMinutes: -1 } },
  ]);

  const openShifts = await AttendanceEntry.aggregate([
    {
      $match: {
        ...liveInRange(req, { from, to }).$match,
        ...match,
        clockOutAt: null,
      },
    },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
    { $sort: { clockInAt: 1 } },
    {
      $project: {
        _id: 0,
        userId: { $toString: '$userId' },
        name: { $ifNull: [{ $first: '$user.name' }, 'Unknown user'] },
        clockInAt: 1,
        businessDate: 1,
      },
    },
  ]);

  return {
    from,
    to,
    totalMinutes: byUser.reduce((total, row) => total + row.totalMinutes, 0),
    byUser,
    openShifts,
  };
}

/* ---------------------------------------------------------------------- *
 * Dashboard pieces
 * ---------------------------------------------------------------------- */

/**
 * Ingredients at or below their own threshold, worst first.
 *
 * The same `currentQtyInBase <= lowStockThresholdInBase` rule M4's own stock
 * list uses, computed on read there and computed on read here, because
 * neither stores it. Capped at 10: this is a dashboard panel, and an owner
 * scanning it at 9am needs the worst few, not everything.
 */
export async function lowStock(req, { limit = 10 } = {}) {
  /**
   * `lowStockAlertsEnabled: false` empties the dashboard panel, added by M7.
   *
   * The quantities are untouched and the stock screens still show them. An
   * owner who has switched the alerts off has said "stop showing me this",
   * not "stop tracking this".
   */
  if (!(await getSetting(req.restaurantId, 'inventory.lowStockAlertsEnabled', { req }))) return [];

  // P02. Inventory switched off: the same empty list, the same shape.
  if (!(await isFeatureOn(req, 'inventory'))) return [];

  const rows = await Ingredient.find({ ...scoped(req), isActive: true })
    .select('name currentQtyInBase baseUnit lowStockThresholdInBase')
    .lean();

  return rows
    .filter((row) => row.currentQtyInBase <= row.lowStockThresholdInBase)
    .sort((a, b) => a.currentQtyInBase - b.currentQtyInBase)
    .slice(0, limit)
    .map((row) => ({
      ingredientId: String(row._id),
      name: row.name,
      currentQtyInBase: row.currentQtyInBase,
      baseUnit: row.baseUnit,
      lowStockThresholdInBase: row.lowStockThresholdInBase,
    }));
}

/**
 * How many people are clocked in right now. Not scoped to a date: "right now" has none.
 *
 * Null when attendance is switched off (P02). Not zero: zero says nobody is on
 * shift, and with attendance off nobody knows.
 */
export async function staffOnShift(req) {
  if (!(await isFeatureOn(req, 'attendance'))) return null;
  return AttendanceEntry.countDocuments({ ...scoped(req), clockOutAt: null, isVoided: false });
}

export default { labourHours, lowStock, staffOnShift, stockConsumption };
