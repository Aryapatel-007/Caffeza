/**
 * Pieces the report definitions share. M19, P15.
 */
import { ROLES } from '../../../config/roles.js';
import { businessDateRangeToUtc } from '../../../utils/time.js';
import { getSetting } from '../../settingsService.js';
import { LABELS } from '../labels.js';

export const MANAGERS = Object.freeze([ROLES.OWNER, ROLES.MANAGER]);
export const OWNER_ONLY = Object.freeze([ROLES.OWNER]);

/** A bill's net sales inside a pipeline: the sum of its slabs' taxable values. */
export const netSalesExpr = {
  $reduce: { input: '$taxBreakdown', initialValue: 0, in: { $add: ['$$value', '$$this.taxableInPaise'] } },
};

/** A drill to R19 with exactly these filters. */
export const toBills = (query) => ({ report: 'R19', query });

/** R2-style sections: the Figure, its Count and its Value. */
export const FIGURE_COLUMNS = Object.freeze([
  { key: 'line', label: LABELS.FIGURE, type: 'text' },
  { key: 'count', label: LABELS.COUNT, type: 'count' },
  { key: 'amountInPaise', label: LABELS.VALUE, type: 'money' },
]);

export const money = (line, amountInPaise, drill) => ({ line, amountInPaise, ...(drill ? { drill: { amountInPaise: drill } } : {}) });
export const count = (line, value, drill) => ({ line, count: value, ...(drill ? { drill: { count: drill } } : {}) });

/** The tenant and branch out of the engine's base match, for a read of another collection. */
export const tenantOf = (baseMatch) => ({ restaurantId: baseMatch.restaurantId, branchId: baseMatch.branchId });

/**
 * The UTC instants a business-date range covers, for records that store an
 * instant rather than a business date: cancelled lines and kitchen tickets.
 */
export async function instantsFor(req, from, to) {
  const startMinutes = await getSetting(req.restaurantId, 'business.businessDayStartsAtMinutes', { req });
  return businessDateRangeToUtc(from, to, startMinutes);
}

/** Whole minutes from one stored instant to another, inside a pipeline. */
export const minutesExpr = (from, to) => ({ $floor: { $divide: [{ $subtract: [to, from] }, 60_000] } });

/**
 * An average of whole minutes, as a `decimal2` cell: integer hundredths,
 * kept to one decimal place. A total divided by a count, after totalling;
 * null when there is nothing to average, never zero.
 */
export function averageMinutes(totalMinutes, count) {
  if (!count) return null;
  return Math.round((totalMinutes * 10) / count) * 10;
}
