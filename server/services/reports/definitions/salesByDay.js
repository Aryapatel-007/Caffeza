/**
 * R3 Sales by Day. M19, built in P15. docs/API-CONTRACT.md "M19" R3.
 *
 * One row per business date in the range, every date present, zeros where
 * there were no bills. Averages come from the totals, never averaged again.
 * `compare=previous` adds the same figures for the range of the same length
 * ending the day before `from`.
 */
import { z } from 'zod';

import { Bill } from '../../../models/Bill.js';
import { averagePaise, sumPaise } from '../../../utils/money.js';
import { checkC5, datesBetween, runRangeChecks } from '../../reconciliationService.js';
import { liveInRange } from '../../reportRangeService.js';
import { LABELS } from '../labels.js';
import { reportQuery } from '../params.js';
import { MANAGERS, netSalesExpr, toBills } from './shared.js';

const columns = [
  { key: 'businessDate', label: LABELS.BUSINESS_DATE, type: 'date' },
  { key: 'billCount', label: LABELS.BILLS, type: 'count' },
  { key: 'covers', label: LABELS.COVERS, type: 'count' },
  { key: 'itemTotalInPaise', label: LABELS.ITEM_TOTAL, type: 'money' },
  { key: 'discountInPaise', label: LABELS.DISCOUNT, type: 'money' },
  { key: 'netSalesInPaise', label: LABELS.NET_SALES, type: 'money' },
  { key: 'gstInPaise', label: LABELS.GST, type: 'money' },
  { key: 'roundOffInPaise', label: LABELS.ROUND_OFF, type: 'money' },
  { key: 'billTotalInPaise', label: LABELS.BILL_TOTAL, type: 'money' },
  { key: 'averageBillInPaise', label: LABELS.AVERAGE_BILL, type: 'money' },
  { key: 'averagePerCoverInPaise', label: LABELS.AVERAGE_PER_COVER, type: 'money' },
];

const SUMMED = ['billCount', 'covers', 'itemTotalInPaise', 'discountInPaise', 'netSalesInPaise', 'gstInPaise', 'roundOffInPaise', 'billTotalInPaise', 'dineInNetSalesInPaise'];

const zeroRow = (businessDate) => ({ businessDate, ...Object.fromEntries(SUMMED.map((key) => [key, 0])) });

const withAverages = (row) => {
  const { dineInNetSalesInPaise, ...rest } = row;
  return {
    ...rest,
    averageBillInPaise: averagePaise(row.netSalesInPaise, row.billCount),
    averagePerCoverInPaise: averagePaise(dineInNetSalesInPaise, row.covers),
  };
};

async function daysFor(match, from, to, orderType) {
  const grouped = await Bill.aggregate([
    { $match: { ...match, ...(orderType ? { orderType } : {}) } },
    { $addFields: { netSales: netSalesExpr, isDineIn: { $eq: ['$orderType', 'DINE_IN'] } } },
    {
      $group: {
        _id: '$businessDate',
        billCount: { $sum: 1 },
        covers: { $sum: { $cond: ['$isDineIn', { $ifNull: ['$guestCount', 0] }, 0] } },
        itemTotalInPaise: { $sum: '$subtotalInPaise' },
        discountInPaise: { $sum: { $ifNull: ['$discount.amountInPaise', 0] } },
        netSalesInPaise: { $sum: '$netSales' },
        gstInPaise: { $sum: '$totalTaxInPaise' },
        roundOffInPaise: { $sum: '$roundOffInPaise' },
        billTotalInPaise: { $sum: '$grandTotalInPaise' },
        dineInNetSalesInPaise: { $sum: { $cond: ['$isDineIn', '$netSales', 0] } },
      },
    },
  ]);
  const byDate = new Map(grouped.map(({ _id, ...row }) => [_id, row]));
  const rows = datesBetween(from, to).map((date) => ({ ...zeroRow(date), ...(byDate.get(date) ?? {}), businessDate: date }));
  const totalsRaw = Object.fromEntries(SUMMED.map((key) => [key, sumPaise(0, ...rows.map((row) => row[key]))]));
  return { rows, totals: withAverages(totalsRaw) };
}

/** The range of the same length ending the day before `from`. */
function previousRange(from, to) {
  const days = datesBetween(from, to).length;
  const start = Date.parse(`${from}T00:00:00Z`);
  const day = 86_400_000;
  return {
    from: new Date(start - days * day).toISOString().slice(0, 10),
    to: new Date(start - day).toISOString().slice(0, 10),
  };
}

export default {
  id: 'R3',
  name: 'sales-by-day',
  title: 'Sales by Day',
  roles: MANAGERS,
  schema: reportQuery(['orderType']).extend({ compare: z.enum(['previous'], { error: 'Must be previous.' }).optional() }).strict('Is not a filter on this report.'),
  filters: ['orderType'],
  dimensions: ['orderType'],
  columns,

  async query(req, baseMatch, params) {
    const { rows, totals } = await daysFor(baseMatch, params.from, params.to, params.orderType);
    const withDrill = rows.map((row) => {
      const query = { from: row.businessDate, to: row.businessDate, ...(params.orderType ? { orderType: params.orderType } : {}) };
      return {
        ...withAverages(row),
        drill: Object.fromEntries(columns.filter((column) => column.type === 'money' || column.type === 'count').map((column) => [column.key, toBills(query)])),
      };
    });
    const result = { rows: withDrill, totals: { ...totals, drill: { billCount: toBills({ from: params.from, to: params.to }) } } };

    if (params.compare === 'previous') {
      const range = previousRange(params.from, params.to);
      const previous = await daysFor(liveInRange(req, range).$match, range.from, range.to, params.orderType);
      result.extra = { previous: { filter: range, rows: previous.rows.map(withAverages), totals: previous.totals } };
    }
    return result;
  },

  async checks(req, params, result) {
    const [c1, c8] = await runRangeChecks(req, { from: params.from, to: params.to }, ['C1', 'C8']);
    return [c1, checkC5(6, result.rows, 'billTotalInPaise', result.totals.billTotalInPaise), c8];
  },
};
