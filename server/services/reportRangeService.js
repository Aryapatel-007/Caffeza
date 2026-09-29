/**
 * The range rules every M6 report shares.
 *
 * Small on purpose. These three things are needed by nearly every endpoint in
 * the module, and a copy of any of them in two report services is a copy that
 * eventually disagrees -- the trust-in-two-numbers problem BUILD-PLAN names,
 * applied to the range rather than to the arithmetic.
 */
import { RangeTooLargeError } from '../utils/errors.js';
import { scopedForAggregate } from '../utils/scopedQuery.js';

/**
 * A year and a day.
 *
 * A year so a full financial year fits in one request, which is the longest
 * range anyone has a real reason to ask for. The extra day so that
 * "1 April to 31 March" inclusive -- 366 days in a leap year -- is not
 * rejected by one for being exactly the thing the cap was sized to allow.
 */
export const MAX_RANGE_DAYS = 366;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Days between two "YYYY-MM-DD" business dates, inclusive of both ends.
 *
 * Parsed as UTC midnight deliberately. These are business-date LABELS, not
 * instants: the comparison is between two strings that both mean "a day", and
 * anchoring both at the same arbitrary offset makes the subtraction exact
 * without dragging a timezone into a question that has none. DB-SCHEMA
 * section 7 is why they are strings in the first place.
 */
export function inclusiveDayCount(from, to) {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  return Math.floor((end - start) / MS_PER_DAY) + 1;
}

/**
 * Validates a business-date range and returns it.
 *
 * Throws `RangeTooLargeError` (422) past the cap, because without one a single
 * request scans years of bills and stalls the database the floor is taking
 * orders against.
 *
 * A backwards range (`to` before `from`) is not an error here: it yields a
 * negative day count, is refused by the same cap check below as "0 days or
 * fewer", and every endpoint then returns empty rather than silently swapping
 * the two and answering a question nobody asked.
 */
export function assertRange({ from, to }) {
  const days = inclusiveDayCount(from, to);

  if (days > MAX_RANGE_DAYS) throw new RangeTooLargeError(days, MAX_RANGE_DAYS);

  return { from, to, days };
}

/**
 * The first stage of every M6 pipeline.
 *
 * `scopedForAggregate`, never `scoped`: an aggregation pipeline is handed to
 * the server uncast, and `req.restaurantId` is a string off the JWT, so a
 * `$match` built from `scoped` compares a string to an ObjectId and matches
 * nothing. That bug shipped in M3's bill list for about an hour and returned a
 * silent zero rather than an error, which is the worst shape this can take.
 *
 * The tenant guard also requires the tenant filter to be the FIRST stage --
 * a `$match` after a `$lookup` or a `$group` has already read across every
 * restaurant to build its result -- so this is always stage one, never merged
 * into a later stage for tidiness.
 */
export function tenantMatch(req, extra = {}) {
  return { $match: { ...scopedForAggregate(req), ...extra } };
}

/**
 * The tenant match plus a business-date range and the not-voided rule, which
 * together are the opening stage of almost every report.
 *
 * `isVoided: false` belongs HERE, in the first `$match`, not in a later filter
 * or a post-aggregation `.filter()`. BUILD-PLAN calls the soft-delete leak
 * recurring, and M6 is where it would first become a wrong number an owner
 * acts on. Putting it in the same stage as the tenant filter also means it
 * uses the same index.
 */
export function liveInRange(req, { from, to }, dateField = 'businessDate') {
  return tenantMatch(req, {
    [dateField]: { $gte: from, $lte: to },
    isVoided: false,
  });
}

export default { assertRange, inclusiveDayCount, liveInRange, tenantMatch, MAX_RANGE_DAYS };
