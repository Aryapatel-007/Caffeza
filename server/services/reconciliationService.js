/**
 * The balance checks. M16 and M19. docs/RECONCILIATION-RULES.md.
 *
 * Started in P10 with the checks Day Close needs for one business date: C1,
 * C3, C4, C6, C8 and C9. P14 adds C2, C5, C7, C10, C11 and C12, and the range
 * versions. Each check is its own function below, returning one result:
 *
 *   { id, severity, passed, message, expected, actual, difference, refs }
 *
 * `refs` lists the bill numbers or record ids behind a failure. Messages use
 * the exact wording in RECONCILIATION-RULES.md with the values filled in.
 *
 * A check never changes data and never throws for a broken rule: it returns a
 * failed result. A check compares whole paise and never rounds first.
 */
import { Bill, BILL_STATUSES } from '../models/Bill.js';
import { paiseToRupees, sumPaise } from '../utils/money.js';
import { scoped } from '../utils/scopedQuery.js';
import { businessDateFor, businessDateRangeToUtc, toIst } from '../utils/time.js';
import { numberInSeries, seriesOf } from './dayFiguresService.js';
import { getSetting } from './settingsService.js';

export const SEVERITY = Object.freeze({ ERROR: 'ERROR', WARNING: 'WARNING' });

const rupees = (paise) => paiseToRupees(paise, { symbol: true });
const sum = (list, pick) => sumPaise(0, ...list.map(pick));
const paid = (bill) => sum(bill.payments, (payment) => payment.amountInPaise);

function result(id, severity, { passed, message, expected = null, actual = null, refs = [] }) {
  return {
    id,
    severity,
    passed,
    message,
    expected,
    actual,
    difference: expected === null || actual === null ? null : actual - expected,
    refs,
  };
}

/* ------------------------------------------------------------------------ *
 * One business date
 * ------------------------------------------------------------------------ */

/** C1 Bill arithmetic. Every live bill of the date. */
export function checkC1(bills) {
  const failures = [];
  for (const bill of bills) {
    const net = sum(bill.taxBreakdown, (slab) => slab.taxableInPaise);
    const gst = sum(bill.taxBreakdown, (slab) => slab.taxInPaise);
    const discount = bill.discount?.amountInPaise ?? 0;
    const rules = [
      ['Item total', sum(bill.lines, (line) => line.lineTotalInPaise), bill.subtotalInPaise],
      ['Net sales', bill.subtotalInPaise - discount, net],
      ...bill.taxBreakdown.map((slab) => [
        `GST at ${slab.taxRateBps / 100}%`,
        slab.taxInPaise,
        sumPaise(slab.cgstInPaise, slab.sgstInPaise),
      ]),
      ['GST', gst, bill.totalTaxInPaise],
      ['Bill total', sumPaise(net, gst, bill.roundOffInPaise), bill.grandTotalInPaise],
    ];
    let broken = rules.find(([, expected, actual]) => expected !== actual);
    if (!broken && (bill.roundOffInPaise < -49 || bill.roundOffInPaise > 50)) {
      broken = ['Round-off between -₹0.49 and +₹0.50', 0, bill.roundOffInPaise];
    }
    if (broken) failures.push({ bill, rule: broken[0], expected: broken[1], actual: broken[2] });
  }

  if (failures.length === 0) {
    return result('C1', SEVERITY.ERROR, { passed: true, message: 'C1 Bill arithmetic: every bill adds up.' });
  }
  const [first] = failures;
  return result('C1', SEVERITY.ERROR, {
    passed: false,
    message: `C1 Bill arithmetic: bill ${first.bill.billNumber} does not add up. ${first.rule} expected ${rupees(first.expected)}, found ${rupees(first.actual)}.`,
    expected: first.expected,
    actual: first.actual,
    refs: failures.map((failure) => failure.bill.billNumber),
  });
}

/**
 * C3 Where the money went. Payments on the day's bills, plus what was charged
 * to accounts, plus the unpaid remainder of UNPAID bills, equals the day's bill
 * total. The charge counts wherever it is recorded, so a bill wrongly marked
 * PAID fails C4 and not this.
 */
