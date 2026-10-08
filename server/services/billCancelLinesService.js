/**
 * Cancelling an item after the bill is made. P25 Part E, API-CONTRACT M3
 * section 16.4.
 *
 * An invoice number is a legal record and is never edited, so cancelling an
 * item on a bill is, in one transaction: void the bill, cancel the item, and
 * make a new bill for what is left, carrying the discount and the payments
 * over. Voiding already takes the old bill's payments out of the day's
 * figures, so the money stays right: cash over the new total is simply handed
 * back, and card, UPI or platform money over it becomes a refund owed.
 *
 * Every step is the existing code, run inside the one transaction: the void,
 * the line cancel (stock and the kitchen ticket included), bill creation with
 * its gap-free number, and the account charge.
 */
import mongoose from 'mongoose';

import { LINE_CANCEL_REASONS } from '../config/cancelReasons.js';
import { ROLES } from '../config/roles.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { Bill } from '../models/Bill.js';
import { OnlinePayment } from '../models/OnlinePayment.js';
import { Order, ORDER_LINE_STATUSES, ORDER_STATUSES } from '../models/Order.js';
import { Refund, REFUND_STATUSES } from '../models/Refund.js';
import { User } from '../models/User.js';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { sumPaise } from '../utils/money.js';
import { scoped } from '../utils/scopedQuery.js';
import { nowUtc } from '../utils/time.js';
import { recordAudit } from './auditService.js';
import { carryPayments, leftoversWithoutBill } from './billCarryService.js';
import { verifyPin } from './authService.js';
import { assertNotVoided } from './billPermissionService.js';
import { billCreationErrorFor, createBillInSession, readBill, voidBillInSession } from './billService.js';
import { assertDayOpen, todayBusinessDate } from './dayLockService.js';
import { cancelLineInSession } from './lineCancelService.js';
import { refund as refundOnline } from './onlinePaymentService.js';
import { applyVersionedUpdate, assertWasPreparedRule, computeLineTotalInPaise } from './orderService.js';
import { getSettings, isFeatureOn } from './settingsService.js';

const MANAGERS = Object.freeze([ROLES.OWNER, ROLES.MANAGER]);

/** Thrown inside a preview's transaction so it rolls back. Never leaves this file. */
class PreviewOnly extends Error {}
const APPROVAL_NEEDED = 'A manager has to approve this. Pick their name and type their PIN.';

/** Order reasons a line reason carries over to, when every item goes. */
const ORDER_REASON_FOR = Object.freeze({ GUEST_LEFT: 'GUEST_LEFT', PLATFORM_CANCELLED: 'PLATFORM_CANCELLED' });

/**
 * Who may, and who approved. OWNER and MANAGER approve themselves. A CASHIER,
 * or a WAITER when captains may bill, needs an OWNER or MANAGER of the same
 * restaurant to type their PIN on the same screen: checked by verifyPin, which
 * issues no session and locks after five wrong tries.
 */
export async function approverFor(req, approval, billing, { preview = false } = {}) {
  if (MANAGERS.includes(req.user.role)) return req.user.id;
  const mayAsk = req.user.role === ROLES.CASHIER || (req.user.role === ROLES.WAITER && billing.captainsMayBill);
  if (!mayAsk) throw new ForbiddenError('Only the counter can cancel an item on a bill.');
  // A preview changes nothing, so it needs no manager yet: the screen shows the numbers, then asks for the PIN.
  if (preview) return null;
  if (!approval) throw new ForbiddenError(APPROVAL_NEEDED);

  const approver = await User.findOne({
    restaurantId: req.restaurantId,
    _id: approval.approverId,
    isActive: true,
    role: { $in: MANAGERS },
  })
    .select('_id branchId')
    .lean();
  // The same answer whether the person does not exist or is not a manager.
  if (!approver) throw new ForbiddenError(APPROVAL_NEEDED);

  await verifyPin({ restaurantId: req.restaurantId, branchId: approver.branchId, userId: approver._id }, approval.pin);
  return approver._id;
}

/**
 * POST /bills/:billId/cancel-lines. Returns `{ bill, voidedBillId,
 * voidedBillNumber, orderCancelled, cashToGiveBackInPaise, refundsOwed }`.
 */
