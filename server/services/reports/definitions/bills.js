/**
 * R19 Bill List. M19, built in P14. docs/API-CONTRACT.md "M19" R19.
 *
 * The page every drill down opens, so it accepts every filter in the contract.
 * Paged; the totals cover every matching bill, never only the page. Voided
 * bills are left out unless `status=VOIDED` asks for exactly them.
 *
 * Also `readBillDetail`: one bill in full, with a timeline of its order.
 */
import mongoose from 'mongoose';

import { BILL_VOID_REASONS, LINE_CANCEL_REASONS, reasonText } from '../../../config/cancelReasons.js';
import { DISCOUNT_REASONS } from '../../../config/discountReasons.js';
import { config } from '../../../config/env.js';
import { ROLES } from '../../../config/roles.js';
import { Bill } from '../../../models/Bill.js';
import { Kot } from '../../../models/Kot.js';
import { Order } from '../../../models/Order.js';
import { NotFoundError } from '../../../utils/errors.js';
import { scoped } from '../../../utils/scopedQuery.js';
import { checkC1, checkC2, checkC4 } from '../../reconciliationService.js';
import { LABELS } from '../labels.js';
import { reportQuery } from '../params.js';

const FILTER_NAMES = [
  'orderType', 'platform', 'captainId', 'table', 'method', 'status', 'categoryName', 'itemName',
  'taxRateBps', 'discountReason', 'accountId', 'hour', 'weekday', 'hasDiscount', 'hasCancellations', 'billNumber',
];

const oid = (value) => new mongoose.Types.ObjectId(String(value));

/** The filters as a `$match` on bills. Shared with any report that drills here. */
export async function billFilterMatch(req, params) {
  const match = {};
  const expr = [];
  if (params.orderType) match.orderType = params.orderType;
  if (params.platform) match['platform.code'] = params.platform;
  if (params.captainId) match.captainId = oid(params.captainId);
  if (params.table) match.tableName = params.table;
  if (params.method) match['payments.method'] = params.method;
  if (params.status === 'VOIDED') match.isVoided = true;
  else if (params.status) match.status = params.status;
  if (params.categoryName) match['lines.categoryName'] = params.categoryName;
  if (params.itemName) match['lines.itemName'] = params.itemName;
  if (params.taxRateBps !== undefined) match['taxBreakdown.taxRateBps'] = params.taxRateBps;
  if (params.discountReason) match['discount.reasonCode'] = params.discountReason;
  if (params.accountId) match['account.accountId'] = oid(params.accountId);
  if (params.billNumber) match.billNumber = params.billNumber;
  if (params.hasDiscount === true) match['discount.amountInPaise'] = { $gt: 0 };
  if (params.hasDiscount === false) match.$or = [{ discount: null }, { 'discount.amountInPaise': 0 }];
  if (params.hour !== undefined) {
    expr.push({ $eq: [{ $hour: { date: '$billedAt', timezone: config.DISPLAY_TIMEZONE } }, params.hour] });
  }
  if (params.weekday !== undefined) {
    expr.push({ $eq: [{ $isoDayOfWeek: { $dateFromString: { dateString: '$businessDate' } } }, params.weekday] });
  }
  if (params.hasCancellations !== undefined) {
    const withCancellations = await Order.distinct('_id', { ...scoped(req), 'lines.status': 'CANCELLED' });
    match.orderId = params.hasCancellations ? { $in: withCancellations } : { $nin: withCancellations };
  }
  if (expr.length === 1) match.$expr = expr[0];
  if (expr.length > 1) match.$expr = { $and: expr };
  return match;
}

const netSales = { $reduce: { input: '$taxBreakdown', initialValue: 0, in: { $add: ['$$value', '$$this.taxableInPaise'] } } };

const columns = [
  { key: 'billNumber', label: LABELS.INVOICE_NUMBER, type: 'text' },
  { key: 'businessDate', label: LABELS.BUSINESS_DATE, type: 'date' },
  { key: 'billedAt', label: LABELS.TIME_ISSUED, type: 'time' },
  { key: 'paidAt', label: LABELS.TIME_PAID, type: 'time' },
  { key: 'place', label: LABELS.TABLE, type: 'text' },
  { key: 'captainName', label: LABELS.CAPTAIN, type: 'text' },
  { key: 'covers', label: LABELS.COVERS, type: 'count' },
  { key: 'itemTotalInPaise', label: LABELS.ITEM_TOTAL, type: 'money' },
  { key: 'discountInPaise', label: LABELS.DISCOUNT, type: 'money' },
  { key: 'netSalesInPaise', label: LABELS.NET_SALES, type: 'money' },
  { key: 'gstInPaise', label: LABELS.GST, type: 'money' },
  { key: 'roundOffInPaise', label: LABELS.ROUND_OFF, type: 'money' },
  { key: 'billTotalInPaise', label: LABELS.BILL_TOTAL, type: 'money' },
  { key: 'paidWith', label: LABELS.PAID_WITH, type: 'text' },
  { key: 'status', label: LABELS.STATUS, type: 'text' },
];

