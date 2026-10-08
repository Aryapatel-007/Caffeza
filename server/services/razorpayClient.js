/**
 * The cafe's own Razorpay account, through its REST API. P24.
 *
 * No SDK: five calls, with `fetch` and basic auth. Payment Links give the guest
 * a hosted payment page, so our pages load no outside script and the content
 * security policy is unchanged. The base URL is RAZORPAY_API_BASE, so the
 * tests and the e2e server talk to a fake gateway instead.
 *
 * Every function takes the cafe's `{ keyId, keySecret }`. Nothing here stores
 * or logs a secret.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { config } from '../config/env.js';
import { PaymentGatewayError } from '../utils/errors.js';

let baseForTests;

/** Tests only: point the client at a fake gateway, or `undefined` to go back. */
export function setRazorpayBaseForTests(base) {
  if (!config.isTest) throw new Error('setRazorpayBaseForTests is for tests only.');
  baseForTests = base;
}

const base = () => baseForTests ?? config.RAZORPAY_API_BASE;

async function call(keys, method, path, body) {
  let response;
  try {
    response = await fetch(`${base()}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64')}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new PaymentGatewayError('Could not reach Razorpay. Please try again in a moment.');
  }

  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  if (response.status === 401) throw new PaymentGatewayError('Razorpay did not accept these keys.');
  if (!response.ok) {
    throw new PaymentGatewayError(parsed?.error?.description ? `Razorpay: ${parsed.error.description}` : 'Razorpay refused the request.');
  }
  return parsed;
}

/** Proves the keys work, by listing one payment link. */
export function checkKeys(keys) {
  return call(keys, 'GET', '/v1/payment_links?count=1');
}

/** A hosted payment page for an exact amount, closing at `expiresAt`. */
export function createPaymentLink(keys, { amountInPaise, referenceId, description, customer, callbackUrl, expiresAt, notes }) {
  return call(keys, 'POST', '/v1/payment_links', {
    amount: amountInPaise,
    currency: 'INR',
    accept_partial: false,
    reference_id: referenceId,
    description,
    customer,
    notify: { sms: false, email: false },
    reminder_enable: false,
    expire_by: Math.floor(expiresAt.getTime() / 1000),
    callback_url: callbackUrl,
    callback_method: 'get',
    notes,
  });
}

export function fetchPaymentLink(keys, linkId) {
  return call(keys, 'GET', `/v1/payment_links/${encodeURIComponent(linkId)}`);
}

export function refundPayment(keys, paymentId, { amountInPaise, notes }) {
  return call(keys, 'POST', `/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    amount: amountInPaise,
    speed: 'normal',
    notes,
  });
}

function hmacMatches(secret, message, signature) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(message).digest();
  const given = Buffer.from(signature, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The signature Razorpay appends to a payment link's callback. */
export function callbackSignatureMatches(keySecret, { linkId, referenceId, status, paymentId, signature }) {
  return hmacMatches(keySecret, `${linkId}|${referenceId}|${status}|${paymentId}`, signature);
}

/** The X-Razorpay-Signature on a webhook, over its raw body. */
export function webhookSignatureMatches(webhookSecret, rawBody, signature) {
  return hmacMatches(webhookSecret, rawBody, signature);
}

/** For the fake gateway and the tests: the signature Razorpay would send. */
export function signForTests(secret, message) {
  return createHmac('sha256', secret).update(message).digest('hex');
}
