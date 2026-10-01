/**
 * Platform payouts. M17, built in P09. docs/API-CONTRACT.md "M17 Delivery and
 * Platform Orders" section 6.
 *
 * Platforms pay in batches covering a range of business dates. A payout
 * records what arrived; what should have arrived is worked out on read from the
 * payments it covers, each at its own frozen commission. A live rate is never
 * read, so changing a commission tomorrow never moves an old payout's expected
 * figure.
 *
 * Expected payout per payment is its amount times (10000 − commissionBps)
 * basis points, through applyBasisPoints, which rounds half away from zero. The
 * batch's expected payout is the sum of those per-payment figures. A payment
 * whose commission was never set is listed under `rateNotSet` and left out;
 * nothing is estimated.
 */
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { Bill } from '../models/Bill.js';
import { PAYMENT_METHOD_KINDS } from '../models/PaymentMethod.js';
import { PlatformPayout } from '../models/PlatformPayout.js';
import {
  BusinessRuleError,
  NotFoundError,
  PaymentMethodNotAllowedError,
  PayoutPeriodOverlapError,
  ValidationError,
} from '../utils/errors.js';
import { applyBasisPoints, sumPaise } from '../utils/money.js';
import { scoped, scopedForAggregate } from '../utils/scopedQuery.js';
import { nowUtc } from '../utils/time.js';
import { withOptionalTransaction } from '../utils/transaction.js';
import { recordAudit } from './auditService.js';
import { methodByCode } from './paymentMethodService.js';

const FULL_RATE_BPS = 10_000;

/**
 * The payments one payout covers: that method's code, the payment's own
 * business date inside the period (a payment from before P08 has none and
 * reads as its bill's), on a bill that is not voided.
 */
function coveredPayments(req, payout) {
  return Bill.aggregate([
    { $match: { ...scopedForAggregate(req), isVoided: false, 'payments.method': payout.method } },
    { $unwind: '$payments' },
    { $match: { 'payments.method': payout.method } },
    {
      $addFields: {
        paymentBusinessDate: { $ifNull: ['$payments.businessDate', '$businessDate'] },
      },
    },
    { $match: { paymentBusinessDate: { $gte: payout.periodFrom, $lte: payout.periodTo } } },
    { $sort: { 'payments.receivedAt': 1 } },
    {
      $project: {
        _id: 0,
        billId: { $toString: '$_id' },
        billNumber: 1,
        paymentId: { $toString: '$payments._id' },
        businessDate: '$paymentBusinessDate',
        amountInPaise: '$payments.amountInPaise',
        commissionBps: { $ifNull: ['$payments.commissionBps', null] },
        platformOrderId: '$platform.orderId',
      },
    },
  ]);
}

/** `{ expectedInPaise, includedPaymentCount, rateNotSet }` for one payout. */
export async function expectedFor(req, payout) {
  const payments = await coveredPayments(req, payout);
  const included = payments.filter((payment) => payment.commissionBps !== null);
  const rateNotSet = payments.filter((payment) => payment.commissionBps === null);

  const expectedInPaise = sumPaise(
    0,
    ...included.map((payment) =>
      applyBasisPoints(payment.amountInPaise, FULL_RATE_BPS - payment.commissionBps),
    ),
  );

  return { expectedInPaise, includedPaymentCount: included.length, rateNotSet };
}

async function present(req, payout) {
  const { expectedInPaise, includedPaymentCount, rateNotSet } = await expectedFor(req, payout);
  return {
    ...payout.toJSON(),
    expectedInPaise,
    differenceInPaise: payout.amountReceivedInPaise - expectedInPaise,
    includedPaymentCount,
    rateNotSet,
  };
}

/** GET /platform-payouts. Newest first; `from`/`to` select payouts overlapping that range. */
export async function listPayouts(req, { method, from, to } = {}) {
  const filter = { ...scoped(req) };
  if (method) filter.method = method;
  if (from) filter.periodTo = { $gte: from };
  if (to) filter.periodFrom = { $lte: to };
  const payouts = await PlatformPayout.find(filter).sort({ periodFrom: -1, recordedAt: -1 });
  return Promise.all(payouts.map((payout) => present(req, payout)));
}

/** POST /platform-payouts. OWNER and MANAGER. */
export async function recordPayout(req, body) {
  if (body.periodFrom > body.periodTo) {
    throw new ValidationError('The period starts after it ends.', {
      periodTo: 'Must be the same day as the start, or later.',
    });
  }

  const method = await methodByCode(req, body.method);
  if (!method || !method.isActive || method.kind !== PAYMENT_METHOD_KINDS.PLATFORM) {
    throw new PaymentMethodNotAllowedError(
      `${method?.name ?? body.method} is not an active platform method, so it has no payouts.`,
    );
  }

  // P10 adds the closed-day refusal here: today's business date.

  const payout = await withOptionalTransaction(async (session) => {
    const overlapping = await PlatformPayout.findOne({
      ...scoped(req),
      method: method.code,
      isVoided: false,
      periodFrom: { $lte: body.periodTo },
      periodTo: { $gte: body.periodFrom },
    }).setOptions(session ? { session } : {});
    if (overlapping) {
      throw new PayoutPeriodOverlapError(
        `A ${method.name} payout for ${overlapping.periodFrom} to ${overlapping.periodTo} already ` +
          'covers part of that period. Void it first if it was entered wrongly.',
      );
    }

    const [created] = await PlatformPayout.create(
      [
        {
          ...scoped(req),
          method: method.code,
          methodName: method.name,
          periodFrom: body.periodFrom,
          periodTo: body.periodTo,
          amountReceivedInPaise: body.amountReceivedInPaise,
          receivedOn: body.receivedOn,
          reference: body.reference ?? null,
          note: body.note ?? null,
          recordedBy: req.user.id,
          recordedAt: nowUtc(),
        },
      ],
      session ? { session } : {},
    );

    await recordAudit(
      req,
      {
        action: AUDIT_ACTIONS.PLATFORM_PAYOUT_RECORDED,
        entityType: AUDIT_ENTITY_TYPES.PAYOUT,
        entityId: created._id,
        entityLabel: `${method.name} ${body.periodFrom} to ${body.periodTo}`,
        reason: body.reference ? `Payout ${body.reference}` : 'Payout recorded',
        amountInPaise: body.amountReceivedInPaise,
        details: { method: method.code, periodFrom: body.periodFrom, periodTo: body.periodTo },
      },
      session,
    );

    return created;
  });

  return present(req, payout);
}

/** POST /platform-payouts/:payoutId/void. OWNER. Kept, marked voided. */
export async function voidPayout(req, payoutId, { reason }) {
  const payout = await PlatformPayout.findOne({ ...scoped(req), _id: payoutId });
  if (!payout) throw new NotFoundError('Payout not found.');
  if (payout.isVoided) throw new BusinessRuleError('This payout is already voided.');

  // P10 adds the closed-day refusal here: today's business date.

  payout.isVoided = true;
  payout.voidedAt = nowUtc();
  payout.voidedBy = req.user.id;
  payout.voidReason = reason;
  await payout.save();
  return present(req, payout);
}

export default { expectedFor, listPayouts, recordPayout, voidPayout };