const STATUS_WORDS = { UNPAID: 'Unpaid', PAID: 'Paid', ON_ACCOUNT: 'On Hold' };

export default {
  id: 'R19',
  name: 'bills',
  title: 'Bill List',
  roles: [ROLES.OWNER, ROLES.MANAGER],
  schema: reportQuery(FILTER_NAMES, { paged: true }),
  filters: FILTER_NAMES,
  dimensions: [],
  columns,
  checkIds: ['C1', 'C2', 'C4'],
  includesVoided: (params) => params.status === 'VOIDED',

  async query(req, baseMatch, params) {
    const match = { ...baseMatch, ...(await billFilterMatch(req, params)) };
    const { page, limit } = params;

    const [result] = await Bill.aggregate([
      { $match: match },
      {
        $facet: {
          rows: [
            { $sort: { billedAt: 1, billSequence: 1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                billId: { $toString: '$_id' },
                billNumber: 1,
                businessDate: 1,
                billedAt: 1,
                paidAt: 1,
                tableName: 1,
                orderType: 1,
                platform: 1,
                captainName: 1,
                guestCount: 1,
                itemTotalInPaise: '$subtotalInPaise',
                discountInPaise: { $ifNull: ['$discount.amountInPaise', 0] },
                netSalesInPaise: netSales,
                gstInPaise: '$totalTaxInPaise',
                roundOffInPaise: 1,
                billTotalInPaise: '$grandTotalInPaise',
                methodNames: { $map: { input: '$payments', as: 'p', in: { $ifNull: ['$$p.methodName', '$$p.method'] } } },
                status: 1,
                isVoided: 1,
                accountName: '$account.accountName',
              },
            },
          ],
          totals: [
            {
              $group: {
                _id: null,
                billCount: { $sum: 1 },
                covers: { $sum: { $cond: [{ $eq: ['$orderType', 'DINE_IN'] }, { $ifNull: ['$guestCount', 0] }, 0] } },
                itemTotalInPaise: { $sum: '$subtotalInPaise' },
                discountInPaise: { $sum: { $ifNull: ['$discount.amountInPaise', 0] } },
                netSalesInPaise: { $sum: netSales },
                gstInPaise: { $sum: '$totalTaxInPaise' },
                roundOffInPaise: { $sum: '$roundOffInPaise' },
                billTotalInPaise: { $sum: '$grandTotalInPaise' },
              },
            },
          ],
        },
      },
    ]);

    const rows = result.rows.map((row) => ({
      billId: row.billId,
      billNumber: row.billNumber,
      businessDate: row.businessDate,
      billedAt: row.billedAt,
      paidAt: row.paidAt ?? null,
      place: row.tableName ?? (row.platform?.name ? `${row.platform.name} ${row.platform.orderId}` : row.orderType),
      captainName: row.captainName ?? null,
      covers: row.orderType === 'DINE_IN' ? (row.guestCount ?? 0) : 0,
      itemTotalInPaise: row.itemTotalInPaise,
      discountInPaise: row.discountInPaise,
      netSalesInPaise: row.netSalesInPaise,
      gstInPaise: row.gstInPaise,
      roundOffInPaise: row.roundOffInPaise,
      billTotalInPaise: row.billTotalInPaise,
      paidWith: [...row.methodNames, ...(row.accountName ? [`On Hold: ${row.accountName}`] : [])].join(', '),
      status: row.isVoided ? 'Voided' : STATUS_WORDS[row.status] ?? row.status,
    }));

    const totals = result.totals[0] ?? {
      billCount: 0, covers: 0, itemTotalInPaise: 0, discountInPaise: 0, netSalesInPaise: 0,
      gstInPaise: 0, roundOffInPaise: 0, billTotalInPaise: 0,
    };
    delete totals._id;

    return { rows, totals, meta: { page, limit, total: totals.billCount } };
  },

  /** C1, C2 and C4 for each bill shown. */
  async checks(req, params, result) {
    if (result.rows.length === 0) return [checkC1([]), checkC2([]), checkC4([])];
    const shown = await Bill.find({ ...scoped(req), _id: { $in: result.rows.map((row) => row.billId) } }).lean();
    const live = shown.filter((bill) => !bill.isVoided);
    return [checkC1(live), checkC2(live), checkC4(live)];
  },
};

