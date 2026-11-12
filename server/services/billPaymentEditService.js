/**
 * P66. Part payment across methods, changing a paid bill's payments, and
 * changing a bill's discount or GST after it was made. API-CONTRACT "P66".
 *
 * Nothing here does arithmetic of its own. A part payment is every row through
 * recordPayment, in one transaction. A changed discount or GST is the P25 Part
 * E path: void, bill again with the code that made the bill, carry the
 * payments. Changing payments only swaps how the money already on the bill was
 * received; the amount never moves, so the bill's totals and status never do.
 */
import mongoose from 'mongoose';

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { OnlinePayment } from '../models/OnlinePayment.js';
import { Order } from '../models/Order.js';
import { PlatformPayout } from '../models/PlatformPayout.js';
import { BusinessRuleError, NotFoundError, PaymentMethodNotAllowedError, TerminalRequiredError } from '../utils/errors.js';
import { paiseToRupees, sumPaise } from '../utils/money.js';
import { scoped } from '../utils/scopedQuery.js';
import { nowUtc } from '../utils/time.js';
import { recordAudit } from './auditService.js';
import { carryPayments } from './billCarryService.js';
import { assertNotVoided } from './billPermissionService.js';
import { billCreationErrorFor, createBillInSession, readBill, recordPayment, voidBillInSession } from './billService.js';
import { assertDayOpen, todayBusinessDate } from './dayLockService.js';
import { refund as refundOnline } from './onlinePaymentService.js';
import { ONLINE_METHOD_CODE } from './paymentGatewayService.js';
import { frozenMethodFields, methodForBill } from './paymentMethodService.js';
import { getSetting } from './settingsService.js';

/** Thrown inside a preview's transaction so it rolls back. Never leaves this file. */
class PreviewOnly extends Error {}

const OTHER_METHOD_CODE = 'OTHER';

/**
 * POST /bills/:billId/payments/split. Every row is recorded by recordPayment's
 * own rules, in order, inside one transaction, so a refused row records
 * nothing at all.
 */
export async function splitPayment(req, billId, { payments }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const row of payments) {
        await recordPayment(req, billId, { method: row.method, amountInPaise: row.amountInPaise, reference: row.reference ?? null }, { session });
      }
    });
  } catch (error) {
    throw await billCreationErrorFor(req, null, error);
  } finally {
    await session.endSession();
  }
  return readBill(req, billId);
}

/** A payment as kept in paymentChanges. */
const changedShape = (payment) => ({
  method: payment.method,
  methodName: payment.methodName ?? payment.method,
  amountInPaise: payment.amountInPaise,
  reference: payment.reference ?? null,
});

/** A live platform payout for this method whose period covers the day. */
function payoutCovers(req, method, businessDate) {
  return PlatformPayout.exists({
    ...scoped(req),
    method,
    isVoided: false,
    periodFrom: { $lte: businessDate },
    periodTo: { $gte: businessDate },
  });
}

/**
 * POST /bills/:billId/payments/change. OWNER and MANAGER. The new rows replace
 * the bill's payments and add up exactly to what was paid.
 */
export async function changePayments(req, billId, { payments: rows, reason }) {
  const bill = await readBill(req, billId);
  assertNotVoided(bill);
  if (bill.payments.length === 0) throw new BusinessRuleError('This bill has no payments to change.');

  const dates = new Set(bill.payments.map((payment) => payment.businessDate ?? bill.businessDate));
  if (dates.size > 1) {
    throw new BusinessRuleError('These payments were received on different days. Change each one with Change payment method.');
  }
  const paymentDate = [...dates][0];
  // A closed day answers first, before any rule about the payments.
  await assertDayOpen(req, [bill.businessDate, paymentDate, await todayBusinessDate(req)]);

  for (const payment of bill.payments) {
    if (payment.terminal) throw new BusinessRuleError('A payment taken on the card machine cannot be changed here.');
    if (payment.method === ONLINE_METHOD_CODE) throw new BusinessRuleError('Money paid online cannot be changed here.');
  }

  const total = sumPaise(...rows.map((row) => row.amountInPaise));
  if (total !== bill.amountPaidInPaise) {
    throw new BusinessRuleError(`The payments must add up to what was paid, ₹${paiseToRupees(bill.amountPaidInPaise)}.`);
  }

  const required = await getSetting(req.restaurantId, 'payments.requireTerminalForLinkedMethods', { req });
  const methods = [];
  for (const row of rows) {
    if (row.method === ONLINE_METHOD_CODE) {
      throw new PaymentMethodNotAllowedError('Paid online is added with Apply advance, not chosen by hand.');
    }
    const method = await methodForBill(req, bill, row.method);
    if (method.code === OTHER_METHOD_CODE && !row.reference?.trim()) {
      throw new BusinessRuleError('Say how it was paid, for example Cheque.');
    }
    if (method.terminalProvider && required) throw new TerminalRequiredError();
    methods.push(method);
  }

  // Platform money a payout already settled stays as it was, or the payout stops adding up.
  const platformCodes = new Set([
    ...bill.payments.filter((payment) => payment.methodKind === 'PLATFORM').map((payment) => payment.method),
    ...methods.filter((method) => method.kind === 'PLATFORM').map((method) => method.code),
  ]);
  for (const code of platformCodes) {
    if (await payoutCovers(req, code, paymentDate)) {
      throw new BusinessRuleError('A platform payout already covers this day for that method. Void the payout first.');
    }
  }

  const first = [...bill.payments].sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt))[0];
  const before = bill.payments.map(changedShape);
  bill.payments = rows.map((row, index) => ({
    ...frozenMethodFields(methods[index]),
    businessDate: paymentDate,
    amountInPaise: row.amountInPaise,
    reference: row.reference?.trim() || null,
    receivedBy: first.receivedBy,
    receivedAt: first.receivedAt,
  }));
  const after = bill.payments.map(changedShape);
  bill.paymentChanges.push({ at: nowUtc(), by: req.user.id, reason, before, after });
  await bill.save();

  await recordAudit(req, {
    action: AUDIT_ACTIONS.PAYMENTS_CHANGED,
    entityType: AUDIT_ENTITY_TYPES.BILL,
    entityId: bill._id,
    entityLabel: bill.billNumber,
    reason,
    amountInPaise: total,
    details: {
      before: before.map(({ method, amountInPaise }) => ({ method, amountInPaise })),
      after: after.map(({ method, amountInPaise }) => ({ method, amountInPaise })),
    },
  });

  return bill;
}

