/**
 * Turning a finished order into a bill, and everything that happens to a bill
 * afterwards.
 *
 * Every business rule in M3 is either here or in billPermissionService.js.
 * Controllers read the request, call one of these, and send the answer.
 *
 * Three properties this file exists to hold:
 *
 * 1. A bill copies from the ORDER LINE, never from `menuitems`. The order line
 *    already copied name, price and tax rate when it was added. This file does
 *    not import the MenuItem model and must not start: the 7pm order bills at
 *    the 7pm price because the price travelled with the line, not because
 *    anything here looks it up.
 *
 * 2. Every figure comes from utils/tax.js. There is no arithmetic in this file
 *    beyond adding up payments, because two places that both work out a total
 *    eventually disagree by a rupee.
 *
 * 3. Creating a bill runs in a real transaction or not at all. The bill number
 *    is reserved inside it, so a failed insert burns no number.
 */
import mongoose from 'mongoose';

import { BILL_VOID_REASONS, reasonText } from '../config/cancelReasons.js';
import { DISCOUNT_REASONS } from '../config/discountReasons.js';
import { Bill, BILL_STATUSES } from '../models/Bill.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { Order, ORDER_LINE_STATUSES, ORDER_STATUSES } from '../models/Order.js';
import { User } from '../models/User.js';
import { reverseChargeForVoid } from './accountService.js';
import { recordAudit } from './auditService.js';
import { reserveBillNumber } from './billNumberService.js';
import { frozenMethodFields, methodForBill } from './paymentMethodService.js';
import { getSetting, getSettings } from './settingsService.js';
import {
  assertBillHasLines,
  assertDiscountFits,
  assertNotPaid,
  assertNotVoided,
  assertOrderIsBillable,
  assertPaymentFits,
} from './billPermissionService.js';
import { applyVersionedUpdate, computeLineTotalInPaise } from './orderService.js';
import {
  BillAlreadyExistsError,
  BusinessRuleError,
  NotFoundError,
  TransactionRequiredError,
} from '../utils/errors.js';
import { sumPaise } from '../utils/money.js';
import { scoped } from '../utils/scopedQuery.js';
import { allocateLineShares, computeBillTotals, resolveDiscountAmount } from '../utils/tax.js';
import { businessDateFor, nowUtc } from '../utils/time.js';
import { withOptionalTransaction } from '../utils/transaction.js';

/** Mongo's duplicate key error. */
const DUPLICATE_KEY = 11000;

/**
 * Turns one order line into a bill line.
 *
 * `unitPriceInPaise` here is the per-unit price INCLUDING add-ons, which is
 * what was actually charged for one of these. The order stores the dish price
 * and the add-on prices separately and derives the line total; a bill freezes
 * the number that was printed, because it must still print the same in a year.
 */
function toBillLine(line) {
  const lineTotalInPaise = computeLineTotalInPaise(line);

  /**
   * Built up from the parts rather than by dividing the line total by the
   * quantity. The division is exact today, but only because of how
   * computeLineTotalInPaise happens to be written, and a bill is the wrong
   * place to depend on that holding.
   */
  const unitPriceInPaise = sumPaise(
    line.unitPriceInPaise,
    ...(line.addOns ?? []).map((addOn) => addOn.priceInPaise),
  );

  return {
    orderLineId: line._id,
    menuItemId: line.menuItemId,
    itemName: line.itemName,
    variantName: line.variantName ?? null,
    addOnNames: (line.addOns ?? []).map((addOn) => addOn.name),
    quantity: line.quantity,
    unitPriceInPaise,
    taxRateBps: line.taxRateBps,
    lineTotalInPaise,
    // P03. Frozen on the order line when it was added; null on older orders.
    categoryId: line.categoryId ?? null,
    categoryName: line.categoryName ?? null,
  };
}

/**
 * Writes the computed figures onto a bill, and each line's share of them.
 * Never partially applied.
 *
 * `bill` is a Bill document or the plain object about to become one, and
 * `lines` are its lines in the same shape. Creating a bill and discounting one
 * both come through here, so the line shares are written by one piece of code
 * and can never drift from the totals beside them. allocateLineShares checks
 * C2 itself and throws before anything is saved if the shares do not balance.
 */
