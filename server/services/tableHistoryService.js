/**
 * A table's history for the day. P48, API-CONTRACT P48 section 1a.
 *
 * PetPooja's Recall on a table: what the table has had today, each send to
 * the kitchen with its KOT numbers and who sent it, what was cancelled and
 * why, and the bill. Read-only, from the frozen order lines; the people's
 * names are attached as labels, as reports do.
 */
import { LINE_CANCEL_REASONS, reasonText } from '../config/cancelReasons.js';
import { Bill } from '../models/Bill.js';
import { Kot } from '../models/Kot.js';
import { ORDER_LINE_STATUSES, Order } from '../models/Order.js';
import { Table } from '../models/Table.js';
import { User } from '../models/User.js';
import { NotFoundError } from '../utils/errors.js';
import { scoped } from '../utils/scopedQuery.js';
import { businessDateRangeToUtc } from '../utils/time.js';
import { todayBusinessDate } from './dayLockService.js';
import { getSetting } from './settingsService.js';

const lineView = (line) => ({
  itemName: line.itemName,
  variantName: line.variantName ?? null,
  quantity: line.quantity,
  addOnNames: (line.addOns ?? []).map((addOn) => addOn.name),
  status: line.status,
});

export async function tableHistory(req, tableId, { date = null } = {}) {
  const table = await Table.findOne({ ...scoped(req), _id: tableId }).select('name').lean();
  if (!table) throw new NotFoundError('Table not found.');

  const businessDate = date ?? (await todayBusinessDate(req));
  const startMinutes = await getSetting(req.restaurantId, 'business.businessDayStartsAtMinutes', { req });
  const { start, end } = businessDateRangeToUtc(businessDate, businessDate, startMinutes);
  const orders = await Order.find({ ...scoped(req), tableId, openedAt: { $gte: start, $lt: end } }).sort({ openedAt: -1 }).lean();

  const lines = orders.flatMap((order) => order.lines);
  const kotIds = [...new Set(lines.map((line) => line.kotId).filter(Boolean).map(String))];
  const personIds = [
    ...new Set(
      [...orders.map((order) => order.openedBy), ...lines.map((line) => line.addedBy), ...lines.map((line) => line.cancelledBy)]
        .filter(Boolean)
        .map(String),
    ),
  ];
  const [kots, people, bills] = await Promise.all([
    kotIds.length ? Kot.find({ ...scoped(req), _id: { $in: kotIds } }).select('kotNumber').lean() : [],
    personIds.length ? User.find({ ...scoped(req), _id: { $in: personIds } }).select('name').lean() : [],
    orders.length
      ? Bill.find({ ...scoped(req), orderId: { $in: orders.map((order) => order._id) } })
          .select('orderId billNumber status isVoided grandTotalInPaise billedAt')
          .sort({ billedAt: -1 })
          .lean()
      : [],
  ]);
  const kotNumber = new Map(kots.map((kot) => [String(kot._id), kot.kotNumber]));
  const nameOf = new Map(people.map((person) => [String(person._id), person.name]));
  const name = (id) => (id ? nameOf.get(String(id)) ?? null : null);

  return {
    tableName: table.name,
    businessDate,
    orders: orders.map((order) => {
      const sends = new Map();
      for (const line of order.lines) {
        if (!line.firedAt || line.status === ORDER_LINE_STATUSES.PENDING) continue;
        const key = new Date(line.firedAt).toISOString();
        const send = sends.get(key) ?? { firedAt: line.firedAt, kotNumbers: new Set(), sentByName: name(line.addedBy), lines: [] };
        if (line.kotId && kotNumber.has(String(line.kotId))) send.kotNumbers.add(kotNumber.get(String(line.kotId)));
        if (line.status !== ORDER_LINE_STATUSES.CANCELLED) send.lines.push(lineView(line));
        sends.set(key, send);
      }
      // Live bill first, else the latest voided one.
      const orderBills = bills.filter((bill) => String(bill.orderId) === String(order._id));
      const bill = orderBills.find((entry) => !entry.isVoided) ?? orderBills[0] ?? null;
      return {
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        status: order.status,
        openedAt: order.openedAt,
        openedByName: name(order.openedBy),
        guestCount: order.guestCount ?? null,
        sends: [...sends.values()]
          .sort((a, b) => new Date(a.firedAt) - new Date(b.firedAt))
          .map((send) => ({ ...send, kotNumbers: [...send.kotNumbers].sort((a, b) => a - b) })),
        notSent: order.lines.filter((line) => line.status === ORDER_LINE_STATUSES.PENDING).map(lineView),
        cancelled: order.lines
          .filter((line) => line.status === ORDER_LINE_STATUSES.CANCELLED)
          .map((line) => ({
            ...lineView(line),
            at: line.cancelledAt ?? null,
            byName: name(line.cancelledBy),
            reason: line.cancelReasonCode ? reasonText(LINE_CANCEL_REASONS, line.cancelReasonCode, line.cancelReason) : line.cancelReason ?? null,
            wasPrepared: line.wasPrepared ?? null,
          })),
        bill: bill
          ? { billId: String(bill._id), billNumber: bill.billNumber, status: bill.isVoided ? 'VOIDED' : bill.status, grandTotalInPaise: bill.grandTotalInPaise }
          : null,
      };
    }),
  };
}

export default { tableHistory };
