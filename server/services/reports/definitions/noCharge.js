/**
 * R16 No Charge. M19, built in P17. docs/API-CONTRACT.md "M19" R16.
 *
 * Food given away free, by the business date frozen on the No Charge record.
 * No Charge is not a sale: these orders have no bill and no invoice number, so
 * this report reads `orders`, never `bills`. The value is the one frozen when
 * it was given, before GST, and the column header says so.
 */
import { NO_CHARGE_REASONS } from '../../../config/noChargeReasons.js';
import { Order, ORDER_LINE_STATUSES, ORDER_STATUSES } from '../../../models/Order.js';
import { sumPaise } from '../../../utils/money.js';
import { runRangeChecks } from '../../reconciliationService.js';
import { LABELS } from '../labels.js';
import { reportQuery } from '../params.js';
import { MANAGERS, tenantOf } from './shared.js';

const columns = [
  { key: 'at', label: LABELS.TIME, type: 'time' },
  { key: 'tableName', label: LABELS.TABLE, type: 'text' },
  { key: 'items', label: LABELS.ITEM, type: 'text' },
  { key: 'valueInPaise', label: LABELS.NO_CHARGE_VALUE_BEFORE_GST, type: 'money' },
  { key: 'reason', label: LABELS.NO_CHARGE_REASON, type: 'text' },
  { key: 'requestedByName', label: LABELS.REQUESTED_BY, type: 'text' },
  { key: 'approvedByName', label: LABELS.APPROVED_BY, type: 'text' },
];

const reasonOf = ({ reasonCode, note }) => {
  const text = NO_CHARGE_REASONS.find((reason) => reason.code === reasonCode)?.label ?? reasonCode;
  return note ? `${text}: ${note}` : text;
};

export default {
  id: 'R16',
  name: 'no-charge',
  title: 'No Charge',
  roles: MANAGERS,
  schema: reportQuery([], { paged: true }),
  filters: [],
  dimensions: [],
  columns,

  async query(req, baseMatch, params, ctx) {
    const orders = await Order.find({
      ...tenantOf(baseMatch),
      status: ORDER_STATUSES.NO_CHARGE,
      'noCharge.businessDate': { $gte: params.from, $lte: params.to },
    })
      .sort({ 'noCharge.at': 1 })
      .select('tableName orderType openedBy noCharge lines')
      .lean();

    const names = await ctx.personNames(orders.flatMap((order) => [order.openedBy, order.noCharge.approvedBy]));
    const nameOf = (id) => names.get(String(id)) ?? 'Unknown';

    const rows = orders.map((order) => ({
      at: order.noCharge.at,
      tableName: order.tableName ?? (order.orderType === 'TAKEAWAY' ? 'Takeaway' : null),
      items: order.lines
        .filter((line) => line.status !== ORDER_LINE_STATUSES.CANCELLED)
        .map((line) => `${line.quantity > 1 ? `${line.quantity} × ` : ''}${line.itemName}${line.variantName ? ` (${line.variantName})` : ''}`)
        .join(', '),
      valueInPaise: order.noCharge.valueInPaise,
      reason: reasonOf(order.noCharge),
      requestedByName: nameOf(order.openedBy),
      approvedByName: nameOf(order.noCharge.approvedBy),
      drill: { valueInPaise: { report: 'ORDER', query: { orderId: String(order._id) } } },
    }));

    const { page, limit } = params;
    return {
      rows: rows.slice((page - 1) * limit, page * limit),
      totals: { count: rows.length, valueInPaise: sumPaise(0, ...rows.map((row) => row.valueInPaise)) },
      meta: { page, limit, total: rows.length },
    };
  },

  checks(req, params) {
    return runRangeChecks(req, { from: params.from, to: params.to }, ['C7']);
  },
};