export function checkC3(businessDate, bills) {
  const billTotal = sum(bills, (bill) => bill.grandTotalInPaise);
  const received = sum(bills, paid);
  const onHold = sum(bills, (bill) => bill.chargedToAccountInPaise ?? 0);
  const unpaid = sum(
    bills.filter((bill) => bill.status === BILL_STATUSES.UNPAID),
    (bill) => bill.grandTotalInPaise - paid(bill),
  );
  const accounted = sumPaise(received, onHold, unpaid);
  const passed = accounted === billTotal;

  return result('C3', SEVERITY.ERROR, {
    passed,
    message: passed
      ? `C3 Money: on ${businessDate}, every rupee of the bill total is accounted for.`
      : `C3 Money: on ${businessDate}, bills total ${rupees(billTotal)} but received plus On Hold plus unpaid is ${rupees(accounted)}. ${rupees(Math.abs(billTotal - accounted))} is unaccounted for.`,
    expected: billTotal,
    actual: accounted,
    refs: passed ? [] : [businessDate],
  });
}

/** C4 Paid means paid. PAID adds up, UNPAID is short, ON_ACCOUNT adds up with its charge. */
export function checkC4(bills) {
  const failures = bills.filter((bill) => {
    const payments = paid(bill);
    if (bill.status === BILL_STATUSES.PAID) return payments !== bill.grandTotalInPaise;
    if (bill.status === BILL_STATUSES.UNPAID) return payments >= bill.grandTotalInPaise;
    if (bill.status === BILL_STATUSES.ON_ACCOUNT) {
      return sumPaise(payments, bill.chargedToAccountInPaise ?? 0) !== bill.grandTotalInPaise;
    }
    return false;
  });

  if (failures.length === 0) {
    return result('C4', SEVERITY.ERROR, { passed: true, message: 'C4 Payment: every bill is settled as its status says.' });
  }
  const [first] = failures;
  return result('C4', SEVERITY.ERROR, {
    passed: false,
    message: `C4 Payment: bill ${first.billNumber} is marked ${first.status} but its payments total ${rupees(paid(first))} against a bill total of ${rupees(first.grandTotalInPaise)}.`,
    expected: first.grandTotalInPaise,
    actual: paid(first),
    refs: failures.map((bill) => bill.billNumber),
  });
}

/**
 * C6 Invoices. Per series, among the numbers issued that day: none missing
 * between the lowest and highest, none repeated, and the lowest follows the
 * highest earlier number in the series when there is one. `earlier` maps a
 * series to its highest sequence before the day's lowest.
 */
export function checkC6(bills, earlierHighest = new Map()) {
  const problems = [];
  const bySeries = new Map();
  for (const bill of bills) bySeries.set(seriesOf(bill), [...(bySeries.get(seriesOf(bill)) ?? []), bill]);

  for (const [series, list] of bySeries) {
    const counts = new Map();
    for (const bill of list) counts.set(bill.billSequence, (counts.get(bill.billSequence) ?? 0) + 1);
    const sequences = [...counts.keys()].sort((a, b) => a - b);
    const low = sequences[0];
    const high = sequences.at(-1);

    const before = earlierHighest.get(series);
    if (before !== undefined && before !== null && before + 1 < low) {
      for (let sequence = before + 1; sequence < low; sequence += 1) {
        problems.push({ text: `number ${numberInSeries(series, sequence)} is missing from series ${series}.`, ref: numberInSeries(series, sequence) });
      }
    }
    for (let sequence = low; sequence <= high; sequence += 1) {
      const count = counts.get(sequence) ?? 0;
      const number = numberInSeries(series, sequence);
      if (count === 0) problems.push({ text: `number ${number} is missing from series ${series}.`, ref: number });
      if (count > 1) problems.push({ text: `number ${number} appears ${count} times.`, ref: number });
    }
  }

  if (problems.length === 0) {
    return result('C6', SEVERITY.ERROR, { passed: true, message: 'C6 Invoices: no number is missing or repeated.' });
  }
  return result('C6', SEVERITY.ERROR, {
    passed: false,
    message: `C6 Invoices: ${problems[0].text}`,
    refs: problems.map((problem) => problem.ref),
  });
}

