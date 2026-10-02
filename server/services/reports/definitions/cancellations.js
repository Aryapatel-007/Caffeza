/**
 * R15 Cancellations and Voids. M19, built in P17. docs/API-CONTRACT.md "M19" R15.
 *
 * Three kinds of money leaving without a sale, each dated by the business date
 * of when it happened:
 *
 *   items   each line cancelled on its own, by `lines[].cancelledAt`;
 *   orders  each whole order cancelled, by `orders.cancelledAt`;
 *   voids   each voided bill, by the bill's business date.
 *
 * A line cancelled together with its order is part of that order, not an item
 * row, and takes the order's reason (P04: such a line stores only the note).
 * The summary groups every cancelled line, both kinds, by reason, person and
 * item. Wasted value is the line total of lines made and thrown away, from
 * `wasPrepared: true`, whichever way they were cancelled.
 */
import { BILL_VOID_REASONS, LINE_CANCEL_REASONS, ORDER_CANCEL_REASONS } from '../../../config/cancelReasons.js';
import { Bill } from '../../../models/Bill.js';
import { Order, ORDER_LINE_STATUSES } from '../../../models/Order.js';
import { sumPaise } from '../../../utils/money.js';
import { computeLineTotalInPaise } from '../../orderService.js';
import { runRangeChecks } from '../../reconciliationService.js';
import { LABELS } from '../labels.js';
import { reportQuery } from '../params.js';
import { instantsFor, MANAGERS, tenantOf, toBills } from './shared.js';

export const STAGES = Object.freeze({
  BEFORE_PREPARATION: 'Cancelled before preparation',
  AFTER_PREPARATION: 'Cancelled after preparation',
});

const label = (list, code) => list.find((reason) => reason.code === code)?.label ?? null;
const withNote = (text, note) => (text && note ? `${text}: ${note}` : text ?? note ?? 'Not recorded');

const itemColumns = [
  { key: 'cancelledAt', label: LABELS.TIME, type: 'time' },
  { key: 'tableName', label: LABELS.TABLE, type: 'text' },
  { key: 'captainName', label: LABELS.CAPTAIN, type: 'text' },
  { key: 'itemName', label: LABELS.ITEM, type: 'text' },
  { key: 'quantity', label: LABELS.QUANTITY, type: 'count' },
  { key: 'lineTotalInPaise', label: LABELS.LINE_TOTAL, type: 'money' },
  { key: 'stageLabel', label: LABELS.STAGE, type: 'text' },
  { key: 'reason', label: LABELS.CANCEL_REASON, type: 'text' },
  { key: 'cancelledByName', label: LABELS.CANCELLED_BY, type: 'text' },
];

const orderColumns = [
  { key: 'cancelledAt', label: LABELS.TIME, type: 'time' },
  { key: 'tableName', label: LABELS.TABLE, type: 'text' },
  { key: 'lineTotalInPaise', label: LABELS.LINE_TOTAL, type: 'money' },
  { key: 'reason', label: LABELS.CANCEL_REASON, type: 'text' },
  { key: 'cancelledByName', label: LABELS.CANCELLED_BY, type: 'text' },
];

const voidColumns = [
  { key: 'billNumber', label: LABELS.INVOICE_NUMBER, type: 'text' },
  { key: 'billTotalInPaise', label: LABELS.BILL_TOTAL, type: 'money' },
  { key: 'reason', label: LABELS.VOID_REASON, type: 'text' },
  { key: 'voidedByName', label: LABELS.VOIDED_BY, type: 'text' },
  { key: 'voidedAt', label: LABELS.TIME, type: 'time' },
];

const summaryColumns = (first) => [
  { key: 'name', label: first, type: 'text' },
  { key: 'quantity', label: LABELS.QUANTITY, type: 'count' },
  { key: 'lineTotalInPaise', label: LABELS.LINE_TOTAL, type: 'money' },
  { key: 'wastedValueInPaise', label: LABELS.WASTED_VALUE, type: 'money' },
];

const placeOf = (order) =>
  order.tableName ?? (order.platform ? `${order.platform.name} ${order.platform.orderId}` : order.orderType === 'TAKEAWAY' ? 'Takeaway' : null);

