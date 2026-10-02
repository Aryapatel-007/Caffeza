/**
 * The report engine. M19, built in P14. docs/API-CONTRACT.md "M19 Reports v2".
 *
 * Every M19 report runs through `runReport`, in this order and nowhere else:
 *
 *   1. validate the request against the definition's schema;
 *   2. check the range against MAX_RANGE_DAYS;
 *   3. build the base match: tenant, branch, the business date range on the
 *      definition's date field, and voided bills left out;
 *   4. run the definition's own query, which returns rows and totals in paise;
 *   5. work out the open days from `dayclosures`;
 *   6. run the definition's checks through reconciliationService;
 *   7. write the filter sentence;
 *   8. attach the columns with their glossary labels;
 *   9. return the envelope.
 *
 * Rules every definition follows:
 *   - sums in paise only, through `$sum` or `sumPaise`;
 *   - averages as a total divided by a total, with `averagePaise`, and only
 *     after totalling;
 *   - group only on frozen fields;
 *   - never read `menuitems`, `categories`, `users` or `paymentmethods` to
 *     produce a figure. People's names come through `ctx.personNames`, here,
 *     as labels only. A test reads every definition file and enforces it.
 *   - never build its own tenant match: start from `baseMatch`.
 */
import { DAY_STATUSES, DayClosure } from '../../models/DayClosure.js';
import { Bill } from '../../models/Bill.js';
import { PaymentMethod } from '../../models/PaymentMethod.js';
import { User } from '../../models/User.js';
import { platformByCode } from '../../config/platforms.js';
import { DISCOUNT_REASONS } from '../../config/discountReasons.js';
import { CheckFailedError, ValidationError } from '../../utils/errors.js';
import { scoped } from '../../utils/scopedQuery.js';
import { nowUtc } from '../../utils/time.js';
import { assertRange, liveInRange } from '../reportRangeService.js';
import { datesBetween } from '../reconciliationService.js';
import { getSetting } from '../settingsService.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "2026-09-26" as "26 Sep 2026". A business date is a label, read without a time zone. */
export function dateWords(businessDate) {
  const [year, month, day] = businessDate.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** 300 minutes as "5:00 AM". */
export function clockWords(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = String(minutes % 60).padStart(2, '0');
  const suffix = hours < 12 ? 'AM' : 'PM';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${mins} ${suffix}`;
}

const ORDER_TYPE_WORDS = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };
const STATUS_WORDS = { UNPAID: 'Unpaid', PAID: 'Paid', ON_ACCOUNT: 'On Hold', VOIDED: 'Voided' };

/**
 * How each filter reads in the filter sentence: its value in words, and its
 * "all" form for a report that names it as a dimension. `describe` may look up
 * a name from stored bills, never from `users`.
 */
const FILTER_WORDS = {
  orderType: { all: 'All order types.', describe: (value) => `Order type: ${ORDER_TYPE_WORDS[value] ?? value}.` },
  platform: { all: 'All platforms.', describe: (value) => `Platform: ${platformByCode(value)?.name ?? value}.` },
  captainId: {
    all: 'All captains.',
    describe: async (value, req) => {
      const bill = await Bill.findOne({ ...scoped(req), captainId: value }).sort({ billedAt: -1 }).select('captainName').lean();
      return `Captain: ${bill?.captainName ?? 'Unknown'}.`;
    },
  },
  table: { all: 'All tables.', describe: (value) => `Table: ${value}.` },
  method: {
    all: 'All payment methods.',
    describe: async (value, req) => {
      const bill = await Bill.findOne({ ...scoped(req), 'payments.method': value }).sort({ billedAt: -1 }).select('payments').lean();
      const name = bill?.payments.find((payment) => payment.method === value)?.methodName ?? value;
      return `Payment method: ${name}.`;
    },
  },
  status: { all: 'All statuses.', describe: (value) => `Status: ${STATUS_WORDS[value] ?? value}.` },
  categoryName: { all: 'All categories.', describe: (value) => `Category: ${value}.` },
  itemName: { all: 'All items.', describe: (value) => `Item: ${value}.` },
  taxRateBps: { all: 'All tax rates.', describe: (value) => `Tax rate: ${value / 100}%.` },
  discountReason: {
    all: 'All discount reasons.',
    describe: (value) => `Discount reason: ${DISCOUNT_REASONS.find((reason) => reason.code === value)?.label ?? value}.`,
  },
  accountId: { all: 'All accounts.', describe: () => 'One On Hold account.' },
  hour: { all: 'All hours.', describe: (value) => `Hour: ${clockWords(value * 60).replace(':00', '')}.` },
  weekday: { all: 'All weekdays.', describe: (value) => `Weekday: ${WEEKDAYS[value - 1]}.` },
  hasDiscount: { all: '', describe: (value) => (value ? 'With a discount.' : 'Without a discount.') },
  hasCancellations: { all: '', describe: (value) => (value ? 'With a cancelled item.' : 'Without a cancelled item.') },
  billNumber: { all: '', describe: (value) => `Invoice number: ${value}.` },
};

/** The one line at the top of every report saying exactly what it covers. */
export async function filterSentence(req, definition, params) {
  const startMinutes = await getSetting(req.restaurantId, 'business.businessDayStartsAtMinutes', { req });
  const parts = [];
  if (params.date) parts.push(`${dateWords(params.date)}.`);
  else if (params.from === params.to) parts.push(`${dateWords(params.from)}.`);
  else parts.push(`${dateWords(params.from)} to ${dateWords(params.to)}.`);
  parts.push(`Business day starts ${clockWords(startMinutes)}.`);

  const dimensions = new Set(definition.dimensions ?? []);
  for (const name of definition.filters ?? []) {
    const words = FILTER_WORDS[name];
    if (!words) continue;
    const value = params[name];
    if (value === undefined || value === null) {
      if (dimensions.has(name) && words.all) parts.push(words.all);
      continue;
    }
    parts.push(await words.describe(value, req));
  }

  parts.push(definition.includesVoided?.(params) ? 'Voided bills included.' : 'Voided bills left out.');
  return parts.join(' ');
}

/** Business dates in the range with no CLOSED close. A REOPENED date is open. */
export async function openDaysIn(req, from, to) {
  const closed = await DayClosure.find({
    ...scoped(req),
    businessDate: { $gte: from, $lte: to },
    status: DAY_STATUSES.CLOSED,
  })
    .select('businessDate')
    .lean();
  const closedDates = new Set(closed.map((closure) => closure.businessDate));
  return datesBetween(from, to).filter((date) => !closedDates.has(date));
}

/**
 * People's current names by id, as labels only. The one place a report reads
 * `users`, so no definition has to: names never group or add up anything.
 */
export async function personNames(req, ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const users = await User.find({ ...scoped(req), _id: { $in: unique } }).select('name').lean();
  return new Map(users.map((user) => [String(user._id), user.name]));
}

/**
 * The restaurant's payment methods, for a report that draws one column per
 * method (R5). Names and order only: a figure always comes from the frozen
 * fields on the payment, never from here.
 */
export function paymentMethodList(req) {
  return PaymentMethod.find({ ...scoped(req) }).sort({ displayOrder: 1, createdAt: 1 }).select('code name kind isActive tallyLedgerCode').lean();
}

/** Runs one report. Returns the envelope, and `meta` for a paged report. */
export async function runReport(req, definition, query) {
  // 1. Validate.
  const parsed = definition.schema.safeParse(query);
  if (!parsed.success) {
    const fields = {};
    for (const issue of parsed.error.issues) fields[issue.path.join('.') || 'query'] ??= issue.message;
    const count = Object.keys(fields).length;
    throw new ValidationError(count === 1 ? 'One of the values sent was not valid.' : `${count} of the values sent were not valid.`, fields);
  }
  const params = parsed.data;
  const from = params.from ?? params.date;
  const to = params.to ?? params.date;

  // 2. The range.
  assertRange({ from, to });

  // 3. The base match. A definition starts from this and never builds its own.
  const baseMatch = liveInRange(req, { from, to }, definition.dateField ?? 'businessDate').$match;
  if (definition.includesVoided?.(params)) delete baseMatch.isVoided;

  // 4. The definition's own query.
  const ctx = {
    personNames: (ids) => personNames(req, ids),
    paymentMethods: () => paymentMethodList(req),
    openDays: () => openDaysIn(req, from, to),
    from,
    to,
  };
  const result = await definition.query(req, baseMatch, params, ctx);

  // 5 and 6. Open days, and the checks.
  const openDays = await openDaysIn(req, from, to);
  const checks = definition.checks ? await definition.checks(req, params, result, ctx) : [];

  // R9 refuses to build while any ERROR check fails, and says which.
  if (definition.requiresPassingChecks) {
    const failed = checks.filter((check) => check.severity === 'ERROR' && !check.passed);
    if (failed.length > 0) throw new CheckFailedError(failed);
  }

  // 7. The filter sentence.
  const sentence = await filterSentence(req, definition, params);

  // 8 and 9. Columns and the envelope.
  const filter = Object.fromEntries(
    Object.entries(params).filter(([key, value]) => value !== undefined && key !== 'format' && key !== 'page' && key !== 'limit'),
  );
  const envelope = {
    report: definition.id,
    title: definition.title,
    filter,
    filterSentence: sentence,
    openDays,
    ...(result.sections
      ? { sections: result.sections }
      : { columns: result.columns ?? definition.columns, rows: result.rows, totals: result.totals }),
    ...(result.extra ?? {}),
    ...(definition.sheetPerSection ? { sheetPerSection: true } : {}),
    checks,
    generatedAt: nowUtc().toISOString(),
  };

  return { envelope, meta: result.meta ?? null, params };
}

export default { clockWords, dateWords, filterSentence, openDaysIn, personNames, runReport };