/** The discount as the audit line names it. */
const discountWords = (discount) =>
  discount ? { kind: discount.kind, rateBps: discount.rateBps ?? null, amountInPaise: discount.amountInPaise ?? null, reasonCode: discount.reasonCode ?? null } : null;

/**
 * POST /bills/:billId/reprice. OWNER and MANAGER. `discount`: a discount,
 * null to take it off, undefined to keep it. `pricesIncludeGst`: undefined to
 * keep it. Void, bill again, carry the payments, in one transaction.
 */
export async function repriceBill(req, billId, { discount, pricesIncludeGst, reason, preview = false }) {
  const existing = await readBill(req, billId);
  await assertDayOpen(req, [existing.businessDate, await todayBusinessDate(req)]);
  assertNotVoided(existing);
  if (existing.orderType === 'DELIVERY' && existing.platform?.code) {
    throw new BusinessRuleError('Platform orders change through the platform.');
  }
  if (discount === undefined && pricesIncludeGst === undefined) {
    throw new BusinessRuleError('Choose a discount or the GST setting to change.');
  }

  const today = await todayBusinessDate(req);
  const session = await mongoose.startSession();
  let result;
  let previewed = null;
  try {
    await session.withTransaction(async () => {
      previewed = null;
      const voided = await voidBillInSession(
        req,
        billId,
        { reasonCode: 'DISCOUNT_CHANGED', note: `Discount or GST changed after billing: ${reason}`.slice(0, 500), toChangeItems: true },
        session,
      );
      if (pricesIncludeGst !== undefined) {
        await Order.updateOne({ ...scoped(req), _id: voided.orderId }, { $set: { pricesIncludeGst } }, { session });
      }
      const order = await Order.findOne({ ...scoped(req), _id: voided.orderId }).session(session);
      if (!order) throw new NotFoundError('Order not found.');

      let newBill = await createBillInSession(
        req,
        {
          orderId: order._id,
          version: order.version,
          discount: discount === undefined ? (voided.discount ?? null) : null,
          requested: discount ?? null,
        },
        session,
      );
      const leftovers = await carryPayments(req, { voided, newBill, order, today }, session);
      newBill = leftovers.newBill;

      if (preview) {
        previewed = {
          preview: true,
          voidedBillTotalInPaise: voided.grandTotalInPaise,
          newBillTotalInPaise: newBill.grandTotalInPaise,
          newBillTaxInPaise: newBill.totalTaxInPaise,
          cashToGiveBackInPaise: leftovers.cashToGiveBackInPaise,
          refundsOwed: leftovers.refundsOwed.map(({ methodName, amountInPaise }) => ({ methodName, amountInPaise })),
          onlineRefundInPaise: leftovers.onlineLeftoverInPaise,
        };
        throw new PreviewOnly();
      }

      await recordAudit(
        req,
        {
          action: AUDIT_ACTIONS.BILL_REPRICED,
          entityType: AUDIT_ENTITY_TYPES.BILL,
          entityId: voided._id,
          entityLabel: voided.billNumber,
          reason,
          amountInPaise: voided.grandTotalInPaise - newBill.grandTotalInPaise,
          details: {
            voidedBillNumber: voided.billNumber,
            newBillId: String(newBill._id),
            newBillNumber: newBill.billNumber,
            discountBefore: discountWords(voided.discount),
            discountAfter: discountWords(newBill.discount),
            pricesIncludeGstBefore: voided.pricesIncludeGst === true,
            pricesIncludeGstAfter: newBill.pricesIncludeGst === true,
            cashToGiveBackInPaise: leftovers.cashToGiveBackInPaise,
          },
        },
        session,
      );

      result = {
        newBillId: newBill._id,
        voided,
        cashToGiveBackInPaise: leftovers.cashToGiveBackInPaise,
        refundsOwed: leftovers.refundsOwed,
        onlineLeftoverInPaise: leftovers.onlineLeftoverInPaise,
        onlinePaymentId: order.advancePaymentId ?? null,
      };
    });
  } catch (error) {
    if (error instanceof PreviewOnly) return previewed;
    throw await billCreationErrorFor(req, existing.orderId, error);
  } finally {
    await session.endSession();
  }

  // P24. Money paid online and not needed any more goes back through Razorpay, after the transaction.
  if (result.onlineLeftoverInPaise > 0 && result.onlinePaymentId) {
    const payment = await OnlinePayment.findOne({ ...scoped(req), _id: result.onlinePaymentId });
    if (payment) await refundOnline(req, payment, { amountInPaise: result.onlineLeftoverInPaise, reason: 'The bill was changed to less than was paid' });
  }

  return {
    bill: await readBill(req, result.newBillId),
    voidedBillId: String(existing._id),
    voidedBillNumber: existing.billNumber,
    cashToGiveBackInPaise: result.cashToGiveBackInPaise,
    refundsOwed: result.refundsOwed,
  };
}

export default { changePayments, repriceBill, splitPayment };