/** Groups cancelled lines for the summary. */
function summarise(lines, keyOf) {
  const groups = new Map();
  for (const line of lines) {
    const key = keyOf(line);
    const entry = groups.get(key) ?? { name: key, quantity: 0, lineTotalInPaise: 0, wastedValueInPaise: 0 };
    entry.quantity += line.quantity;
    entry.lineTotalInPaise += line.lineTotalInPaise;
    entry.wastedValueInPaise += line.wastedValueInPaise;
    groups.set(key, entry);
  }
  return [...groups.values()].sort((a, b) => b.lineTotalInPaise - a.lineTotalInPaise || a.name.localeCompare(b.name));
}

const summaryTotals = (rows) => ({
  quantity: sumPaise(0, ...rows.map((row) => row.quantity)),
  lineTotalInPaise: sumPaise(0, ...rows.map((row) => row.lineTotalInPaise)),
  wastedValueInPaise: sumPaise(0, ...rows.map((row) => row.wastedValueInPaise)),
});

export default {
  id: 'R15',
  name: 'cancellations',
  title: 'Cancellations and Voids',
  roles: MANAGERS,
  schema: reportQuery([], { paged: true }),
  filters: [],
  dimensions: [],
  columns: itemColumns,

  async query(req, baseMatch, params, ctx) {
    const { start, end } = await instantsFor(req, params.from, params.to);
    const tenant = tenantOf(baseMatch);
    const inRange = (instant) => instant && instant >= start && instant < end;

    const [orders, voidedBills] = await Promise.all([
      Order.find({ ...tenant, $or: [{ 'lines.cancelledAt': { $gte: start, $lt: end } }, { cancelledAt: { $gte: start, $lt: end } }] })
        .select('orderNumber orderType tableName platform openedBy isCancelled cancelledAt cancelledBy cancelReasonCode cancelReason lines')
        .lean(),
      Bill.find({ ...tenant, businessDate: { $gte: params.from, $lte: params.to }, isVoided: true })
        .sort({ voidedAt: 1 })
        .select('billNumber grandTotalInPaise voidReasonCode voidReason voidedBy voidedAt')
        .lean(),
    ]);

    // The captain of a billed order is the name frozen on its bill.
    const bills = await Bill.find({ ...tenant, orderId: { $in: orders.map((order) => order._id) } }).select('orderId captainName').lean();
    const captainByOrder = new Map(bills.filter((bill) => bill.captainName).map((bill) => [String(bill.orderId), bill.captainName]));

    const itemLines = [];
    const orderRows = [];
    const everyLine = [];
    for (const order of orders) {
      const wholeOrder = order.isCancelled && inRange(order.cancelledAt);
      const withOrder = (line) => order.isCancelled && line.cancelledAt?.getTime() === order.cancelledAt?.getTime();
      if (wholeOrder) {
        const lines = order.lines.filter((line) => line.status === ORDER_LINE_STATUSES.CANCELLED && withOrder(line));
        orderRows.push({
          orderId: String(order._id),
          cancelledAt: order.cancelledAt,
          tableName: placeOf(order),
          lineTotalInPaise: sumPaise(0, ...lines.map(computeLineTotalInPaise)),
          reason: withNote(label(ORDER_CANCEL_REASONS, order.cancelReasonCode), order.cancelReason),
          cancelledBy: order.cancelledBy ? String(order.cancelledBy) : null,
        });
        for (const line of lines) {
          everyLine.push({
            line,
            order,
            reason: label(ORDER_CANCEL_REASONS, order.cancelReasonCode) ?? 'Not recorded',
            cancelledBy: order.cancelledBy ? String(order.cancelledBy) : null,
          });
        }
      }
      for (const line of order.lines) {
        if (line.status !== ORDER_LINE_STATUSES.CANCELLED || !inRange(line.cancelledAt) || withOrder(line)) continue;
        const entry = {
          line,
          order,
          reason: label(LINE_CANCEL_REASONS, line.cancelReasonCode) ?? 'Not recorded',
          cancelledBy: line.cancelledBy ? String(line.cancelledBy) : null,
        };
        itemLines.push(entry);
        everyLine.push(entry);
      }
    }

    const names = await ctx.personNames([
      ...everyLine.map((entry) => entry.cancelledBy),
      ...orderRows.map((row) => row.cancelledBy),
      ...orders.map((order) => order.openedBy),
      ...voidedBills.map((bill) => bill.voidedBy),
    ]);
    const nameOf = (id) => (id ? names.get(String(id)) ?? 'Unknown' : 'Not recorded');

    const shaped = (entry) => {
      const lineTotalInPaise = computeLineTotalInPaise(entry.line);
      const after = entry.line.wasPrepared === true;
      return {
        orderId: String(entry.order._id),
        cancelledAt: entry.line.cancelledAt,
        tableName: placeOf(entry.order),
        captainName: captainByOrder.get(String(entry.order._id)) ?? nameOf(entry.order.openedBy),
        itemName: entry.line.variantName ? `${entry.line.itemName} (${entry.line.variantName})` : entry.line.itemName,
        quantity: entry.line.quantity,
        lineTotalInPaise,
        wastedValueInPaise: after ? lineTotalInPaise : 0,
        stage: after ? 'AFTER_PREPARATION' : 'BEFORE_PREPARATION',
        stageLabel: after ? STAGES.AFTER_PREPARATION : STAGES.BEFORE_PREPARATION,
        reason: entry.reason,
        cancelledByName: nameOf(entry.cancelledBy),
      };
    };

    const items = itemLines
      .map((entry) => {
        const row = shaped(entry);
        if (entry.line.cancelReason) row.reason = `${row.reason}: ${entry.line.cancelReason}`;
        return { ...row, drill: { itemName: { report: 'ORDER', query: { orderId: row.orderId } } } };
      })
      .sort((a, b) => a.cancelledAt - b.cancelledAt);
    const allLines = everyLine.map(shaped);

    const ordersSection = orderRows
      .sort((a, b) => a.cancelledAt - b.cancelledAt)
      .map(({ cancelledBy, ...row }) => ({ ...row, cancelledByName: nameOf(cancelledBy), drill: { tableName: { report: 'ORDER', query: { orderId: row.orderId } } } }));

    const voids = voidedBills.map((bill) => ({
      billNumber: bill.billNumber,
      billTotalInPaise: bill.grandTotalInPaise,
      reason: withNote(label(BILL_VOID_REASONS, bill.voidReasonCode), bill.voidReason),
      voidedByName: nameOf(bill.voidedBy),
      voidedAt: bill.voidedAt,
      drill: { billNumber: toBills({ from: params.from, to: params.to, status: 'VOIDED', billNumber: bill.billNumber }) },
    }));

    const byReason = summarise(allLines, (line) => line.reason);
    const byPerson = summarise(allLines, (line) => line.cancelledByName);
    const byItem = summarise(allLines, (line) => line.itemName);
    const wastedValueInPaise = sumPaise(0, ...allLines.map((line) => line.wastedValueInPaise));

    const { page, limit } = params;
    return {
      sections: [
        {
          key: 'items',
          title: 'Items cancelled',
          columns: itemColumns,
          rows: items.slice((page - 1) * limit, page * limit),
          totals: {
            quantity: sumPaise(0, ...items.map((row) => row.quantity)),
            lineTotalInPaise: sumPaise(0, ...items.map((row) => row.lineTotalInPaise)),
          },
        },
        {
          key: 'orders',
          title: 'Orders cancelled',
          columns: orderColumns,
          rows: ordersSection,
          totals: { count: ordersSection.length, lineTotalInPaise: sumPaise(0, ...ordersSection.map((row) => row.lineTotalInPaise)) },
        },
        {
          key: 'voids',
          title: 'Bills voided',
          columns: voidColumns,
          rows: voids,
          totals: { count: voids.length, billTotalInPaise: sumPaise(0, ...voids.map((row) => row.billTotalInPaise)) },
        },
        { key: 'byReason', title: 'By reason', columns: summaryColumns(LABELS.CANCEL_REASON), rows: byReason, totals: summaryTotals(byReason) },
        { key: 'byPerson', title: 'By person', columns: summaryColumns(LABELS.CANCELLED_BY), rows: byPerson, totals: summaryTotals(byPerson) },
        { key: 'byItem', title: 'By item', columns: summaryColumns(LABELS.ITEM), rows: byItem, totals: summaryTotals(byItem) },
      ],
      extra: { headline: { wastedValueInPaise } },
      meta: { page, limit, total: items.length },
    };
  },

  checks(req, params) {
    return runRangeChecks(req, { from: params.from, to: params.to }, ['C6', 'C7']);
  },
};
