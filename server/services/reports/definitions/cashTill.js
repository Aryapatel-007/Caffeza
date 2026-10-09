/**
 * R7 Cash Till. M19, built in P15. docs/API-CONTRACT.md "M19" R7 and section
 * 17. OWNER only, because it shows the expected cash.
 *
 * One row per business date. A closed date reads its stored close; an open date
 * shows the expected cash so far from computeDayFigures, and no count.
 *
 * P29 Part F, the cash book's lines: brought forward, top-ups (paid in),
 * expenses (paid out), cash taken out, kept for tomorrow and taken out at
 * close, and a second section, expenses by category. Cash taken out is never
 * an expense here.
 */
import { DAY_STATUSES, DayClosure } from '../../../models/DayClosure.js';
import { paiseToRupees, sumPaise } from '../../../utils/money.js';
import { scoped } from '../../../utils/scopedQuery.js';
import { computeDayFigures } from '../../dayFiguresService.js';
import { checkC14, checkC9, datesBetween } from '../../reconciliationService.js';
import { LABELS } from '../labels.js';
import { reportQuery } from '../params.js';
import { OWNER_ONLY } from './shared.js';

const columns = [
  { key: 'businessDate', label: LABELS.BUSINESS_DATE, type: 'date' },
  { key: 'broughtForwardInPaise', label: LABELS.BROUGHT_FORWARD, type: 'money' },
  { key: 'openingFloatInPaise', label: LABELS.OPENING_FLOAT, type: 'money' },
  { key: 'openingDifferenceInPaise', label: LABELS.OPENING_DIFFERENCE, type: 'money' },
  { key: 'paidInInPaise', label: LABELS.TOP_UPS, type: 'money' },
  { key: 'cashFromBillsInPaise', label: LABELS.CASH_FROM_BILLS, type: 'money' },
  { key: 'cashCollectionsInPaise', label: LABELS.CASH_COLLECTIONS, type: 'money' },
  { key: 'paidOutInPaise', label: LABELS.EXPENSES, type: 'money' },
  { key: 'cashTakenOutInPaise', label: LABELS.CASH_TAKEN_OUT, type: 'money' },
  { key: 'expectedCashInPaise', label: LABELS.EXPECTED_CASH, type: 'money' },
  { key: 'countedCashInPaise', label: LABELS.COUNTED_CASH, type: 'money' },
  { key: 'differenceInPaise', label: LABELS.CASH_DIFFERENCE, type: 'money' },
  { key: 'keptForTomorrowInPaise', label: LABELS.KEPT_FOR_TOMORROW, type: 'money' },
  { key: 'takenOutAtCloseInPaise', label: LABELS.TAKEN_OUT_AT_CLOSE, type: 'money' },
  // P25 Part F. The notes and coins counted, for a closed day counted that way; empty for a total.
  { key: 'cashCountText', label: LABELS.CASH_COUNT, type: 'text' },
  { key: 'closedByName', label: LABELS.CLOSED_BY, type: 'text' },
  { key: 'closedAt', label: LABELS.TIME, type: 'time' },
];

const categoryColumns = [
  { key: 'businessDate', label: LABELS.BUSINESS_DATE, type: 'date' },
  { key: 'categoryLabel', label: LABELS.EXPENSE_CATEGORY, type: 'text' },
  { key: 'count', label: LABELS.COUNT, type: 'count' },
  { key: 'amountInPaise', label: LABELS.EXPENSES, type: 'money' },
];

const SUMMED = [
  'openingFloatInPaise',
  'openingDifferenceInPaise',
  'paidInInPaise',
  'cashFromBillsInPaise',
  'cashCollectionsInPaise',
  'paidOutInPaise',
  'cashTakenOutInPaise',
  'expectedCashInPaise',
  'countedCashInPaise',
  'differenceInPaise',
  'keptForTomorrowInPaise',
  'takenOutAtCloseInPaise',
];

/** "6 × ₹500 note, 2 × ₹200 note", or null for a day counted as a total. */
function cashCountText(cashCount) {
  if (!cashCount?.length) return null;
  return cashCount.map((row) => `${row.count} × ${paiseToRupees(row.valueInPaise, { symbol: true })} ${row.kind === 'COIN' ? 'coin' : 'note'}`).join(', ');
}

