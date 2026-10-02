/**
 * R11 Menu Performance. M19, built in P16. docs/API-CONTRACT.md "M19" R11.
 *
 * Rows by the category frozen on each bill line, or by item within one
 * category when `categoryName` is given. Every figure is a sum of a value
 * frozen on the bill line when the bill was made (P03): a dish that moves
 * category tomorrow still counts under the category it was sold in today.
 *
 * Lines from bills made before P03 have no shares and no category. They are
 * one row, "Not recorded", with their quantity and item total and blank
 * shares: never left out, never estimated.
 *
 * Cancelled quantity and wasted value come from `orders.lines[]` cancelled
 * during the range's business days, under the category and item frozen on
 * the order line.
 *
 * Share of net sales is worked out after totalling, in basis points, and the
 * rounding remainder is handed out by the largest remainder method, so the
 * column always adds up to exactly 100.00%. Caffeza's old category report
 * measured every row against the top one instead.
 */
import { Bill } from '../../../models/Bill.js';
import { Order, ORDER_LINE_STATUSES } from '../../../models/Order.js';
import { sumPaise } from '../../../utils/money.js';
import { largestRemainderSplit } from '../../../utils/tax.js';
import { computeLineTotalInPaise } from '../../orderService.js';
import { checkC5, runRangeChecks } from '../../reconciliationService.js';
import { LABELS } from '../labels.js';
import { reportQuery } from '../params.js';
import { instantsFor, MANAGERS, netSalesExpr, tenantOf, toBills } from './shared.js';

export const NOT_RECORDED = 'Not recorded';

const figureColumns = [
  { key: 'quantity', label: LABELS.QUANTITY_SOLD, type: 'count' },
  { key: 'itemTotalInPaise', label: LABELS.ITEM_TOTAL, type: 'money' },
  { key: 'discountInPaise', label: LABELS.LINE_DISCOUNT_SHARE, type: 'money' },
  { key: 'netSalesInPaise', label: LABELS.LINE_NET_SALES, type: 'money' },
  { key: 'gstInPaise', label: LABELS.LINE_GST_SHARE, type: 'money' },
  { key: 'shareBps', label: LABELS.SHARE_OF_NET_SALES, type: 'percent' },
  { key: 'rank', label: LABELS.RANK, type: 'count' },
  { key: 'cancelledQuantity', label: LABELS.CANCELLED_QUANTITY, type: 'count' },
  { key: 'wastedValueInPaise', label: LABELS.WASTED_VALUE, type: 'money' },
];

const columnsFor = (byItem) => [
  { key: 'name', label: byItem ? LABELS.ITEM : LABELS.CATEGORY, type: 'text' },
  ...figureColumns,
];

const SUMMED = ['quantity', 'itemTotalInPaise', 'discountInPaise', 'netSalesInPaise', 'gstInPaise', 'cancelledQuantity', 'wastedValueInPaise'];

const itemLabel = (itemName, variantName) => (variantName ? `${itemName} (${variantName})` : itemName);

/**
 * The sold lines, one group per category and item, in one pass. Sorted by
 * `billedAt` first so `$last` is the name on the most recent bill.
 */
function soldLines(baseMatch, params) {
  return Bill.aggregate([
    { $match: { ...baseMatch, ...(params.orderType ? { orderType: params.orderType } : {}) } },
    { $sort: { billedAt: 1 } },
    { $project: { lines: 1 } },
    { $unwind: '$lines' },
    ...(params.categoryName ? [{ $match: { 'lines.categoryName': params.categoryName } }] : []),
    {
      $group: {
        _id: {
          recorded: { $ne: [{ $ifNull: ['$lines.discountShareInPaise', null] }, null] },
          categoryId: '$lines.categoryId',
          menuItemId: '$lines.menuItemId',
          variantName: { $ifNull: ['$lines.variantName', null] },
        },
        categoryName: { $last: '$lines.categoryName' },
        itemName: { $last: '$lines.itemName' },
        quantity: { $sum: '$lines.quantity' },
        itemTotalInPaise: { $sum: '$lines.lineTotalInPaise' },
        discountInPaise: { $sum: { $ifNull: ['$lines.discountShareInPaise', 0] } },
        netSalesInPaise: { $sum: { $ifNull: ['$lines.taxableInPaise', 0] } },
        gstInPaise: { $sum: { $ifNull: ['$lines.taxInPaise', 0] } },
      },
    },
  ]);
}

