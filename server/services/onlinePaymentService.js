/**
 * Advance payment for online takeaway and booking deposits. P24,
 * API-CONTRACT M14 section 4.
 *
 * The rules this file keeps:
 *   1. A payment counts only after Razorpay itself says the link is paid, for
 *      the exact amount. A signature alone, or anything the browser says, is
 *      never enough.
 *   2. Money that arrived is always accounted for: applied to a bill,
 *      refunded, or forfeited. A failed refund is visible and retryable.
 *   3. Confirming is idempotent. The return, the webhook and the read-back can
 *      all arrive, in any order, and the request moves once.
 */
import { config } from '../config/env.js';
import { OnlineOrder, ONLINE_ORDER_STATUSES } from '../models/OnlineOrder.js';
import { OnlinePayment, ONLINE_PAYMENT_KINDS, ONLINE_PAYMENT_STATUSES, REFUND_STATUSES } from '../models/OnlinePayment.js';
import { Reservation, RESERVATION_STATUSES } from '../models/Reservation.js';
import { PaymentGatewayError, PaymentGatewayNotConnectedError } from '../utils/errors.js';
import { sumPaise } from '../utils/money.js';
import { scoped } from '../utils/scopedQuery.js';
import { nowUtc } from '../utils/time.js';
import { canTakePayments, keysFor } from './paymentGatewayService.js';
import {
  callbackSignatureMatches,
  createPaymentLink,
  fetchPaymentLink,
  refundPayment,
  webhookSignatureMatches,
} from './razorpayClient.js';

const MINUTE_MS = 60_000;
/** A read-back asks Razorpay at most this often per payment. */
const READ_BACK_FLOOR_MS = 10_000;
/** How many overdue requests one inbox read sweeps. */
const SWEEP_BATCH = 10;

const { CREATED, PAID, EXPIRED, FAILED, REFUNDED, PARTLY_REFUNDED, REFUND_FAILED, FORFEITED } = ONLINE_PAYMENT_STATUSES;

/* ------------------------------------------------------------------------- *
 * When payment applies
 * ------------------------------------------------------------------------- */

/** The amount a takeaway must pay now, or 0 when the page takes no payment. */
export async function takeawayAdvanceFor(req, online, estimate) {
  if (!online.takeawayPrepay) return 0;
  if (!(await canTakePayments(req.restaurantId))) return 0;
  return estimate.billTotalInPaise;
}

/** A booking's deposit: people × the amount per person, or 0. */
export async function depositFor(req, online, partySize) {
  if (!online.depositPerPersonInPaise) return 0;
  if (!(await canTakePayments(req.restaurantId))) return 0;
  return online.depositPerPersonInPaise * partySize;
}

/* ------------------------------------------------------------------------- *
 * Starting a payment
 * ------------------------------------------------------------------------- */

/**
 * Creates the payment record and its Razorpay link. A gateway failure marks
 * the payment FAILED and the request PAYMENT_FAILED, then throws the 502.
 */
export async function startPayment(req, { kind, request, amountInPaise, online, slug, customer, description }) {
  const keys = await keysFor(req.restaurantId);
  if (!keys) throw new PaymentGatewayNotConnectedError();

  const now = nowUtc();
  const expiresAt = new Date(now.getTime() + online.paymentWindowMinutes * MINUTE_MS);
  const isTakeaway = kind === ONLINE_PAYMENT_KINDS.TAKEAWAY;

  const payment = await OnlinePayment.create({
    ...scoped(req),
    kind,
    onlineOrderId: isTakeaway ? request._id : null,
    reservationId: isTakeaway ? null : request._id,
    amountInPaise,
    status: CREATED,
    expiresAt,
  });

  const statusPage = `${config.CLIENT_ORIGIN}/r/${slug}/${isTakeaway ? 'order' : 'book'}/${request._id}`;
  try {
    const link = await createPaymentLink(keys, {
      amountInPaise,
      referenceId: String(payment._id),
      description,
      customer,
      callbackUrl: statusPage,
      expiresAt,
      notes: { reference: request.reference, kind },
    });
    payment.gatewayLinkId = link.id;
    payment.payUrl = link.short_url;
    await payment.save();
  } catch (error) {
    payment.status = FAILED;
    await payment.save();
    const failedStatus = isTakeaway ? ONLINE_ORDER_STATUSES.PAYMENT_FAILED : RESERVATION_STATUSES.PAYMENT_FAILED;
    await (isTakeaway ? OnlineOrder : Reservation).updateOne({ ...scoped(req), _id: request._id }, { $set: { status: failedStatus, paymentId: payment._id } });
    throw error instanceof PaymentGatewayError ? error : new PaymentGatewayError('Razorpay could not start the payment.');
  }

  await (isTakeaway ? OnlineOrder : Reservation).updateOne({ ...scoped(req), _id: request._id }, { $set: { paymentId: payment._id } });
  return payment;
}

