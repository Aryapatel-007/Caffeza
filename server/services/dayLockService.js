/**
 * The day lock. M16, built in P10. docs/API-CONTRACT.md "M16" section 7.
 *
 * Once a business date is CLOSED, every write that would change that date's
 * figures is refused with 409 DAY_CLOSED. One helper, called once per write,
 * inside the write's transaction when it has one. A REOPENED date is open.
 */
import { DAY_STATUSES, DayClosure } from '../models/DayClosure.js';
import { DayClosedError } from '../utils/errors.js';
import { scoped } from '../utils/scopedQuery.js';
import { businessDateFor, nowUtc } from '../utils/time.js';
import { getSetting } from './settingsService.js';

/** Throws 409 DAY_CLOSED when `businessDate` is closed. Every date given is checked. */
export async function assertDayOpen(req, businessDates, { session = null } = {}) {
  const dates = [...new Set([businessDates].flat().filter(Boolean))];
  if (dates.length === 0) return;

  const closed = await DayClosure.findOne({
    ...scoped(req),
    businessDate: { $in: dates },
    status: DAY_STATUSES.CLOSED,
  })
    .select('businessDate')
    .setOptions(session ? { session } : {})
    .lean();

  if (closed) throw new DayClosedError(closed.businessDate);
}

/** Today's business date for this restaurant, from the service clock. */
export async function todayBusinessDate(req) {
  const startMinutes = await getSetting(req.restaurantId, 'business.businessDayStartsAtMinutes', {
    req,
  });
  return businessDateFor(nowUtc(), startMinutes);
}

export default { assertDayOpen, todayBusinessDate };
