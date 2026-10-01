/**
 * R2 Day Close. M19, built in P15. docs/API-CONTRACT.md "M19" R2.
 *
 * Never a second calculation: an open day is `computeDayFigures`, a closed day
 * is the stored `dayclosures.snapshot`, both through dayCloseService.readDay,
 * which also applies the blind count. A closed day also runs C12, comparing
 * the snapshot with a fresh computation.
 */
import { platformByCode } from '../../../config/platforms.js';
import { readDay } from '../../dayCloseService.js';
import { runRangeChecks } from '../../reconciliationService.js';
import { dayQuery } from '../params.js';
import { FIGURE_COLUMNS, MANAGERS, count, money, toBills } from './shared.js';

const ORDER_TYPE_WORDS = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };

function sections(day, date) {
  const f = day.figures;
  const day1 = { from: date, to: date };
  const s = f.sales;
  const sales = [
    count('Bills', s.billCount, toBills(day1)),
    count('Covers', s.covers, toBills({ ...day1, orderType: 'DINE_IN' })),
    money('Item total', s.itemTotalInPaise, toBills(day1)),
    money('Discount', s.discountInPaise, toBills({ ...day1, hasDiscount: true })),
    money('Net sales', s.netSalesInPaise, toBills(day1)),
    money('CGST', s.cgstInPaise, toBills(day1)),
    money('SGST', s.sgstInPaise, toBills(day1)),
    money('GST', s.gstInPaise, toBills(day1)),
    money('Round-off', s.roundOffInPaise, toBills(day1)),
    money('Bill total', s.billTotalInPaise, toBills(day1)),
    money('Average bill', s.averageBillInPaise),
    money('Average per cover', s.averagePerCoverInPaise),
  ];

  const m = f.money;
  const moneyRows = [
    ...m.methods.filter((row) => row.methodKind === 'IN_HAND').map((row) => money(row.methodName, row.amountInPaise, toBills({ ...day1, method: row.method }))),
    money('Money in hand', m.inHandInPaise),
    ...m.methods.filter((row) => row.methodKind === 'PLATFORM').map((row) => money(row.methodName, row.amountInPaise, toBills({ ...day1, method: row.method }))),
    money('Platform money', m.platformInPaise),
    ...m.onHold.map((row) => money(`On Hold: ${row.accountName}`, row.amountInPaise, row.accountId ? toBills({ ...day1, accountId: row.accountId }) : null)),
    money('Unpaid', m.unpaidInPaise, toBills({ ...day1, status: 'UNPAID' })),
    money('Total', m.totalInPaise),
  ];

  const c = f.cash;
  const cash = [
    money('Opening float', c.openingFloatInPaise),
    money('Cash from bills', c.cashFromBillsInPaise, toBills({ ...day1, method: 'CASH' })),
    money('Cash collections', c.cashCollectionsInPaise),
    money('Paid in', c.paidInInPaise),
    money('Paid out', c.paidOutInPaise),
    ...(c.expectedCashInPaise !== undefined ? [money('Expected cash', c.expectedCashInPaise)] : []),
    ...(day.countedCashInPaise !== null && day.countedCashInPaise !== undefined ? [money('Counted cash', day.countedCashInPaise)] : []),
    ...(day.differenceInPaise !== null && day.differenceInPaise !== undefined ? [money('Cash difference', day.differenceInPaise)] : []),
  ];

  const orderTypes = f.orderTypes.map((row) => ({
    line: row.platformCode
      ? `${ORDER_TYPE_WORDS[row.orderType]}, ${platformByCode(row.platformCode)?.name ?? row.platformCode}`
      : ORDER_TYPE_WORDS[row.orderType] ?? row.orderType,
    count: row.billCount,
    amountInPaise: row.billTotalInPaise,
    netSalesInPaise: row.netSalesInPaise,
    covers: row.covers,
    drill: { count: toBills({ ...day1, orderType: row.orderType, ...(row.platformCode ? { platform: row.platformCode } : {}) }) },
  }));

  const gst = f.gst.map((row) => ({
    line: row.platformCollects ? 'GST paid by platform, section 9(5)' : `${row.taxRateBps / 100}%`,
    amountInPaise: row.netSalesInPaise,
    cgstInPaise: row.cgstInPaise,
    sgstInPaise: row.sgstInPaise,
    gstInPaise: row.gstInPaise,
    drill: { amountInPaise: toBills({ ...day1, taxRateBps: row.taxRateBps }) },
  }));

  const g = f.controls;
  const controls = [
    { line: 'Discounts', count: g.discounts.count, amountInPaise: g.discounts.totalInPaise, drill: { count: toBills({ ...day1, hasDiscount: true }) } },
    { line: 'No Charge', count: g.noCharge.count, amountInPaise: g.noCharge.valueInPaise, drill: { count: { report: 'R16', query: day1 } } },
    { line: 'Items cancelled', count: g.cancelledItems.count, amountInPaise: g.cancelledItems.valueInPaise, drill: { count: { report: 'R15', query: day1 } } },
    { line: 'Wasted value', amountInPaise: g.cancelledItems.wastedValueInPaise },
    { line: 'Orders cancelled', count: g.cancelledOrders.count, amountInPaise: g.cancelledOrders.valueInPaise },
    { line: 'Voided bills', count: g.voidedBills.count, amountInPaise: g.voidedBills.valueInPaise, drill: { count: toBills({ ...day1, status: 'VOIDED' }) } },
  ];

  const invoices = f.invoices.map((row) => ({ line: row.series, first: row.first, last: row.last, issued: row.issued, voided: row.voided, gaps: row.gaps }));

  return [
    { key: 'sales', title: 'Sales', columns: FIGURE_COLUMNS, rows: sales },
    { key: 'money', title: 'Where the bill total went', columns: FIGURE_COLUMNS, rows: moneyRows },
    { key: 'collections', title: 'Collections', columns: FIGURE_COLUMNS, rows: f.collections.entries.map((row) => money(`${row.accountName}, ${row.methodName}`, row.amountInPaise)) },
    { key: 'cash', title: 'Cash drawer', columns: FIGURE_COLUMNS, rows: cash },
    { key: 'orderTypes', title: 'By order type', columns: FIGURE_COLUMNS, rows: orderTypes },
    { key: 'gst', title: 'GST by rate', columns: FIGURE_COLUMNS, rows: gst },
    { key: 'controls', title: 'Controls', columns: FIGURE_COLUMNS, rows: controls },
    { key: 'invoices', title: 'Invoices', columns: FIGURE_COLUMNS, rows: invoices },
  ];
}

export default {
  id: 'R2',
  name: 'day-close',
  title: 'Day Close',
  roles: MANAGERS,
  schema: dayQuery(),
  filters: [],
  dimensions: [],
  columns: FIGURE_COLUMNS,

  async query(req, baseMatch, params) {
    const day = await readDay(req, params.date);
    return {
      sections: sections(day, params.date),
      extra: { isClosed: day.isClosed, status: day.status, figures: day.figures, blockers: day.blockers },
      day,
    };
  },

  /** The day's checks, and C12 when the day is closed. */
  async checks(req, params, result) {
    const checks = [...result.day.checks];
    if (result.day.isClosed) {
      checks.push(...(await runRangeChecks(req, { from: params.date, to: params.date }, ['C12'])));
    }
    return checks;
  },
};