function applyTotals(bill, lines, totals) {
  const shares = allocateLineShares(lines, totals);
  lines.forEach((line, index) => {
    line.discountShareInPaise = shares[index].discountShareInPaise;
    line.taxableInPaise = shares[index].taxableInPaise;
    line.taxInPaise = shares[index].taxInPaise;
  });

  bill.subtotalInPaise = totals.subtotalInPaise;
  bill.taxBreakdown = totals.taxBreakdown;
  bill.totalTaxInPaise = totals.totalTaxInPaise;
  bill.roundOffInPaise = totals.roundOffInPaise;
  bill.grandTotalInPaise = totals.grandTotalInPaise;
}

/**
 * The captain's name as it is right now, frozen onto the bill. P03.
 * "Unknown" rather than a failed bill if the user record cannot be found.
 */
async function captainNameFor(req, userId, session) {
  if (!userId) return 'Unknown';
  const user = await User.findOne({ ...scopedToRestaurant(req), _id: userId })
    .select('name')
    .session(session);
  return user?.name ?? 'Unknown';
}

/** The restaurant filter alone: a captain may have been created on another branch. */
function scopedToRestaurant(req) {
  return { restaurantId: req.restaurantId };
}

/**
 * Creates the bill for an order.
 *
 * Runs in a real transaction, always. Unlike every other write in this project
 * it does not fall back to running plainly, because the bill number's
 * gap-freedom is exactly the guarantee a transaction provides and there is no
 * degraded version of it worth shipping. See utils/errors.js
 * TransactionRequiredError.
 */
export async function createBill(req, { orderId, version }) {
  const session = await mongoose.startSession();

  try {
    let created = null;

    await session.withTransaction(async () => {
      const order = await Order.findOne({ ...scoped(req), _id: orderId }).session(session);
      if (!order) throw new NotFoundError('Order not found.');

      assertOrderIsBillable(order);

      const lines = order.lines
        .filter((line) => line.status !== ORDER_LINE_STATUSES.CANCELLED)
        .map(toBillLine);

      assertBillHasLines(lines);

      const at = nowUtc();
      const totals = computeBillTotals({ lines, discount: null });
      /**
       * Read inside the transaction, so the bill is numbered from the invoice
       * series as it is at this moment. Through settingsService, the one place
       * any module reads configuration from.
       */
      const settings = await getSettings(req.restaurantId, { session });
      const startMinutes = settings.business.businessDayStartsAtMinutes;
      const numbering = await reserveBillNumber(
        { restaurantId: req.restaurantId, branchId: req.branchId, at, invoice: settings.invoice },
        session,
      );

      const captainName = await captainNameFor(req, order.openedBy, session);

      const draft = {
        restaurantId: req.restaurantId,
        branchId: req.branchId,
        ...numbering,
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        tableName: order.tableName ?? null,
        // P06. Copied from the order, so a report groups delivery bills by
        // platform and knows which were billed at 0% for the platform.
        platform: order.platform ?? null,
        taxTreatment: order.taxTreatment ?? 'NORMAL',
        businessDate: businessDateFor(at, startMinutes),
        status: BILL_STATUSES.UNPAID,
        lines,
        discount: null,
        payments: [],
        amountPaidInPaise: 0,
        billedBy: req.user.id,
        billedAt: at,
        // P03. Frozen from the order, so captain and covers reports never join back to it.
        captainId: order.openedBy ?? null,
        captainName,
        guestCount: order.guestCount ?? null,
        orderOpenedAt: order.openedAt ?? null,
      };
      applyTotals(draft, lines, totals);

      const [bill] = await Bill.create([draft], { session });

      /**
       * The order keeps its status. It moves to BILLED when the bill is PAID,
       * not when it is created, because M2 decided BILLED frees the table and
       * the customers are still sitting there until they have paid.
       */
      await applyVersionedUpdate(req, {
        orderId: order._id,
        version,
        update: { $set: { billId: bill._id } },
        session,
      });

      created = bill;
    });

    return created;
  } catch (error) {
    if (error?.code === DUPLICATE_KEY) {
      // The partial unique index on { restaurantId, orderId } caught a second
      // live bill. Hand back the one that exists so the client opens it.
      const existing = await Bill.findOne({ ...scoped(req), orderId, isVoided: false })
        .select('_id')
        .lean();
      throw new BillAlreadyExistsError(existing?._id);
    }
    if (isTransactionUnavailable(error)) throw new TransactionRequiredError();
    throw error;
  } finally {
    await session.endSession();
  }
}