/**
 * The whole the groups must add up to, read a different way. With no category
 * filter: every bill's item total, and the net sales of bills whose lines all
 * carry shares. With a category: every line in it.
 */
async function wholeFor(baseMatch, params) {
  const match = { ...baseMatch, ...(params.orderType ? { orderType: params.orderType } : {}) };
  if (params.categoryName) {
    const [line] = await Bill.aggregate([
      { $match: { ...match, 'lines.categoryName': params.categoryName } },
      { $unwind: '$lines' },
      { $match: { 'lines.categoryName': params.categoryName } },
      {
        $group: {
          _id: null,
          itemTotalInPaise: { $sum: '$lines.lineTotalInPaise' },
          netSalesInPaise: { $sum: { $ifNull: ['$lines.taxableInPaise', 0] } },
        },
      },
    ]);
    return { itemTotalInPaise: line?.itemTotalInPaise ?? 0, netSalesInPaise: line?.netSalesInPaise ?? 0 };
  }
  const [bills] = await Bill.aggregate([
    { $match: match },
    {
      $addFields: {
        recorded: {
          $allElementsTrue: [{ $map: { input: '$lines', in: { $ne: [{ $ifNull: ['$$this.discountShareInPaise', null] }, null] } } }],
        },
      },
    },
    {
      $group: {
        _id: null,
        itemTotalInPaise: { $sum: '$subtotalInPaise' },
        netSalesInPaise: { $sum: { $cond: ['$recorded', netSalesExpr, 0] } },
      },
    },
  ]);
  return { itemTotalInPaise: bills?.itemTotalInPaise ?? 0, netSalesInPaise: bills?.netSalesInPaise ?? 0 };
}

/** Lines cancelled during the range's business days, by the category and item frozen on the order line. */
async function cancelledLines(req, baseMatch, params) {
  const { start, end } = await instantsFor(req, params.from, params.to);
  const orders = await Order.find({
    ...tenantOf(baseMatch),
    ...(params.orderType ? { orderType: params.orderType } : {}),
    'lines.cancelledAt': { $gte: start, $lt: end },
  })
    .select('lines')
    .lean();

  const lines = [];
  for (const order of orders) {
    for (const line of order.lines) {
      if (line.status !== ORDER_LINE_STATUSES.CANCELLED || !line.cancelledAt) continue;
      if (line.cancelledAt < start || line.cancelledAt >= end) continue;
      if (params.categoryName && line.categoryName !== params.categoryName) continue;
      lines.push({
        categoryId: line.categoryId ? String(line.categoryId) : null,
        categoryName: line.categoryName ?? null,
        menuItemId: String(line.menuItemId),
        itemName: line.itemName,
        variantName: line.variantName ?? null,
        quantity: line.quantity,
        wastedValueInPaise: line.wasPrepared === true ? computeLineTotalInPaise(line) : 0,
      });
    }
  }
  return lines;
}

const emptyRow = (key, name) => ({ key, name, ...Object.fromEntries(SUMMED.map((field) => [field, 0])) });

/**
 * Folds sold groups and cancelled lines into rows, keyed by category, or by
 * item and size within the category. A key's name is the most recent one.
 */
function buildRows(groups, cancelled, byItem) {
  const rows = new Map();
  let notRecorded = null;

  for (const group of groups) {
    if (!group._id.recorded) {
      notRecorded ??= { ...emptyRow(NOT_RECORDED, NOT_RECORDED), recorded: false };
      notRecorded.quantity += group.quantity;
      notRecorded.itemTotalInPaise += group.itemTotalInPaise;
      continue;
    }
    const key = byItem
      ? `${group._id.menuItemId}|${group._id.variantName ?? ''}`
      : String(group._id.categoryId ?? group.categoryName ?? NOT_RECORDED);
    const name = byItem ? itemLabel(group.itemName, group._id.variantName) : group.categoryName ?? NOT_RECORDED;
    const row = rows.get(key) ?? emptyRow(key, name);
    for (const field of ['quantity', 'itemTotalInPaise', 'discountInPaise', 'netSalesInPaise', 'gstInPaise']) {
      row[field] += group[field];
    }
    row.itemName = group.itemName;
    rows.set(key, row);
  }

  for (const line of cancelled) {
    const key = byItem ? `${line.menuItemId}|${line.variantName ?? ''}` : String(line.categoryId ?? line.categoryName ?? NOT_RECORDED);
    const name = byItem ? itemLabel(line.itemName, line.variantName) : line.categoryName ?? NOT_RECORDED;
    const row = rows.get(key) ?? { ...emptyRow(key, name), itemName: line.itemName };
    row.cancelledQuantity += line.quantity;
    row.wastedValueInPaise += line.wastedValueInPaise;
    rows.set(key, row);
  }

  return { rows: [...rows.values()], notRecorded };
}

