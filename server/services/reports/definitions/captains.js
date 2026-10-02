/**
 * R12 Captains. M19, built in P16. docs/API-CONTRACT.md "M19" R12.
 *
 * One row per `bills.captainId`, named with the `captainName` frozen on the
 * most recent bill in the range, so renaming a person does not rewrite an old
 * day. Totals equal R3 for the same range, and C5.3 proves it on every run.
 * Caffeza's old captain report was ₹16,392 short of its own day total.
 *
 * Average table time: whole minutes from `orderOpenedAt` to `paidAt`, on
 * dine-in bills that are PAID. An On Hold bill has no payment time and is left
 * out. A captain with no such bill shows no average, never zero.
 *
 * Items cancelled is grouped by `orders.lines[].cancelledBy`, a different
 * person from the bill's captain, so it is its own figure and outside C5.
 * Someone who cancelled but captained no bill gets a row with their current
 * name, through the engine's `personNames`, as a label only.
 */
import { Bill } from '../../../models/Bill.js';
import { Order, ORDER_LINE_STATUSES } from '../../../models/Order.js';
import { averagePaise, sumPaise } from '../../../utils/money.js';
import { computeLineTotalInPaise } from '../../orderService.js';
import { checkC5 } from '../../reconciliationService.js';
import { LABELS } from '../labels.js';
import { reportQuery } from '../params.js';
import { averageMinutes, instantsFor, MANAGERS, minutesExpr, netSalesExpr, tenantOf, toBills } from './shared.js';
import { NOT_RECORDED } from './menu.js';

const columns = [
  { key: 'name', label: LABELS.CAPTAIN, type: 'text' },
  { key: 'billCount', label: LABELS.BILLS, type: 'count' },
  { key: 'covers', label: LABELS.COVERS, type: 'count' },
  { key: 'netSalesInPaise', label: LABELS.NET_SALES, type: 'money' },
  { key: 'billTotalInPaise', label: LABELS.BILL_TOTAL, type: 'money' },
  { key: 'averagePerCoverInPaise', label: LABELS.AVERAGE_PER_COVER, type: 'money' },
  { key: 'averageTableTime', label: LABELS.AVERAGE_TABLE_TIME, type: 'decimal2' },
  { key: 'discountCount', label: LABELS.DISCOUNTED_BILLS, type: 'count' },
  { key: 'discountInPaise', label: LABELS.DISCOUNT, type: 'money' },
  { key: 'cancelledCount', label: LABELS.ITEMS_CANCELLED, type: 'count' },
  { key: 'cancelledValueInPaise', label: LABELS.CANCELLED_VALUE, type: 'money' },
];

const SUMMED = [
  'billCount', 'covers', 'netSalesInPaise', 'billTotalInPaise', 'dineInNetSalesInPaise',
  'tableMinutes', 'paidDineInBills', 'discountCount', 'discountInPaise', 'cancelledCount', 'cancelledValueInPaise',
];

const zero = () => Object.fromEntries(SUMMED.map((key) => [key, 0]));

/** Ready-made figures for a row or the totals: the averages, from totals only. */
function finish(row) {
  const { dineInNetSalesInPaise, tableMinutes, paidDineInBills, ...rest } = row;
  return {
    ...rest,
    averagePerCoverInPaise: averagePaise(dineInNetSalesInPaise, row.covers),
    averageTableTime: averageMinutes(tableMinutes, paidDineInBills),
  };
}

function billsByCaptain(baseMatch, params) {
  return Bill.aggregate([
    { $match: { ...baseMatch, ...(params.orderType ? { orderType: params.orderType } : {}) } },
    { $sort: { billedAt: 1 } },
    {
      $addFields: {
        netSales: netSalesExpr,
        isDineIn: { $eq: ['$orderType', 'DINE_IN'] },
        timed: {
          $and: [
            { $eq: ['$orderType', 'DINE_IN'] },
            { $eq: ['$status', 'PAID'] },
            { $ne: [{ $ifNull: ['$orderOpenedAt', null] }, null] },
            { $ne: [{ $ifNull: ['$paidAt', null] }, null] },
          ],
        },
        discountAmount: { $ifNull: ['$discount.amountInPaise', 0] },
      },
    },
    {
      $group: {
        _id: { $ifNull: ['$captainId', null] },
        name: { $last: '$captainName' },
        billCount: { $sum: 1 },
        covers: { $sum: { $cond: ['$isDineIn', { $ifNull: ['$guestCount', 0] }, 0] } },
        netSalesInPaise: { $sum: '$netSales' },
        billTotalInPaise: { $sum: '$grandTotalInPaise' },
        dineInNetSalesInPaise: { $sum: { $cond: ['$isDineIn', '$netSales', 0] } },
        tableMinutes: { $sum: { $cond: ['$timed', minutesExpr('$orderOpenedAt', '$paidAt'), 0] } },
        paidDineInBills: { $sum: { $cond: ['$timed', 1, 0] } },
        discountCount: { $sum: { $cond: [{ $gt: ['$discountAmount', 0] }, 1, 0] } },
        discountInPaise: { $sum: '$discountAmount' },
      },
    },
  ]);
}