/** A standalone mongod cannot start a transaction, and billing needs one. */
function isTransactionUnavailable(error) {
  const message = String(error?.message ?? '');
  return (
    error?.code === 20 ||
    /Transaction numbers are only allowed on a replica set/i.test(message) ||
    /does not support (?:sessions|transactions)/i.test(message) ||
    /Transactions are not supported/i.test(message)
  );
}

/** Reads one bill, scoped. 404 for another restaurant's, never 403. */
export async function readBill(req, billId, session = null) {
  const bill = await Bill.findOne({ ...scoped(req), _id: billId }).setOptions(
    session ? { session } : {},
  );
  if (!bill) throw new NotFoundError('Bill not found.');
  return bill;
}

/**
 * Applies a bill-level discount and recomputes everything.
 *
 * Replaces any existing discount rather than stacking: two discounts on one
 * bill is a conversation about which was authorised, and the audit trail
 * records each application either way.
 */
export async function applyDiscount(
  req,
  billId,
  { kind, valueInPaise, rateBps, reasonCode, note = null, fundedBy = 'RESTAURANT' },
) {
  const bill = await readBill(req, billId);

  assertNotVoided(bill);
  assertNotPaid(bill, 'discounted');

  const request = { kind, valueInPaise: valueInPaise ?? null, rateBps: rateBps ?? null };
  const amountInPaise = resolveDiscountAmount(request, bill.subtotalInPaise);
  assertDiscountFits(amountInPaise, bill.subtotalInPaise);

  const totals = computeBillTotals({ lines: bill.lines, discount: request });

  // P08: a fixed code, the optional note in `reason`, and who paid for it.
  bill.discount = {
    ...request,
    amountInPaise,
    reason: note ?? null,
    reasonCode,
    fundedBy,
    appliedBy: req.user.id,
    appliedAt: nowUtc(),
  };
  applyTotals(bill, bill.lines, totals);
  await bill.save();

  await recordAudit(req, {
    action: AUDIT_ACTIONS.DISCOUNT_APPLIED,
    entityType: AUDIT_ENTITY_TYPES.BILL,
    entityId: bill._id,
    entityLabel: bill.billNumber,
    reason: reasonText(DISCOUNT_REASONS, reasonCode, note),
    amountInPaise,
    details: { kind, rateBps: rateBps ?? null, reasonCode, fundedBy },
  });

  return bill;
}

/**
 * Records a payment.
 *
 * When the payments reach the grand total the bill becomes PAID, the order
 * moves to BILLED, and the table frees. That is the moment the customer has
 * finished, which is why it is here and not at bill creation.
 */
export async function recordPayment(req, billId, { method, amountInPaise, reference }) {
  const bill = await readBill(req, billId);

  assertNotVoided(bill);
  assertPaymentFits(bill, amountInPaise);

  // P08: the four method rules, then freeze the method onto the payment.
  // P10 adds the closed-day refusal here: the bill's business date and today's.
  const paymentMethod = await methodForBill(req, bill, method);
  const startMinutes = await getSetting(req.restaurantId, 'business.businessDayStartsAtMinutes', {
    req,
  });

  const at = nowUtc();
  bill.payments.push({
    ...frozenMethodFields(paymentMethod),
    businessDate: businessDateFor(at, startMinutes),
    amountInPaise,
    reference: reference ?? null,
    receivedBy: req.user.id,
    receivedAt: at,
  });
  bill.amountPaidInPaise = sumPaise(...bill.payments.map((payment) => payment.amountInPaise));

  const settled = bill.amountPaidInPaise >= bill.grandTotalInPaise;
  if (settled) {
    bill.status = BILL_STATUSES.PAID;
    bill.paidAt = at;
  }

  await bill.save();

  if (settled) {
    /**
     * Not applyVersionedUpdate: the cashier has no order version in hand here,
     * and the order is not being raced for. It is still a scoped, targeted
     * write, and the pre hook on the Order schema keeps occupiesTable in step
     * with the status so the table frees.
     */
    await Order.updateOne(
      { ...scoped(req), _id: bill.orderId },
      { $set: { status: ORDER_STATUSES.BILLED }, $inc: { version: 1 } },
    );
  }

  return bill;
}

