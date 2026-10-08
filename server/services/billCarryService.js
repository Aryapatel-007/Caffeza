/**
 * Carrying a voided bill's payments onto the bill that replaces it. P25 Part E
 * cancels an item after billing and re-bills at once; P26 reopens a bill so the
 * table can order more, and carries when the order is billed again. Both use
 * this, so the money is moved one way.
 *
 * Payments are carried in this order, oldest first within each: platform
 * money, then card and UPI, then paid online, then cash, until the new bill is
 * covered. Cash not needed is handed back; online money not needed is refunded
 * through the gateway by the caller, after its transaction; anything else not
 * needed is a refund owed, which moves no money here.
 */
import { BILL_STATUSES } from '../models/Bill.js';
import { OnlinePayment } from '../models/OnlinePayment.js';
import { Order, ORDER_STATUSES } from '../models/Order.js';
import { Refund, REFUND_STATUSES } from '../models/Refund.js';
import { sumPaise } from '../utils/money.js';
import { scoped } from '../utils/scopedQuery.js';
import { nowUtc } from '../utils/time.js';
import { chargeInSession } from './accountService.js';
import { ONLINE_METHOD_CODE } from './paymentGatewayService.js';

const CASH = 'CASH';

/** Platform money first, then card and UPI, then paid online, then cash. */
export function carryRank(payment) {
  if (payment.methodKind === 'PLATFORM') return 0;
  if (payment.method === CASH) return 3;
  if (payment.method === ONLINE_METHOD_CODE) return 2;
  return 1;
}

const frozenPayment = (payment) => {
  const plain = payment.toObject ? payment.toObject() : { ...payment };
  delete plain._id;
  delete plain.corrections;
  delete plain.carriedFromBillId;
  // The notes handed over belong to the voided payment; a carried amount may be smaller.
  delete plain.tender;
  return plain;
};

/**
 * Moves `voided`'s payments onto `newBill` (a document, saved here), marks the
 * order billed when paid, or charges a voided On Hold bill's unpaid rest to the
 * same account, and records what is left over. Returns `{ newBill,
 * carriedInPaise, cashToGiveBackInPaise, refundsOwed, onlineLeftoverInPaise }`.
 */
export async function carryPayments(req, { voided, newBill, order, today }, session) {
  const payments = [...voided.payments].sort((a, b) => carryRank(a) - carryRank(b) || new Date(a.receivedAt) - new Date(b.receivedAt));
  const carried = new Map();
  let bill = newBill;

  let due = bill.grandTotalInPaise;
  for (const payment of payments) {
    if (due <= 0) break;
    const amount = Math.min(payment.amountInPaise, due);
    bill.payments.push({ ...frozenPayment(payment), amountInPaise: amount, carriedFromBillId: voided._id });
    carried.set(String(payment._id), amount);
    due -= amount;
  }
  bill.amountPaidInPaise = sumPaise(0, ...bill.payments.map((payment) => payment.amountInPaise));
  const paid = bill.amountPaidInPaise >= bill.grandTotalInPaise;
  if (paid) {
    bill.status = BILL_STATUSES.PAID;
    bill.paidAt = nowUtc();
  }
  await bill.save({ session });

  // P24. A carried online payment claims the advance again, as the void released it.
  const onlineCarried = sumPaise(0, ...payments.filter((payment) => payment.method === ONLINE_METHOD_CODE).map((payment) => carried.get(String(payment._id)) ?? 0));
  if (onlineCarried > 0 && order.advancePaymentId) {
    await OnlinePayment.updateOne(
      { ...scoped(req), _id: order.advancePaymentId },
      { $inc: { appliedInPaise: onlineCarried }, $set: { appliedToBillId: bill._id, appliedAt: nowUtc(), appliedBy: req.user.id } },
      { session },
    );
  }

  if (paid) {
    await Order.updateOne({ ...scoped(req), _id: order._id }, { $set: { status: ORDER_STATUSES.BILLED }, $inc: { version: 1 } }, { session });
  } else if (voided.status === BILL_STATUSES.ON_ACCOUNT && voided.account?.accountId) {
    // Charged to the same account for whatever is not paid.
    bill = await chargeInSession(
      req,
      { bill, account: { _id: voided.account.accountId, name: voided.account.accountName }, chargedToAccountInPaise: bill.grandTotalInPaise - bill.amountPaidInPaise },
      session,
    );
  }

  // What is left over: cash is handed back, online money refunded by the caller, anything else owed.
  let cashToGiveBackInPaise = 0;
  let onlineLeftoverInPaise = 0;
  const owed = new Map();
  for (const payment of payments) {
    const left = payment.amountInPaise - (carried.get(String(payment._id)) ?? 0);
    if (left <= 0) continue;
    if (payment.method === CASH) cashToGiveBackInPaise += left;
    else if (payment.method === ONLINE_METHOD_CODE) onlineLeftoverInPaise += left;
    else {
      const current = owed.get(payment.method) ?? { payment, amountInPaise: 0 };
      current.amountInPaise += left;
      owed.set(payment.method, current);
    }
  }

  const refundsOwed = await recordRefundsOwed(req, { owed: [...owed.values()], voided, newBill: bill, order, today }, session);
  return { newBill: bill, carriedInPaise: sumPaise(0, ...carried.values()), cashToGiveBackInPaise, refundsOwed, onlineLeftoverInPaise };
}

/** One refund owed per method. Also used when nothing is left to bill. */
export async function recordRefundsOwed(req, { owed, voided, newBill, order, today }, session) {
  const refundsOwed = [];
  for (const { payment, amountInPaise } of owed) {
    const [refund] = await Refund.create(
      [
        {
          restaurantId: req.restaurantId,
          branchId: req.branchId,
          billId: newBill?._id ?? null,
          billNumber: newBill?.billNumber ?? null,
          voidedBillId: voided._id,
          voidedBillNumber: voided.billNumber,
          orderId: order._id,
          method: payment.method,
          methodName: payment.methodName ?? payment.method,
          methodKind: payment.methodKind ?? 'IN_HAND',
          amountInPaise,
          businessDate: today,
          status: REFUND_STATUSES.OWED,
          createdBy: req.user.id,
        },
      ],
      { session },
    );
    refundsOwed.push({ id: String(refund._id), methodName: refund.methodName, amountInPaise });
  }
  return refundsOwed;
}

/** Leftovers when there is no new bill at all: every payment is left over. */
export async function leftoversWithoutBill(req, { voided, order, today }, session) {
  let cashToGiveBackInPaise = 0;
  let onlineLeftoverInPaise = 0;
  const owed = new Map();
  for (const payment of voided.payments) {
    if (payment.method === CASH) cashToGiveBackInPaise += payment.amountInPaise;
    else if (payment.method === ONLINE_METHOD_CODE) onlineLeftoverInPaise += payment.amountInPaise;
    else {
      const current = owed.get(payment.method) ?? { payment, amountInPaise: 0 };
      current.amountInPaise += payment.amountInPaise;
      owed.set(payment.method, current);
    }
  }
  const refundsOwed = await recordRefundsOwed(req, { owed: [...owed.values()], voided, newBill: null, order, today }, session);
  return { cashToGiveBackInPaise, refundsOwed, onlineLeftoverInPaise };
}

export default { carryPayments, carryRank, leftoversWithoutBill, recordRefundsOwed };