export async function cancelLinesAfterBilling(req, billId, { lines, reasonCode, note = null, approval = null, preview = false }) {
  const settings = await getSettings(req.restaurantId, { req });
  const approvedBy = await approverFor(req, approval, settings.billing, { preview });

  const existing = await readBill(req, billId);
  // A closed day answers first, before any rule about the bill.
  await assertDayOpen(req, [existing.businessDate, await todayBusinessDate(req)]);
  assertNotVoided(existing);
  if (existing.orderType === 'DELIVERY' && existing.platform?.code) {
    throw new BusinessRuleError('Platform orders change through the platform.');
  }
  const onBill = new Map(existing.lines.map((line) => [String(line.orderLineId), line]));
  const missing = lines.filter((entry) => !onBill.has(String(entry.lineId)));
  if (missing.length > 0) throw new BusinessRuleError('An item you picked is not on this bill. Open the bill again.');

  const inventoryOn = await isFeatureOn(req, 'inventory');
  const names = lines.map((entry) => onBill.get(String(entry.lineId)).itemName);
  const today = await todayBusinessDate(req);

  const session = await mongoose.startSession();
  let result;
  let previewed = null;
  try {
    await session.withTransaction(async () => {
      result = await runInSession(req, { billId, lines, reasonCode, note, names, approvedBy, inventoryOn, today }, session);
      if (preview) {
        // Read the would-be bill, then roll everything back: no number is used, nothing is written.
        const newBill = result.newBillId ? await Bill.findOne({ ...scoped(req), _id: result.newBillId }).session(session).lean() : null;
        previewed = {
          preview: true,
          voidedBillId: String(existing._id),
          voidedBillNumber: existing.billNumber,
          voidedBillTotalInPaise: existing.grandTotalInPaise,
          newBillTotalInPaise: newBill?.grandTotalInPaise ?? null,
          orderCancelled: result.orderCancelled,
          cashToGiveBackInPaise: result.cashToGiveBackInPaise,
          refundsOwed: result.refundsOwed.map(({ methodName, amountInPaise }) => ({ methodName, amountInPaise })),
          onlineRefundInPaise: result.onlineLeftoverInPaise,
        };
        throw new PreviewOnly();
      }
    });
  } catch (error) {
    if (error instanceof PreviewOnly) return previewed;
    throw await billCreationErrorFor(req, existing.orderId, error);
  } finally {
    await session.endSession();
  }

  // P24. Money paid online and not needed any more goes back through Razorpay,
  // after the transaction, because the gateway is not part of it.
  if (result.onlineLeftoverInPaise > 0 && result.onlinePaymentId) {
    const payment = await OnlinePayment.findOne({ ...scoped(req), _id: result.onlinePaymentId });
    if (payment) await refundOnline(req, payment, { amountInPaise: result.onlineLeftoverInPaise, reason: 'An item was cancelled after billing' });
  }

  const bill = result.newBillId ? await readBill(req, result.newBillId) : null;
  return {
    bill,
    voidedBillId: String(existing._id),
    voidedBillNumber: existing.billNumber,
    orderCancelled: result.orderCancelled,
    cashToGiveBackInPaise: result.cashToGiveBackInPaise,
    refundsOwed: result.refundsOwed,
  };
}

