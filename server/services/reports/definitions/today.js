/**
 * R1 Today. M19, built in P18. docs/API-CONTRACT.md "M19" R1.
 *
 * The current business date, as it stands right now. The day's figures come
 * from `computeDayFigures` with `upTo` set to now, the same function Day Close
 * stores, so Today and Day Close can never disagree about what has happened.
 *
 * Sections:
 *   tiles     one row: bill total, net sales, bills, covers, average per cover,
 *             open tables and their item total, unpaid, same weekday last week;
 *   money     R2 section B so far: each method, On Hold and unpaid;
 *   topItems  five items by quantity, from bill lines frozen at billing;
 *   alerts    every void, No Charge, discount over 20% of item total, and item
 *             cancelled after preparation, so far today, each with its record.
 *
 * Open tables are orders on a table that are OPEN or READY_TO_BILL, priced
 * from the line values frozen on the order, never the menu.
 */
import { z } from 'zod';

import { Bill } from '../../../models/Bill.js';
import { Order, ORDER_LINE_STATUSES, OCCUPYING_ORDER_STATUSES } from '../../../models/Order.js';
import { sumPaise } from '../../../utils/money.js';
import { businessDateFor, businessDateRangeToUtc, nowUtc } from '../../../utils/time.js';
import { computeDayFigures } from '../../dayFiguresService.js';
import { computeLineTotalInPaise } from '../../orderService.js';
import { runRangeChecks } from '../../reconciliationService.js';
import { getSetting } from '../../settingsService.js';
import { LABELS } from '../labels.js';
import { FIGURE_COLUMNS, MANAGERS, toBills } from './shared.js';
import { listAlerts } from '../../integrations/alertService.js';

/** Over 20% of the item total. */
const LARGE_DISCOUNT_BPS = 2000;
const TOP_ITEMS = 5;
const WEEK_MS = 7 * 86_400_000;

const tileColumns = [
  { key: 'billTotalInPaise', label: LABELS.BILL_TOTAL, type: 'money' },
  { key: 'netSalesInPaise', label: LABELS.NET_SALES, type: 'money' },
  { key: 'billCount', label: LABELS.BILLS, type: 'count' },
  { key: 'covers', label: LABELS.COVERS, type: 'count' },
  { key: 'averagePerCoverInPaise', label: LABELS.AVERAGE_PER_COVER, type: 'money' },
  { key: 'openTables', label: LABELS.OPEN_TABLES, type: 'count' },
  { key: 'openItemTotalInPaise', label: LABELS.ITEM_TOTAL, type: 'money' },
  { key: 'unpaidCount', label: LABELS.UNPAID, type: 'count' },
  { key: 'unpaidInPaise', label: LABELS.UNPAID, type: 'money' },
  { key: 'lastWeekBillTotalInPaise', label: LABELS.SAME_WEEKDAY_LAST_WEEK, type: 'money' },
];

/** R1's tile keys in contract order. `settings.appearance.todayTiles` is checked against these. */
export const TILE_KEYS = Object.freeze(tileColumns.map((column) => column.key));

const topItemColumns = [
  { key: 'name', label: LABELS.ITEM, type: 'text' },
  { key: 'quantity', label: LABELS.QUANTITY_SOLD, type: 'count' },
  { key: 'itemTotalInPaise', label: LABELS.ITEM_TOTAL, type: 'money' },
];

const alertColumns = [
  { key: 'at', label: LABELS.TIME, type: 'time' },
  { key: 'kind', label: LABELS.FIGURE, type: 'text' },
  { key: 'detail', label: LABELS.ITEM, type: 'text' },
  { key: 'amountInPaise', label: LABELS.VALUE, type: 'money' },
];

const ALERT_WORDS = {
  VOID: 'Void',
  NO_CHARGE: 'No Charge',
  DISCOUNT: 'Discount over 20%',
  CANCELLED_AFTER_PREP: 'Cancelled after preparation',
  INTEGRATION: 'Integration',
};

/** A bill live at `now`: never voided, or voided later. */
const liveAt = (now) => ({ $or: [{ isVoided: false }, { voidedAt: { $gt: now } }] });