/**
 * Changes how one payment was made. P08.
 *
 * Only the method moves, never the amount: to change an amount, void and bill
 * again. The new method must pass every rule a new payment would. The payment
 * keeps its business date, because the money arrived when it arrived; only
 * the frozen method fields are replaced, and the history records the change.
 */
export async function correctPayment(req, billId, paymentId, { method, reason }) {
  const bill = await readBill(req, billId);
  assertNotVoided(bill);

  const payment = bill.payments.id(paymentId);
  if (!payment) throw new NotFoundError('Payment not found on this bill.');

  // P10 adds the closed-day refusal here: the payment's business date and the bill's.

  if (payment.method === method) {
    throw new BusinessRuleError('That payment was already made by that method.');
  }
  const paymentMethod = await methodForBill(req, bill, method);

  const fromMethod = payment.method;
  const at = nowUtc();
  Object.assign(payment, frozenMethodFields(paymentMethod));
  payment.corrections.push({ fromMethod, toMethod: paymentMethod.code, by: req.user.id, at, reason });
  await bill.save();

  await recordAudit(req, {
    action: AUDIT_ACTIONS.PAYMENT_METHOD_CORRECTED,
    entityType: AUDIT_ENTITY_TYPES.BILL,
    entityId: bill._id,
    entityLabel: bill.billNumber,
    reason,
    amountInPaise: payment.amountInPaise,
    details: { paymentId: String(payment._id), fromMethod, toMethod: paymentMethod.code },
  });

  return bill;
}

/**
 * Voids a bill.
 *
 * Returns the order to READY_TO_BILL and re-occupies the table, so it can be
 * billed again correctly. The bill number stays spent: it is never reissued,
 * not to the replacement and not to anything else.
 *
 * Voiding never restocks. The food was made and eaten, and an automatic
 * restock on void turns a dishonest void into free inventory. If it genuinely
 * was not consumed, a storekeeper writes a visible manual adjustment.
 */
export async function voidBill(req, billId, { reasonCode, note = null }) {
  const existing = await readBill(req, billId);
  assertNotVoided(existing);

  // P10 adds the closed-day refusal here: the bill's business date.

  const at = nowUtc();

  /**
   * P09: one transaction, because voiding a bill charged to an On Hold
   * account also takes the charge off the account's ledger, and the two must
   * land together or not at all.
   */
  return withOptionalTransaction(async (session) => {
    const bill = await readBill(req, billId, session);
    assertNotVoided(bill);

    bill.isVoided = true;
    bill.voidedAt = at;
    bill.voidedBy = req.user.id;
    // P04: a fixed code, and the free-text field now holds the optional note.
    bill.voidReasonCode = reasonCode;
    bill.voidReason = note ?? null;
    await bill.save(session ? { session } : {});

    await Order.updateOne(
      { ...scoped(req), _id: bill.orderId },
      { $set: { status: ORDER_STATUSES.READY_TO_BILL, billId: null }, $inc: { version: 1 } },
      session ? { session } : {},
    );

    await reverseChargeForVoid(req, bill, { session });

    await recordAudit(
      req,
      {
        action: AUDIT_ACTIONS.BILL_VOIDED,
        entityType: AUDIT_ENTITY_TYPES.BILL,
        entityId: bill._id,
        entityLabel: bill.billNumber,
        reason: reasonText(BILL_VOID_REASONS, reasonCode, note),
        amountInPaise: bill.grandTotalInPaise,
        details: {
          wasPaid: bill.amountPaidInPaise > 0,
          wasOnAccount: bill.status === BILL_STATUSES.ON_ACCOUNT,
          reasonCode,
        },
      },
      session,
    );

    return bill;
  });
}

export default {
  applyDiscount,
  correctPayment,
  createBill,
  readBill,
  recordPayment,
  voidBill,
};