/**
 * One bill in full, for GET /reports/v2/bills/:billId: lines with shares,
 * payments with corrections, the discount and who applied it, the account
 * charge, void details, and a timeline of the order from opening to payment.
 */
export async function readBillDetail(req, billId, ctx) {
  if (!mongoose.isValidObjectId(billId)) throw new NotFoundError('Bill not found.');
  const bill = await Bill.findOne({ ...scoped(req), _id: billId }).lean();
  if (!bill) throw new NotFoundError('Bill not found.');
  const order = await Order.findOne({ ...scoped(req), _id: bill.orderId }).lean();
  const kots = await Kot.find({ ...scoped(req), orderId: bill.orderId }).sort({ firedAt: 1 }).lean();

  const people = await ctx.personNames([
    order?.openedBy,
    bill.discount?.appliedBy,
    bill.voidedBy,
    bill.chargedBy,
    ...(order?.lines ?? []).map((line) => line.cancelledBy),
    ...bill.payments.map((payment) => payment.receivedBy),
  ]);
  const name = (id) => (id ? people.get(String(id)) ?? 'Unknown' : null);

  const events = [];
  const add = (at, event, detail = null, by = null) => {
    if (at) events.push({ at, event, detail, by });
  };
  if (order) {
    add(order.openedAt, 'Order opened', order.tableName ?? order.orderType, bill.captainName ?? name(order.openedBy));
    for (const line of order.lines) {
      const label = `${line.quantity} × ${line.itemName}${line.variantName ? ` (${line.variantName})` : ''}`;
      add(line.addedAt, 'Item added', label);
      add(line.readyAt, 'Item ready', label);
      add(line.servedAt, 'Item served', label);
      if (line.status === 'CANCELLED') {
        const stage = line.wasPrepared === true ? 'after preparation' : 'before preparation';
        const reason = line.cancelReasonCode ? reasonText(LINE_CANCEL_REASONS, line.cancelReasonCode, line.cancelReason) : line.cancelReason;
        add(line.cancelledAt, 'Item cancelled', `${label}, ${stage}${reason ? `: ${reason}` : ''}`, name(line.cancelledBy));
      }
    }
  }
  for (const kot of kots) {
    add(kot.firedAt, 'Sent to the kitchen', `KOT ${kot.kotNumber}${kot.stationName ? `, ${kot.stationName}` : ''}`);
  }
  add(bill.billedAt, 'Billed', bill.billNumber);
  if (bill.discount) {
    const reason = bill.discount.reasonCode
      ? reasonText(DISCOUNT_REASONS, bill.discount.reasonCode, bill.discount.reason)
      : bill.discount.reason;
    add(bill.discount.appliedAt, 'Discount applied', reason, name(bill.discount.appliedBy));
  }
  for (const payment of bill.payments) {
    add(payment.receivedAt, 'Payment', `${payment.methodName ?? payment.method}, business date ${payment.businessDate ?? bill.businessDate}`, name(payment.receivedBy));
    for (const change of payment.corrections ?? []) {
      add(change.at, 'Payment method changed', `${change.fromMethod} to ${change.toMethod}: ${change.reason}`);
    }
  }
  add(bill.chargedAt, 'Charged to account', bill.account?.accountName, name(bill.chargedBy));
  if (bill.isVoided) {
    add(bill.voidedAt, 'Voided', bill.voidReasonCode ? reasonText(BILL_VOID_REASONS, bill.voidReasonCode, bill.voidReason) : bill.voidReason, name(bill.voidedBy));
  }
  // Opening the order is where the story starts, even when its lines were
  // stamped a few milliseconds earlier in the same request.
  const opening = (event) => (event.event === 'Order opened' ? 0 : 1);
  events.sort((a, b) => opening(a) - opening(b) || new Date(a.at) - new Date(b.at));

  return {
    bill: {
      ...bill,
      id: String(bill._id),
      discountAppliedByName: name(bill.discount?.appliedBy),
      voidedByName: name(bill.voidedBy),
    },
    timeline: events,
  };
}