/** The whole, read separately from the groups: every bill's bill total. */
async function wholeBillTotal(baseMatch, params) {
  const [whole] = await Bill.aggregate([
    { $match: { ...baseMatch, ...(params.orderType ? { orderType: params.orderType } : {}) } },
    { $group: { _id: null, billTotalInPaise: { $sum: '$grandTotalInPaise' } } },
  ]);
  return whole?.billTotalInPaise ?? 0;
}

/** Items cancelled in the range's business days, by who cancelled them. */
async function cancelledByPerson(req, baseMatch, params) {
  const { start, end } = await instantsFor(req, params.from, params.to);
  const orders = await Order.find({
    ...tenantOf(baseMatch),
    ...(params.orderType ? { orderType: params.orderType } : {}),
    'lines.cancelledAt': { $gte: start, $lt: end },
  })
    .select('lines')
    .lean();
  const byPerson = new Map();
  for (const order of orders) {
    for (const line of order.lines) {
      if (line.status !== ORDER_LINE_STATUSES.CANCELLED || !line.cancelledAt || !line.cancelledBy) continue;
      if (line.cancelledAt < start || line.cancelledAt >= end) continue;
      const key = String(line.cancelledBy);
      const entry = byPerson.get(key) ?? { cancelledCount: 0, cancelledValueInPaise: 0 };
      entry.cancelledCount += line.quantity;
      entry.cancelledValueInPaise += computeLineTotalInPaise(line);
      byPerson.set(key, entry);
    }
  }
  return byPerson;
}

export default {
  id: 'R12',
  name: 'captains',
  title: 'Captains',
  roles: MANAGERS,
  schema: reportQuery(['orderType']),
  filters: ['orderType'],
  dimensions: ['orderType'],
  columns,

  async query(req, baseMatch, params, ctx) {
    const [groups, cancelled, whole] = await Promise.all([
      billsByCaptain(baseMatch, params),
      cancelledByPerson(req, baseMatch, params),
      wholeBillTotal(baseMatch, params),
    ]);

    const range = { from: params.from, to: params.to, ...(params.orderType ? { orderType: params.orderType } : {}) };
    const raw = new Map();
    for (const { _id, name, ...figures } of groups) {
      const key = _id ? String(_id) : null;
      raw.set(key, { captainId: key, name: key ? name ?? 'Unknown' : NOT_RECORDED, ...zero(), ...figures });
    }

    // People who cancelled items without captaining a bill in the range.
    const strangers = [...cancelled.keys()].filter((id) => !raw.has(id));
    const names = await ctx.personNames(strangers);
    for (const id of strangers) raw.set(id, { captainId: id, name: names.get(id) ?? 'Unknown', ...zero() });
    for (const [id, entry] of cancelled) Object.assign(raw.get(id), entry);

    const rows = [...raw.values()]
      .sort((a, b) => b.billTotalInPaise - a.billTotalInPaise || a.name.localeCompare(b.name))
      .map(({ captainId, ...row }) => {
        const query = { ...range, ...(captainId ? { captainId } : {}) };
        return {
          ...finish(row),
          ...(captainId ? { drill: { billCount: toBills(query), netSalesInPaise: toBills(query), billTotalInPaise: toBills(query) } } : {}),
        };
      });

    const totalsRaw = Object.fromEntries(SUMMED.map((key) => [key, sumPaise(0, ...[...raw.values()].map((row) => row[key]))]));
    const totals = { ...finish(totalsRaw), drill: { billCount: toBills(range), billTotalInPaise: toBills(range) } };

    return { rows, totals, whole };
  },

  checks(req, params, result) {
    return [checkC5(3, result.rows, 'billTotalInPaise', result.whole)];
  },
};