/** C8 Business date matches the clock. */
export function checkC8(bills, startMinutes) {
  const failures = bills
    .map((bill) => ({ bill, computed: businessDateFor(bill.billedAt, startMinutes) }))
    .filter(({ bill, computed }) => computed !== bill.businessDate);

  if (failures.length === 0) {
    return result('C8', SEVERITY.ERROR, { passed: true, message: 'C8 Date: every bill sits on the business date its clock gives.' });
  }
  const [{ bill, computed }] = failures;
  return result('C8', SEVERITY.ERROR, {
    passed: false,
    message: `C8 Date: bill ${bill.billNumber} was issued at ${toIst(bill.billedAt)} India time, which is business date ${computed}, but it is stored as ${bill.businessDate}.`,
    refs: failures.map((failure) => failure.bill.billNumber),
  });
}

/**
 * C9 Cash drawer. The expected cash must be its own parts added up (ERROR if
 * not, because then the arithmetic is broken), and a count that differs from
 * it is a WARNING. Without a count, only the arithmetic is checked.
 */
export function checkC9(cash, countedCashInPaise = null) {
  const parts = sumPaise(
    cash.openingFloatInPaise,
    cash.cashFromBillsInPaise,
    cash.cashCollectionsInPaise,
    cash.paidInInPaise,
    -cash.paidOutInPaise,
  );
  if (parts !== cash.expectedCashInPaise) {
    return result('C9', SEVERITY.ERROR, {
      passed: false,
      message: `C9 Cash: expected cash is ${rupees(cash.expectedCashInPaise)} but its parts add up to ${rupees(parts)}.`,
      expected: parts,
      actual: cash.expectedCashInPaise,
    });
  }
  if (countedCashInPaise === null || countedCashInPaise === undefined) {
    return result('C9', SEVERITY.WARNING, {
      passed: true,
      message: 'C9 Cash: the drawer has not been counted yet.',
      expected: cash.expectedCashInPaise,
    });
  }
  const difference = countedCashInPaise - cash.expectedCashInPaise;
  return result('C9', SEVERITY.WARNING, {
    passed: difference === 0,
    message:
      difference === 0
        ? `C9 Cash: counted ${rupees(countedCashInPaise)}, exactly as expected.`
        : `C9 Cash: counted ${rupees(countedCashInPaise)}, expected ${rupees(cash.expectedCashInPaise)}. ${rupees(Math.abs(difference))} ${difference < 0 ? 'short' : 'over'}.`,
    expected: cash.expectedCashInPaise,
    actual: countedCashInPaise,
  });
}

/**
 * Every one-day check for `businessDate`, given its figures. C6 and C8 also
 * look at bills whose clock falls in the day, so a bill stored on the wrong
 * date is caught by C8 alone rather than also opening a gap in C6.
 */
export async function runDayChecks(req, businessDate, figures, { countedCashInPaise = null, session = null } = {}) {
  const startMinutes = await getSetting(req.restaurantId, 'business.businessDayStartsAtMinutes', { req });
  const { start, end } = businessDateRangeToUtc(businessDate, businessDate, startMinutes);
  const options = session ? { session } : {};

  const register = await Bill.find({
    ...scoped(req),
    $or: [{ businessDate }, { billedAt: { $gte: start, $lt: end } }],
  })
    .setOptions(options)
    .lean();
  const dayBills = register.filter((bill) => bill.businessDate === businessDate);
  const liveDayBills = dayBills.filter((bill) => !bill.isVoided);

  const earlierHighest = new Map();
  const lowest = new Map();
  for (const bill of register) {
    const series = seriesOf(bill);
    lowest.set(series, Math.min(lowest.get(series) ?? Infinity, bill.billSequence));
  }
  for (const [series, low] of lowest) {
    const seriesFilter = series === register.find((bill) => seriesOf(bill) === series)?.financialYear
      ? { $or: [{ invoiceSeries: series }, { invoiceSeries: null, financialYear: series }] }
      : { invoiceSeries: series };
    const [previous] = await Bill.find({ ...scoped(req), ...seriesFilter, billSequence: { $lt: low } })
      .sort({ billSequence: -1 })
      .limit(1)
      .select('billSequence')
      .setOptions(options)
      .lean();
    if (previous) earlierHighest.set(series, previous.billSequence);
  }

  return [
    checkC1(liveDayBills),
    checkC3(businessDate, liveDayBills),
    checkC4(liveDayBills),
    checkC6(register, earlierHighest),
    checkC8(register, startMinutes),
    checkC9(figures.cash, countedCashInPaise),
  ];
}

export default { checkC1, checkC3, checkC4, checkC6, checkC8, checkC9, runDayChecks, SEVERITY };
