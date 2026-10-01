/**
 * R7 Cash Till. M19, built in P15. docs/API-CONTRACT.md "M19" R7. OWNER only,
 * because it shows the expected cash.
 *
 * One row per business date. A closed date reads its stored close; an open date
 * shows the expected cash so far from computeDayFigures, and no count.
 */
import { DAY_STATUSES, DayClosure } from '../../../models/DayClosure.js';
import { sumPaise } from '../../../utils/money.js';
import { scoped } from '../../../utils/scopedQuery.js';
import { computeDayFigures } from '../../dayFiguresService.js';
import { checkC9, datesBetween } from '../../reconciliationService.js';
import { LABELS } from '../labels.js';
import { reportQuery } from '../params.js';
import { OWNER_ONLY } from './shared.js';

const columns = [
  { key: 'businessDate', label: LABELS.BUSINESS_DATE, type: 'date' },
  { key: 'openingFloatInPaise', label: LABELS.OPENING_FLOAT, type: 'money' },
  { key: 'cashFromBillsInPaise', label: LABELS.CASH_FROM_BILLS, type: 'money' },
  { key: 'cashCollectionsInPaise', label: LABELS.CASH_COLLECTIONS, type: 'money' },
  { key: 'paidInInPaise', label: LABELS.PAID_IN, type: 'money' },
  { key: 'paidOutInPaise', label: LABELS.PAID_OUT, type: 'money' },
  { key: 'expectedCashInPaise', label: LABELS.EXPECTED_CASH, type: 'money' },
  { key: 'countedCashInPaise', label: LABELS.COUNTED_CASH, type: 'money' },
  { key: 'differenceInPaise', label: LABELS.CASH_DIFFERENCE, type: 'money' },
  { key: 'closedByName', label: LABELS.CLOSED_BY, type: 'text' },
  { key: 'closedAt', label: LABELS.TIME, type: 'time' },
];

const SUMMED = ['openingFloatInPaise', 'cashFromBillsInPaise', 'cashCollectionsInPaise', 'paidInInPaise', 'paidOutInPaise', 'expectedCashInPaise', 'countedCashInPaise', 'differenceInPaise'];

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
    for (const date of datesBetween(params.from, params.to)) {
      const closure = byDate.get(date);
      const cash = closure ? closure.snapshot.cash : (await computeDayFigures(req, date)).cash;
      cashes.push({ date, cash, counted: closure?.countedCashInPaise ?? null });
      rows.push({
        businessDate: date,
        openingFloatInPaise: cash.openingFloatInPaise,
        cashFromBillsInPaise: cash.cashFromBillsInPaise,
        cashCollectionsInPaise: cash.cashCollectionsInPaise,
        paidInInPaise: cash.paidInInPaise,
        paidOutInPaise: cash.paidOutInPaise,
        expectedCashInPaise: cash.expectedCashInPaise,
        countedCashInPaise: closure?.countedCashInPaise ?? null,
        differenceInPaise: closure?.differenceInPaise ?? null,
        closedByName: closure ? names.get(String(closure.closedBy)) ?? 'Unknown' : null,
        closedAt: closure?.closedAt ?? null,
        drill: { expectedCashInPaise: { report: 'R2', query: { date } } },
      });
    }
    const totals = Object.fromEntries(SUMMED.map((key) => [key, sumPaise(0, ...rows.map((row) => row[key] ?? 0))]));
    return { rows, totals, cashes };
  },

  /** C9 for each date, as one result listing every date that did not match. */
  checks(req, params, result) {
    const perDay = result.cashes.map(({ date, cash, counted }) => ({ date, check: checkC9(cash, counted) }));
    const errors = perDay.filter(({ check }) => !check.passed && check.severity === 'ERROR');
    const warnings = perDay.filter(({ check }) => !check.passed && check.severity === 'WARNING');
    const worst = errors[0] ?? warnings[0];
    if (!worst) {
      return [{ id: 'C9', severity: 'WARNING', passed: true, message: 'C9 Cash: every day\'s drawer adds up.', expected: null, actual: null, difference: null, refs: [] }];
    }
    return [{ ...worst.check, refs: (errors.length ? errors : warnings).map(({ date }) => date) }];
  },
};
