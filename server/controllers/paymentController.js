/**
 * Online payment and dish photo endpoints. P24, API-CONTRACT M14 sections 4
 * and 5. Every rule lives in the services.
 */
import { applyAdvance } from '../services/billService.js';
import { onlineSettings } from '../services/onlineCommon.js';
import * as onlineOrders from '../services/onlineOrderService.js';
import { handleWebhook, presentPayment, retryRefund } from '../services/onlinePaymentService.js';
import { connectGateway, disconnectGateway, gatewayStatus } from '../services/paymentGatewayService.js';
import { readPhoto, removePhoto, sendPhoto, setPhoto } from '../services/menuPhotoService.js';
import * as reservations from '../services/reservationService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { sendSuccess } from '../utils/response.js';

/* The cafe's Razorpay account ---------------------------------------------- */

export async function getGateway(req, res) {
  return sendSuccess(res, await gatewayStatus(req));
}

export async function putGateway(req, res) {
  return sendSuccess(res, await connectGateway(req, req.body));
}

export async function deleteGateway(req, res) {
  return sendSuccess(res, await disconnectGateway(req, req.body));
}

/* The advance on a bill, and refunds --------------------------------------- */

export async function postApplyAdvance(req, res) {
  const { bill, advanceRefundedInPaise } = await applyAdvance(req, req.params.billId);
  return sendSuccess(res, { ...bill.toJSON(), advanceRefundedInPaise });
}

export async function postRetryRefund(req, res) {
  const payment = await retryRefund(req, req.params.id);
  if (!payment) throw new NotFoundError('Payment not found.');
  return sendSuccess(res, presentPayment(payment));
}

/* The guest's return and the webhook --------------------------------------- */

export async function postOrderPaymentReturn(req, res) {
  res.set('Cache-Control', 'no-store');
  return sendSuccess(res, await onlineOrders.guestPaymentReturn(req, req.params.id, req.body));
}

export async function postBookingPaymentReturn(req, res) {
  res.set('Cache-Control', 'no-store');
  return sendSuccess(res, await reservations.guestPaymentReturn(req, req.params.id, req.body));
}

/** Razorpay's webhook. The raw body is kept by the parser in server.js for the signature. */
export async function postWebhook(req, res) {
  const { online } = await onlineSettings(req);
  const accepted = await handleWebhook(req, req.rawBody, req.get('x-razorpay-signature'), { online });
  if (!accepted) throw new ValidationError('The webhook signature did not match.');
  return sendSuccess(res, { received: true });
}

/* Dish photos -------------------------------------------------------------- */

export async function putPhoto(req, res) {
  return sendSuccess(res, await setPhoto(req, req.params.itemId, req.body.image));
}

export async function deletePhoto(req, res) {
  return sendSuccess(res, await removePhoto(req, req.params.itemId));
}

export async function getPhoto(req, res) {
  return sendPhoto(req, res, await readPhoto(req, req.params.itemId), 'private, max-age=0, must-revalidate');
}

/** The public photo. The hash is in the URL, so it can be cached for a year. */
export async function getPublicPhoto(req, res) {
  return sendPhoto(req, res, await readPhoto(req, req.params.itemId), 'public, max-age=31536000, immutable');
}
