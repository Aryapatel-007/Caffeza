/**
 * R8 GST. M19, built in P15. docs/API-CONTRACT.md "M19" R8.
 *
 * A: GST by rate, from the bills' frozen `taxBreakdown`, ordinary bills only.
 * B: supplies where the platform pays the GST, by the frozen platform code.
 * C: what is not a sale: No Charge value and voided bills, never added to A.
 * D: documents issued, per invoice series. E: round-off.
 */
import { platformByCode } from '../../../config/platforms.js';
import { Bill } from '../../../models/Bill.js';
import { ORDER_STATUSES, Order } from '../../../models/Order.js';
import { sumPaise } from '../../../utils/money.js';
import { scoped, scopedForAggregate } from '../../../utils/scopedQuery.js';
import { seriesOf } from '../../dayFiguresService.js';
import { checkC5, runRangeChecks } from '../../reconciliationService.js';
import { LABELS } from '../labels.js';
import { reportQuery } from '../params.js';
import { FIGURE_COLUMNS, MANAGERS, netSalesExpr, toBills } from './shared.js';

const PLATFORM_COLLECTS = 'PLATFORM_COLLECTS';

const rateColumns = [
  { key: 'taxRate', label: LABELS.TAX_RATE, type: 'text' },
  { key: 'netSalesInPaise', label: LABELS.NET_SALES, type: 'money' },
  { key: 'cgstInPaise', label: LABELS.CGST, type: 'money' },
  { key: 'sgstInPaise', label: LABELS.SGST, type: 'money' },
  { key: 'gstInPaise', label: LABELS.GST, type: 'money' },
];

const platformColumns = [
  { key: 'platform', label: LABELS.PLATFORM, type: 'text' },
  { key: 'billCount', label: LABELS.BILLS, type: 'count' },
  { key: 'netSalesInPaise', label: LABELS.NET_SALES, type: 'money' },
];

const documentColumns = [
  { key: 'series', label: LABELS.INVOICE_SERIES, type: 'text' },
  { key: 'first', label: LABELS.INVOICE_NUMBER, type: 'text' },
  { key: 'last', label: LABELS.INVOICE_NUMBER, type: 'text' },
  { key: 'issued', label: LABELS.BILLS, type: 'count' },
  { key: 'voided', label: LABELS.COUNT, type: 'count' },
];