/* ------------------------------------------------------------------------- *
 * Confirming
 * ------------------------------------------------------------------------- */

/**
 * Asks Razorpay for the link and, if it is paid for the exact amount, marks
 * the payment PAID and moves its request into the cafe's inbox. Idempotent:
 * a payment already past CREATED is returned as it is.
 */
export async function confirmPaid(req, payment, { online }) {
  if (payment.status !== CREATED || !payment.gatewayLinkId) return payment;

  const keys = await keysFor(req.restaurantId);
  if (!keys) return payment;

  const now = nowUtc();
  await OnlinePayment.updateOne({ ...scoped(req), _id: payment._id }, { $set: { lastCheckedAt: now } });

  const link = await fetchPaymentLink(keys, payment.gatewayLinkId);
  const paidPayment = (link.payments ?? []).find((entry) => entry.status === 'captured' || entry.status === 'authorized') ?? link.payments?.[0];

  if (link.status === 'paid' && link.amount_paid === payment.amountInPaise && link.amount === payment.amountInPaise) {
    const marked = await OnlinePayment.findOneAndUpdate(
      { ...scoped(req), _id: payment._id, status: CREATED },
      { $set: { status: PAID, paidAt: now, gatewayPaymentId: paidPayment?.payment_id ?? null } },
      { new: true },
    );
    if (!marked) return OnlinePayment.findOne({ ...scoped(req), _id: payment._id });
    const moved = await moveRequestIntoInbox(req, marked, online, now);
    // Paid, but the request had already lapsed or been cancelled: the money goes back.
    if (!moved) return refund(req, marked, { amountInPaise: marked.amountInPaise, reason: 'Paid after the request closed' });
    return marked;
  }

  const closed = link.status === 'expired' || link.status === 'cancelled' || (link.status === 'created' && payment.expiresAt <= now);
  if (closed) return markExpired(req, payment);
  return OnlinePayment.findOne({ ...scoped(req), _id: payment._id });
}

/** Starts the cafe's answer window. True when the request was still waiting for this payment. */
async function moveRequestIntoInbox(req, payment, online, now) {
  const answerBy = new Date(now.getTime() + online.takeawayAnswerWithinMinutes * MINUTE_MS);
  if (payment.kind === ONLINE_PAYMENT_KINDS.TAKEAWAY) {
    const moved = await OnlineOrder.updateOne(
      { ...scoped(req), _id: payment.onlineOrderId, status: ONLINE_ORDER_STATUSES.AWAITING_PAYMENT },
      { $set: { status: ONLINE_ORDER_STATUSES.WAITING, answerBy } },
    );
    return moved.modifiedCount === 1;
  }
  const booking = await Reservation.findOne({ ...scoped(req), _id: payment.reservationId });
  if (!booking) return false;
  const bookingAnswerBy = new Date(Math.min(booking.at.getTime(), Math.max(booking.at.getTime() - 30 * MINUTE_MS, answerBy.getTime())));
  const moved = await Reservation.updateOne(
    { ...scoped(req), _id: payment.reservationId, status: RESERVATION_STATUSES.AWAITING_PAYMENT },
    { $set: { status: RESERVATION_STATUSES.REQUESTED, answerBy: bookingAnswerBy } },
  );
  return moved.modifiedCount === 1;
}

async function markExpired(req, payment) {
  const expired = await OnlinePayment.findOneAndUpdate(
    { ...scoped(req), _id: payment._id, status: CREATED },
    { $set: { status: EXPIRED } },
    { new: true },
  );
  if (payment.kind === ONLINE_PAYMENT_KINDS.TAKEAWAY) {
    await OnlineOrder.updateOne(
      { ...scoped(req), _id: payment.onlineOrderId, status: ONLINE_ORDER_STATUSES.AWAITING_PAYMENT },
      { $set: { status: ONLINE_ORDER_STATUSES.PAYMENT_EXPIRED } },
    );
  } else {
    await Reservation.updateOne(
      { ...scoped(req), _id: payment.reservationId, status: RESERVATION_STATUSES.AWAITING_PAYMENT },
      { $set: { status: RESERVATION_STATUSES.PAYMENT_EXPIRED } },
    );
  }
  return expired ?? OnlinePayment.findOne({ ...scoped(req), _id: payment._id });
}