async function runInSession(req, { billId, lines, reasonCode, note, names, approvedBy, inventoryOn, today }, session) {
  // 1. Void, with the reason that says why.
  const voided = await voidBillInSession(
    req,
    billId,
    { reasonCode: 'ITEMS_CHANGED', note: `Items cancelled after billing: ${names.join(', ')}`.slice(0, 500) },
    session,
  );

  // 2. Cancel the chosen lines, exactly as before billing.
  let order = await Order.findOne({ ...scoped(req), _id: voided.orderId }).session(session);
  if (!order) throw new NotFoundError('Order not found.');
  let cancelledValueInPaise = 0;
  for (const entry of lines) {
    const line = order.lines.id(entry.lineId);
    if (!line || line.status === ORDER_LINE_STATUSES.CANCELLED) {
      throw new BusinessRuleError('An item you picked is not on this bill. Open the bill again.');
    }
    assertWasPreparedRule(line.status, entry.wasPrepared);
    cancelledValueInPaise += computeLineTotalInPaise(line);
    order = await cancelLineInSession(
      req,
      { order, line, version: order.version, reasonCode, note, wasPrepared: entry.wasPrepared, inventoryOn },
      session,
    );
  }

  const live = order.lines.filter((line) => line.status !== ORDER_LINE_STATUSES.CANCELLED);

  let newBill = null;
  let orderCancelled = false;
  let leftovers;

  if (live.length > 0) {
    // 3 and 4. A new bill, numbered now, with the old discount carried over.
    newBill = await createBillInSession(
      req,
      { orderId: order._id, version: order.version, discount: voided.discount ?? null },
      session,
    );
    // 5 to 7. The payments carried, the order billed or the account charged, the rest left over.
    leftovers = await carryPayments(req, { voided, newBill, order, today }, session);
    newBill = leftovers.newBill;
  } else {
    // 8. Nothing left: the order goes, with the reason carried over.
    const orderReason = ORDER_REASON_FOR[reasonCode] ?? 'OTHER';
    const cancelledAt = nowUtc();
    await applyVersionedUpdate(req, {
      orderId: order._id,
      version: order.version,
      update: {
        $set: {
          status: ORDER_STATUSES.CANCELLED,
          isCancelled: true,
          cancelledAt,
          cancelledBy: req.user.id,
          cancelReasonCode: orderReason,
          cancelReason: orderReason === 'OTHER' ? 'Every item cancelled after billing' : note ?? null,
        },
      },
      session,
    });
    await recordAudit(
      req,
      {
        action: AUDIT_ACTIONS.ORDER_CANCELLED,
        entityType: AUDIT_ENTITY_TYPES.ORDER,
        entityId: order._id,
        entityLabel: `Order ${order.orderNumber}`,
        reason: 'Every item cancelled after billing',
        amountInPaise: cancelledValueInPaise,
        details: { orderNumber: order.orderNumber, tableName: order.tableName ?? null, lineCount: lines.length, reasonCode: orderReason },
      },
      session,
    );
    orderCancelled = true;
    // 6. Nothing is carried, so every payment is left over.
    leftovers = await leftoversWithoutBill(req, { voided, order, today }, session);
  }
  const { cashToGiveBackInPaise, refundsOwed, onlineLeftoverInPaise } = leftovers;

  // 9. One audit line, on the voided bill. OWNER only to read.
  await recordAudit(
    req,
    {
      action: AUDIT_ACTIONS.BILL_LINES_CANCELLED_AFTER_BILLING,
      entityType: AUDIT_ENTITY_TYPES.BILL,
      entityId: voided._id,
      entityLabel: voided.billNumber,
      reason: `Items cancelled after billing: ${names.join(', ')}`.slice(0, 500),
      amountInPaise: voided.grandTotalInPaise - (newBill?.grandTotalInPaise ?? 0),
      details: {
        voidedBillNumber: voided.billNumber,
        newBillId: newBill ? String(newBill._id) : null,
        newBillNumber: newBill?.billNumber ?? null,
        lineIds: lines.map((entry) => String(entry.lineId)),
        reasonCode,
        reasonLabel: LINE_CANCEL_REASONS.find((reason) => reason.code === reasonCode)?.label ?? reasonCode,
        approvedBy: String(approvedBy),
        cashToGiveBackInPaise,
        refundsOwedInPaise: sumPaise(0, ...refundsOwed.map((refund) => refund.amountInPaise)),
      },
    },
    session,
  );

  return {
    newBillId: newBill?._id ?? null,
    orderCancelled,
    cashToGiveBackInPaise,
    refundsOwed,
    onlineLeftoverInPaise,
    onlinePaymentId: order.advancePaymentId ?? null,
  };
}

/** GET /refunds. Newest first, paged. */
export async function listRefunds(req, { status = null, from = null, to = null, page = 1, limit = 50 }) {
  const filter = { ...scoped(req) };
  if (status) filter.status = status;
  if (from || to) filter.businessDate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const [rows, total] = await Promise.all([
    Refund.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Refund.countDocuments(filter),
  ]);
  return { rows, total, page, limit };
}

/** POST /refunds/:refundId/done. The money went back on the machine or by UPI; this records it. */
export async function markRefundDone(req, refundId, { reference }) {
  const refund = await Refund.findOne({ ...scoped(req), _id: refundId });
  if (!refund) throw new NotFoundError('Refund not found.');
  if (refund.status === REFUND_STATUSES.REFUNDED) throw new BusinessRuleError('This refund is already recorded as done.');

  refund.status = REFUND_STATUSES.REFUNDED;
  refund.refundedAt = nowUtc();
  refund.refundedBy = req.user.id;
  refund.reference = reference;
  await refund.save();

  await recordAudit(req, {
    action: AUDIT_ACTIONS.REFUND_RECORDED,
    entityType: AUDIT_ENTITY_TYPES.BILL,
    entityId: refund.billId ?? refund.voidedBillId,
    entityLabel: refund.billNumber ?? refund.voidedBillNumber,
    reason: `Refunded ${refund.methodName}: ${reference}`,
    amountInPaise: refund.amountInPaise,
    details: { refundId: String(refund._id), method: refund.method, reference },
  });
  return refund;
}

export default { cancelLinesAfterBilling, listRefunds, markRefundDone };