async function topItems(tenant, date, now) {
  const rows = await Bill.aggregate([
    { $match: { ...tenant, businessDate: date, billedAt: { $lte: now }, ...liveAt(now) } },
    { $unwind: '$lines' },
    {
      $group: {
        _id: { item: '$lines.itemName', variant: { $ifNull: ['$lines.variantName', null] } },
        quantity: { $sum: '$lines.quantity' },
        itemTotalInPaise: { $sum: '$lines.lineTotalInPaise' },
      },
    },
  ]);
  return rows
    .map(({ _id, ...row }) => ({ name: _id.variant ? `${_id.item} (${_id.variant})` : _id.item, itemName: _id.item, ...row }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
    .slice(0, TOP_ITEMS);
}

async function openTables(tenant) {
  const orders = await Order.find({ ...tenant, status: { $in: OCCUPYING_ORDER_STATUSES }, tableId: { $ne: null } })
    .select('lines')
    .lean();
  const live = (order) => order.lines.filter((line) => line.status !== ORDER_LINE_STATUSES.CANCELLED);
  return {
    openTables: orders.length,
    openItemTotalInPaise: sumPaise(0, ...orders.flatMap((order) => live(order).map(computeLineTotalInPaise))),
  };
}

async function lastWeek(tenant, date, now) {
  const earlier = new Date(Date.parse(`${date}T00:00:00Z`) - WEEK_MS).toISOString().slice(0, 10);
  const until = new Date(now.getTime() - WEEK_MS);
  const [row] = await Bill.aggregate([
    { $match: { ...tenant, businessDate: earlier, billedAt: { $lte: until }, ...liveAt(until) } },
    { $group: { _id: null, billTotalInPaise: { $sum: '$grandTotalInPaise' } } },
  ]);
  return row?.billTotalInPaise ?? 0;
}

async function alerts(tenant, date, now, startMinutes) {
  const { start, end } = businessDateRangeToUtc(date, date, startMinutes);
  const [voids, discounts, noCharge, cancelled] = await Promise.all([
    Bill.find({ ...tenant, businessDate: date, isVoided: true, voidedAt: { $lte: now } }).select('billNumber grandTotalInPaise voidedAt').lean(),
    Bill.find({ ...tenant, businessDate: date, 'discount.appliedAt': { $lte: now }, ...liveAt(now) })
      .select('billNumber subtotalInPaise discount')
      .lean(),
    Order.find({ ...tenant, 'noCharge.businessDate': date, 'noCharge.at': { $lte: now } }).select('tableName noCharge').lean(),
    Order.find({ ...tenant, 'lines.cancelledAt': { $gte: start, $lt: end } }).select('tableName lines').lean(),
  ]);

  const list = [
    ...voids.map((bill) => ({ kind: 'VOID', at: bill.voidedAt, detail: bill.billNumber, amountInPaise: bill.grandTotalInPaise, billId: String(bill._id) })),
    ...discounts
      .filter((bill) => bill.discount.amountInPaise * 10_000 > LARGE_DISCOUNT_BPS * bill.subtotalInPaise)
      .map((bill) => ({ kind: 'DISCOUNT', at: bill.discount.appliedAt, detail: bill.billNumber, amountInPaise: bill.discount.amountInPaise, billId: String(bill._id) })),
    ...noCharge.map((order) => ({ kind: 'NO_CHARGE', at: order.noCharge.at, detail: order.tableName ?? 'No table', amountInPaise: order.noCharge.valueInPaise, orderId: String(order._id) })),
    ...cancelled.flatMap((order) =>
      order.lines
        .filter((line) => line.status === ORDER_LINE_STATUSES.CANCELLED && line.wasPrepared === true && line.cancelledAt <= now && line.cancelledAt >= start)
        .map((line) => ({ kind: 'CANCELLED_AFTER_PREP', at: line.cancelledAt, detail: line.itemName, amountInPaise: computeLineTotalInPaise(line), orderId: String(order._id) })),
    ),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  return list.map((alert) => ({
    ...alert,
    kindCode: alert.kind,
    kind: ALERT_WORDS[alert.kind],
    drill: {
      amountInPaise: alert.billId
        ? toBills({ from: date, to: date, billNumber: alert.detail, ...(alert.kind === 'VOID' ? { status: 'VOIDED' } : {}) })
        : { report: 'ORDER', query: { orderId: alert.orderId } },
    },
  }));
}

export default {
  id: 'R1',
  name: 'today',
  title: 'Today',
  roles: MANAGERS,
  schema: z.object({ format: z.enum(['json', 'xlsx'], { error: 'Must be json or xlsx.' }).default('json') }).strict('Today takes no filters.'),
  filters: [],
  dimensions: [],
  columns: tileColumns,

  /** Today is the current business date, from the restaurant's own day start. */
  async prepare(req, params) {
    const startMinutes = await getSetting(req.restaurantId, 'business.businessDayStartsAtMinutes', { req });
    return { ...params, date: businessDateFor(nowUtc(), startMinutes) };
  },

  async query(req, baseMatch, params) {
    const now = nowUtc();
    const startMinutes = await getSetting(req.restaurantId, 'business.businessDayStartsAtMinutes', { req });
    const shownTiles = await getSetting(req.restaurantId, 'appearance.todayTiles', { req });
    const date = params.date;
    const tenant = { restaurantId: baseMatch.restaurantId, branchId: baseMatch.branchId };

    const [figures, tables, previous, items, alertRows] = await Promise.all([
      computeDayFigures(req, date, { upTo: now }),
      openTables(tenant),
      lastWeek(tenant, date, now),
      topItems(tenant, date, now),
      alerts(tenant, date, now, startMinutes),
    ]);
    // P25 Part L. Open integration alerts follow the day's own, each with its sentence and a link.
    const integrationRows = (await listAlerts(req)).map((alert) => ({
      kind: ALERT_WORDS.INTEGRATION,
      kindCode: 'INTEGRATION',
      at: alert.at,
      detail: alert.sentence,
      amountInPaise: null,
      integrationKind: alert.kind,
      link: alert.link,
      drill: alert.link ? { detail: { report: 'LINK', query: { to: alert.link } } } : {},
    }));
    alertRows.push(...integrationRows);

    const day = { from: date, to: date };
    const tiles = {
      billTotalInPaise: figures.sales.billTotalInPaise,
      netSalesInPaise: figures.sales.netSalesInPaise,
      billCount: figures.sales.billCount,
      covers: figures.sales.covers,
      averagePerCoverInPaise: figures.sales.averagePerCoverInPaise,
      ...tables,
      unpaidCount: figures.money.unpaidBillCount,
      unpaidInPaise: figures.money.unpaidInPaise,
      lastWeekBillTotalInPaise: previous,
      drill: {
        billTotalInPaise: toBills(day),
        netSalesInPaise: toBills(day),
        billCount: toBills(day),
        unpaidCount: toBills({ ...day, status: 'UNPAID' }),
        unpaidInPaise: toBills({ ...day, status: 'UNPAID' }),
      },
    };

    // P20B: the owner's tiles, in the owner's order. Figures are untouched.
    const columns = shownTiles.map((key) => tileColumns.find((column) => column.key === key)).filter(Boolean);
    const tileRow = Object.fromEntries(columns.map(({ key }) => [key, tiles[key]]));
    tileRow.drill = Object.fromEntries(Object.entries(tiles.drill).filter(([key]) => key in tileRow));

    const money = [
      ...figures.money.methods.map((method) => ({
        line: method.methodName,
        count: method.paymentCount,
        amountInPaise: method.amountInPaise,
        drill: { amountInPaise: toBills({ ...day, method: method.method }) },
      })),
      ...figures.money.onHold.map((row) => ({
        line: `On Hold: ${row.accountName}`,
        count: row.billCount,
        amountInPaise: row.amountInPaise,
        ...(row.accountId ? { drill: { amountInPaise: toBills({ ...day, accountId: row.accountId }) } } : {}),
      })),
      { line: LABELS.UNPAID, count: figures.money.unpaidBillCount, amountInPaise: figures.money.unpaidInPaise, drill: { amountInPaise: toBills({ ...day, status: 'UNPAID' }) } },
    ];

    return {
      sections: [
        { key: 'tiles', title: 'Today so far', columns, rows: [tileRow], totals: {} },
        {
          key: 'money',
          title: 'Money so far',
          columns: FIGURE_COLUMNS,
          rows: money,
          totals: {
            amountInPaise: figures.money.totalInPaise,
            inHandInPaise: figures.money.inHandInPaise,
            platformInPaise: figures.money.platformInPaise,
          },
        },
        {
          key: 'topItems',
          title: 'Top items',
          columns: topItemColumns,
          rows: items.map(({ itemName, ...item }) => ({ ...item, drill: { quantity: toBills({ ...day, itemName }) } })),
          totals: {},
        },
        { key: 'alerts', title: 'Alerts', columns: alertColumns, rows: alertRows, totals: { count: alertRows.length } },
      ],
      extra: { date, asAt: now.toISOString() },
    };
  },

  checks(req, params) {
    return runRangeChecks(req, { from: params.date, to: params.date }, ['C1', 'C3', 'C4']);
  },
};