/** A read-back, no more than once every 10 seconds per payment. */
export async function readBackIfDue(req, payment, { online }) {
  if (!payment || payment.status !== CREATED) return payment;
  const now = nowUtc();
  if (payment.lastCheckedAt && now.getTime() - payment.lastCheckedAt.getTime() < READ_BACK_FLOOR_MS) return payment;
  try {
    return await confirmPaid(req, payment, { online });
  } catch (error) {
    // The gateway being slow must not break the page that asked.
    req.log?.warn({ paymentId: String(payment._id), err: error }, 'Payment read-back failed.');
    return payment;
  }
}

/**
 * The guest's return from Razorpay. The signature must match before we even
 * ask Razorpay; then the read-back decides.
 */
export async function confirmFromReturn(req, payment, body, { online }) {
  if (!payment || payment.status !== CREATED) return payment;
  const keys = await keysFor(req.restaurantId);
  if (!keys) return payment;
  const signed = callbackSignatureMatches(keys.keySecret, {
    linkId: body.razorpay_payment_link_id,
    referenceId: body.razorpay_payment_link_reference_id,
    status: body.razorpay_payment_link_status,
    paymentId: body.razorpay_payment_id,
    signature: body.razorpay_signature,
  });
  if (!signed || body.razorpay_payment_link_id !== payment.gatewayLinkId) return payment;
  return confirmPaid(req, payment, { online });
}

/**
 * Razorpay's webhook for this cafe. Returns false for a bad signature, so the
 * caller answers 400. A good event for another kind, or for a link we do not
 * know, is accepted and ignored.
 */
export async function handleWebhook(req, rawBody, signature, { online }) {
  const keys = await keysFor(req.restaurantId);
  if (!keys || typeof rawBody !== 'string' || !webhookSignatureMatches(keys.webhookSecret, rawBody, signature)) return false;

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return false;
  }
  if (event?.event !== 'payment_link.paid') return true;

  const linkId = event?.payload?.payment_link?.entity?.id;
  if (!linkId) return true;
  const payment = await OnlinePayment.findOne({ ...scoped(req), gatewayLinkId: linkId });
  if (payment) await confirmPaid(req, payment, { online });
  return true;
}

/* ------------------------------------------------------------------------- *
 * Refunds and forfeits
 * ------------------------------------------------------------------------- */

const remaining = (payment) => payment.amountInPaise - payment.appliedInPaise - payment.refundedInPaise;

/**
 * Refunds `amountInPaise` of a paid advance through Razorpay, and records it
 * whatever happens. A refusal leaves the payment REFUND_FAILED, never silent.
 */
export async function refund(req, payment, { amountInPaise, reason }) {
  const amount = Math.min(amountInPaise, remaining(payment));
  if (amount <= 0 || !payment.gatewayPaymentId) return payment;

  const now = nowUtc();
  const by = req.user?.id ?? null;
  let entry;
  try {
    const keys = await keysFor(req.restaurantId);
    if (!keys) throw new PaymentGatewayNotConnectedError('Razorpay is not connected, so the refund could not be sent.');
    const result = await refundPayment(keys, payment.gatewayPaymentId, { amountInPaise: amount, notes: { reason } });
    entry = {
      gatewayRefundId: result.id ?? null,
      amountInPaise: amount,
      reason,
      status: result.status === 'processed' ? REFUND_STATUSES.PROCESSED : REFUND_STATUSES.PENDING,
      at: now,
      by,
    };
  } catch (error) {
    entry = { amountInPaise: amount, reason, status: REFUND_STATUSES.FAILED, failureMessage: error?.message ?? 'Refund failed.', at: now, by };
    req.log?.warn({ paymentId: String(payment._id), err: error }, 'Refund failed.');
  }

  payment.refunds.push(entry);
  payment.refundedInPaise = sumPaise(0, ...payment.refunds.filter((item) => item.status !== REFUND_STATUSES.FAILED).map((item) => item.amountInPaise));
  if (entry.status === REFUND_STATUSES.FAILED) payment.status = REFUND_FAILED;
  else payment.status = payment.refundedInPaise >= payment.amountInPaise ? REFUNDED : PARTLY_REFUNDED;
  await payment.save();
  return payment;
}

/** Refunds whatever of a request's advance is still held. Nothing when unpaid. */
export async function refundAll(req, paymentId, reason) {
  if (!paymentId) return null;
  const payment = await OnlinePayment.findOne({ ...scoped(req), _id: paymentId });
  if (!payment || ![PAID, PARTLY_REFUNDED, REFUND_FAILED].includes(payment.status)) return payment;
  return refund(req, payment, { amountInPaise: remaining(payment), reason });
}

/** Retries a failed refund for whatever is still held. */
export async function retryRefund(req, paymentId) {
  const payment = await OnlinePayment.findOne({ ...scoped(req), _id: paymentId });
  if (!payment) return null;
  return refund(req, payment, { amountInPaise: remaining(payment), reason: 'Retry after a failed refund' });
}