/** Ranks by net sales, highest first, and hands out the share column so it adds up to 10000. */
function rankAndShare(rows) {
  const sorted = [...rows].sort((a, b) => b.netSalesInPaise - a.netSalesInPaise || a.name.localeCompare(b.name));
  const shares = largestRemainderSplit(10_000, sorted.map((row) => row.netSalesInPaise));
  return sorted.map((row, index) => ({ ...row, shareBps: shares[index], rank: index + 1 }));
}

/**
 * C5 for one grouping: item totals over every line, and net sales over the
 * lines that carry shares. The first figure that does not add up is the one
 * reported. Exported so a test can run it on a deliberately broken grouping.
 */
export function menuC5(number, rows, whole) {
  const itemTotals = checkC5(number, rows, 'itemTotalInPaise', whole.itemTotalInPaise);
  if (!itemTotals.passed) return itemTotals;
  return checkC5(number, rows.filter((row) => row.recorded !== false), 'netSalesInPaise', whole.netSalesInPaise);
}

export default {
  id: 'R11',
  name: 'menu',
  title: 'Menu Performance',
  roles: MANAGERS,
  schema: reportQuery(['orderType', 'categoryName']),
  filters: ['orderType', 'categoryName'],
  dimensions: ['orderType'],
  columns: columnsFor(false),

  async query(req, baseMatch, params) {
    const byItem = Boolean(params.categoryName);
    const [groups, cancelled, whole] = await Promise.all([
      soldLines(baseMatch, params),
      cancelledLines(req, baseMatch, params),
      wholeFor(baseMatch, params),
    ]);

    const range = { from: params.from, to: params.to, ...(params.orderType ? { orderType: params.orderType } : {}) };
    const drillFor = (row) => {
      const query = { ...range, ...(byItem ? { categoryName: params.categoryName, itemName: row.itemName } : { categoryName: row.name }) };
      return { quantity: toBills(query), itemTotalInPaise: toBills(query), netSalesInPaise: toBills(query) };
    };

    const { rows: recorded, notRecorded } = buildRows(groups, cancelled, byItem);
    // `key` and `itemName` are working fields; the drill keeps the item's name.
    const visible = ({ key: _key, itemName: _itemName, recorded: _recorded, ...row }) => row;
    const rows = rankAndShare(recorded).map((row) => ({ ...visible(row), drill: drillFor(row) }));
    if (notRecorded) {
      rows.push({ ...visible(notRecorded), discountInPaise: null, netSalesInPaise: null, gstInPaise: null, shareBps: null, rank: null });
    }

    const totals = Object.fromEntries(SUMMED.map((field) => [field, sumPaise(0, ...rows.map((row) => row[field] ?? 0))]));
    totals.shareBps = totals.netSalesInPaise > 0 ? 10_000 : 0;
    totals.drill = { quantity: toBills(range), itemTotalInPaise: toBills(range), netSalesInPaise: toBills(range) };

    // Both groupings, for C5.1 and C5.2: categories rolled up, and every item.
    const { rows: byCategoryRows, notRecorded: nrCategory } = buildRows(groups, [], false);
    const { rows: byItemRows, notRecorded: nrItem } = buildRows(groups, [], true);
    const withNotRecorded = (list, extra) => (extra ? [...list, extra] : list);

    return {
      rows,
      totals,
      columns: columnsFor(byItem),
      grouping: {
        whole,
        categories: withNotRecorded(byCategoryRows, nrCategory),
        items: withNotRecorded(byItemRows, nrItem),
      },
    };
  },

  async checks(req, params, result) {
    const [c2, c7] = await runRangeChecks(req, { from: params.from, to: params.to }, ['C2', 'C7']);
    const { whole, categories, items } = result.grouping;
    return [c2, menuC5(1, categories, whole), menuC5(2, items, whole), c7];
  },
};