export default {
  id: 'R8',
  name: 'gst',
  title: 'GST',
  roles: MANAGERS,
  schema: reportQuery([]),
  filters: [],
  dimensions: [],
  columns: rateColumns,

  async query(req, baseMatch, params) {
    const range = { from: params.from, to: params.to };
    const slabs = await Bill.aggregate([
      { $match: { ...baseMatch, taxTreatment: { $ne: PLATFORM_COLLECTS } } },
      { $unwind: '$taxBreakdown' },
      {
        $group: {
          _id: '$taxBreakdown.taxRateBps',
          netSalesInPaise: { $sum: '$taxBreakdown.taxableInPaise' },
          cgstInPaise: { $sum: '$taxBreakdown.cgstInPaise' },
          sgstInPaise: { $sum: '$taxBreakdown.sgstInPaise' },
          gstInPaise: { $sum: '$taxBreakdown.taxInPaise' },
        },
      },
      { $sort: { _id: -1 } },
    ]);
    const byRate = slabs.map(({ _id, ...row }) => ({
      taxRate: `${_id / 100}%`,
      taxRateBps: _id,
      ...row,
      drill: { netSalesInPaise: toBills({ ...range, taxRateBps: _id }) },
    }));

    const platforms = await Bill.aggregate([
      { $match: { ...baseMatch, taxTreatment: PLATFORM_COLLECTS } },
      { $group: { _id: '$platform.code', billCount: { $sum: 1 }, netSalesInPaise: { $sum: netSalesExpr } } },
      { $sort: { _id: 1 } },
    ]);
    const platformRows = platforms.map((row) => ({
      platform: platformByCode(row._id)?.name ?? row._id ?? 'Unknown',
      platformCode: row._id,
      billCount: row.billCount,
      netSalesInPaise: row.netSalesInPaise,
      drill: { netSalesInPaise: toBills({ ...range, platform: row._id }) },
    }));

    const [noCharge] = await Order.aggregate([
      { $match: { ...scopedForAggregate(req), status: ORDER_STATUSES.NO_CHARGE, 'noCharge.businessDate': { $gte: params.from, $lte: params.to } } },
      { $group: { _id: null, count: { $sum: 1 }, valueInPaise: { $sum: '$noCharge.valueInPaise' } } },
    ]);
    const [voided] = await Bill.aggregate([
      { $match: { ...scopedForAggregate(req), isVoided: true, businessDate: { $gte: params.from, $lte: params.to } } },
      { $group: { _id: null, count: { $sum: 1 }, valueInPaise: { $sum: '$grandTotalInPaise' } } },
    ]);

    const register = await Bill.find({ ...scoped(req), businessDate: { $gte: params.from, $lte: params.to } })
      .select('billNumber billSequence invoiceSeries financialYear isVoided')
      .lean();
    const bySeries = new Map();
    for (const bill of register) bySeries.set(seriesOf(bill), [...(bySeries.get(seriesOf(bill)) ?? []), bill]);
    const documents = [...bySeries].map(([series, list]) => {
      const sorted = [...list].sort((a, b) => a.billSequence - b.billSequence);
      return { series, first: sorted[0].billNumber, last: sorted.at(-1).billNumber, issued: sorted.length, voided: sorted.filter((bill) => bill.isVoided).length };
    });

    const [roundOff] = await Bill.aggregate([{ $match: baseMatch }, { $group: { _id: null, total: { $sum: '$roundOffInPaise' }, netSalesInPaise: { $sum: netSalesExpr } } }]);

    const sum = (rows, key) => sumPaise(0, ...rows.map((row) => row[key]));
    return {
      sections: [
        { key: 'byRate', title: 'By rate', columns: rateColumns, rows: byRate, totals: { netSalesInPaise: sum(byRate, 'netSalesInPaise'), cgstInPaise: sum(byRate, 'cgstInPaise'), sgstInPaise: sum(byRate, 'sgstInPaise'), gstInPaise: sum(byRate, 'gstInPaise') } },
        { key: 'platform', title: 'Supplies where the platform pays GST', columns: platformColumns, rows: platformRows, totals: { billCount: platformRows.reduce((total, row) => total + row.billCount, 0), netSalesInPaise: sum(platformRows, 'netSalesInPaise') } },
        {
          key: 'notSales',
          title: 'Not sales',
          columns: FIGURE_COLUMNS,
          rows: [
            { line: 'No Charge value, before GST', count: noCharge?.count ?? 0, amountInPaise: noCharge?.valueInPaise ?? 0, drill: { count: { report: 'R16', query: range } } },
            { line: 'Voided bills', count: voided?.count ?? 0, amountInPaise: voided?.valueInPaise ?? 0, drill: { count: toBills({ ...range, status: 'VOIDED' }) } },
          ],
        },
        { key: 'documents', title: 'Documents issued', columns: documentColumns, rows: documents },
        { key: 'roundOff', title: 'Round-off', columns: FIGURE_COLUMNS, rows: [{ line: 'Round-off', amountInPaise: roundOff?.total ?? 0 }] },
      ],
      byRate,
      platformRows,
      wholeNetSalesInPaise: roundOff?.netSalesInPaise ?? 0,
    };
  },

  async checks(req, params, result) {
    const [c1, c6] = await runRangeChecks(req, { from: params.from, to: params.to }, ['C1', 'C6']);
    const rates = [...result.byRate, ...result.platformRows];
    return [c1, checkC5(7, rates, 'netSalesInPaise', result.wholeNetSalesInPaise), c6];
  },
};