/** Keeps a deposit: the guest cancelled too late or did not come. */
export function forfeit(req, paymentId) {
  if (!paymentId) return Promise.resolve(null);
  return OnlinePayment.findOneAndUpdate(
    { ...scoped(req), _id: paymentId, status: PAID },
    { $set: { status: FORFEITED, forfeitedAt: nowUtc() } },
    { new: true },
  );
}

/** Links the advance to the order it became, at accept or seating. */
export async function attachToOrder(req, paymentId, orderId) {
  if (!paymentId) return;
  await OnlinePayment.updateOne({ ...scoped(req), _id: paymentId, status: PAID }, { $set: { orderId } });
}

/* ------------------------------------------------------------------------- *
 * Reading
 * ------------------------------------------------------------------------- */

/** The guest's and the staff's view of a payment. Never a gateway id. */
export function presentPayment(payment, { forGuest = false } = {}) {
  if (!payment) return null;
  const lastRefund = payment.refunds.at(-1) ?? null;
  return {
    status: payment.status,
    amountInPaise: payment.amountInPaise,
    paidAt: payment.paidAt,
    refundedInPaise: payment.refundedInPaise,
    refundStatus: lastRefund?.status ?? null,
    appliedInPaise: payment.appliedInPaise,
    ...(forGuest ? { payUrl: payment.status === CREATED ? payment.payUrl : null, expiresAt: payment.expiresAt } : { id: String(payment._id) }),
  };
}

export async function paymentsById(req, ids) {
  const wanted = [...new Set(ids.filter(Boolean).map(String))];
  if (wanted.length === 0) return new Map();
  const payments = await OnlinePayment.find({ ...scoped(req), _id: { $in: wanted } });
  return new Map(payments.map((payment) => [String(payment._id), payment]));
}

/** How much of an order's advance can still go on its bill. */
export async function advanceFor(req, order) {
  if (!order?.advancePaymentId) return null;
  const payment = await OnlinePayment.findOne({ ...scoped(req), _id: order.advancePaymentId });
  if (!payment) return null;
  const holding = [PAID, PARTLY_REFUNDED].includes(payment.status);
  return { payment, available: holding ? remaining(payment) : 0 };
}

/* ------------------------------------------------------------------------- *
 * The sweep, run on each staff inbox read
 * ------------------------------------------------------------------------- */

/**
 * There is no scheduler, so the tills' inbox poll is the heartbeat. Expires
 * paid requests nobody answered and refunds them, and reads back unpaid links
 * whose guests may have paid without coming back.
 */
export async function sweep(req, { online }) {
  const now = nowUtc();
  const overdueOrders = await OnlineOrder.find({
    ...scoped(req),
    status: ONLINE_ORDER_STATUSES.WAITING,
    answerBy: { $lte: now },
    paymentId: { $ne: null },
  }).limit(SWEEP_BATCH);
  for (const request of overdueOrders) {
    const moved = await OnlineOrder.updateOne(
      { ...scoped(req), _id: request._id, status: ONLINE_ORDER_STATUSES.WAITING },
      { $set: { status: ONLINE_ORDER_STATUSES.EXPIRED } },
    );
    if (moved.modifiedCount) await refundAll(req, request.paymentId, 'Not answered in time');
  }

  const overdueBookings = await Reservation.find({
    ...scoped(req),
    status: RESERVATION_STATUSES.REQUESTED,
    answerBy: { $lte: now },
    paymentId: { $ne: null },
  }).limit(SWEEP_BATCH);
  for (const booking of overdueBookings) {
    const moved = await Reservation.updateOne(
      { ...scoped(req), _id: booking._id, status: RESERVATION_STATUSES.REQUESTED },
      { $set: { status: RESERVATION_STATUSES.EXPIRED } },
    );
    if (moved.modifiedCount) await refundAll(req, booking.paymentId, 'Not answered in time');
  }

  const unpaid = await OnlinePayment.find({ ...scoped(req), status: CREATED })
    .sort({ lastCheckedAt: 1 })
    .limit(5);
  for (const payment of unpaid) await readBackIfDue(req, payment, { online });
}

/** A voided bill gives back the advance it had applied, for the order's next bill. */
export async function releaseAdvance(req, billId, amountInPaise, session = null) {
  await OnlinePayment.updateOne(
    { ...scoped(req), appliedToBillId: billId },
    { $inc: { appliedInPaise: -amountInPaise }, $set: { appliedToBillId: null, appliedAt: null, appliedBy: null } },
    session ? { session } : {},
  );
}

export function refundFailureCount(req) {
  return OnlinePayment.countDocuments({ ...scoped(req), status: REFUND_FAILED });
}

export { ONLINE_PAYMENT_STATUSES };