export default {
  id: 'R7',
  name: 'cash-till',
  title: 'Cash Till',
  roles: OWNER_ONLY,
  schema: reportQuery([]),
  filters: [],
  dimensions: [],
  columns,

  async query(req, baseMatch, params, ctx) {
    const closures = await DayClosure.find({
      ...scoped(req),
      status: DAY_STATUSES.CLOSED,
      businessDate: { $gte: params.from, $lte: params.to },
    }).lean();
    const byDate = new Map(closures.map((closure) => [closure.businessDate, closure]));
    const names = await ctx.personNames(closures.map((closure) => closure.closedBy));

    const rows = [];
    const cashes = [];
    const categoryRows = [];
    for (const date of datesBetween(params.from, params.to)) {
      const closure = byDate.get(date);
      // A closed day reads its snapshot; its cash book lines, added by P29, come from today's figures where the snapshot has none.
      const fresh = closure && closure.snapshot.cash.cashTakenOutInPaise !== undefined ? null : await computeDayFigures(req, date);
      const cash = closure ? { ...(fresh?.cash ?? {}), ...closure.snapshot.cash } : fresh.cash;
      cashes.push({ date, cash, counted: closure?.countedCashInPaise ?? null });
      rows.push({
        businessDate: date,
        broughtForwardInPaise: cash.broughtForward?.keptInPaise ?? null,
        openingFloatInPaise: cash.openingFloatInPaise,
        openingDifferenceInPaise: cash.broughtForward?.openingDifferenceInPaise ?? null,
        paidInInPaise: cash.paidInInPaise,
        cashFromBillsInPaise: cash.cashFromBillsInPaise,
        cashCollectionsInPaise: cash.cashCollectionsInPaise,
        paidOutInPaise: cash.paidOutInPaise,
        cashTakenOutInPaise: cash.cashTakenOutInPaise ?? 0,
        expectedCashInPaise: cash.expectedCashInPaise,
        countedCashInPaise: closure?.countedCashInPaise ?? null,
        differenceInPaise: closure?.differenceInPaise ?? null,
        keptForTomorrowInPaise: closure?.keptForTomorrowInPaise ?? null,
        takenOutAtCloseInPaise: closure?.takenOutAtCloseInPaise ?? null,
        cashCountText: cashCountText(closure?.cashCount),
        closedByName: closure ? names.get(String(closure.closedBy)) ?? 'Unknown' : null,
        closedAt: closure?.closedAt ?? null,
        drill: { expectedCashInPaise: { report: 'R2', query: { date } } },
      });
      for (const category of cash.expensesByCategory ?? []) {
        categoryRows.push({ businessDate: date, categoryLabel: category.label, code: category.code, count: category.count, amountInPaise: category.amountInPaise });
      }
    }
    const totals = Object.fromEntries(SUMMED.map((key) => [key, sumPaise(0, ...rows.map((row) => row[key] ?? 0))]));
    return {
      sections: [
        { key: 'days', title: 'Cash by day', columns, rows, totals },
        {
          key: 'expensesByCategory',
          title: 'Expenses by category',
          columns: categoryColumns,
          rows: categoryRows,
          totals: {
            count: sumPaise(0, ...categoryRows.map((row) => row.count)),
            amountInPaise: sumPaise(0, ...categoryRows.map((row) => row.amountInPaise)),
          },
        },
      ],
      cashes,
    };
  },

  /** C9 and C14 for each date, each as one result listing every date that did not match. */
  checks(req, params, result) {
    const worstOf = (id, perDay, passedMessage) => {
      const errors = perDay.filter(({ check }) => !check.passed && check.severity === 'ERROR');
      const warnings = perDay.filter(({ check }) => !check.passed && check.severity === 'WARNING');
      const worst = errors[0] ?? warnings[0];
      if (!worst) return { id, severity: 'WARNING', passed: true, message: passedMessage, expected: null, actual: null, difference: null, refs: [] };
      return { ...worst.check, refs: (errors.length ? errors : warnings).map(({ date }) => date) };
    };
    return [
      worstOf('C9', result.cashes.map(({ date, cash, counted }) => ({ date, check: checkC9(cash, counted) })), "C9 Cash: every day's drawer adds up."),
      worstOf('C14', result.cashes.map(({ date, cash }) => ({ date, check: checkC14(cash, date) })), 'C14 Brought forward: every float brought forward is what was kept.'),
    ];
  },
};
