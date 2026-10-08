/**
 * A fake Razorpay, for the payment tests and the e2e server. P24.
 *
 * It answers the five calls services/razorpayClient.js makes, checks basic
 * auth against the keys it was given, and lets a test pay, expire or break a
 * link. It signs callbacks and webhooks exactly as Razorpay documents them, so
 * the real signature checks run unchanged.
 */
import http from 'node:http';

import { signForTests } from '../../services/razorpayClient.js';

export const GOOD_KEYS = Object.freeze({
  keyId: 'rzp_test_FakeKey1234',
  keySecret: 'fake-key-secret-123456',
  webhookSecret: 'fake-webhook-secret-123456',
});

export async function startFakeRazorpay({ port = 0, host = '127.0.0.1', keys = GOOD_KEYS } = {}) {
  const links = new Map();
  const refunds = [];
  let counter = 0;
  const state = { failRefunds: false };

  const authorised = (request) =>
    request.headers.authorization === `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64')}`;

  const send = (response, status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };

  const readJson = (request) =>
    new Promise((resolve) => {
      let raw = '';
      request.on('data', (chunk) => (raw += chunk));
      request.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
    });

  let base = '';

  /** The guest's hosted payment page: pays the link and goes back to the callback. */
  const payPage = (request, response, linkId) => {
    const link = links.get(linkId);
    if (!link) return send(response, 404, { error: { description: 'No such link' } });
    const query = fake.pay(linkId);
    response.writeHead(302, { Location: `${link.callback_url}?${new URLSearchParams(query)}` });
    return response.end();
  };

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://fake');
    const payMatch = /^\/pay\/(plink_\w+)$/.exec(url.pathname);
    if (request.method === 'GET' && payMatch) return payPage(request, response, payMatch[1]);
    if (!authorised(request)) return send(response, 401, { error: { description: 'Authentication failed' } });

    if (request.method === 'GET' && url.pathname === '/v1/payment_links') return send(response, 200, { payment_links: [], count: 0 });

    if (request.method === 'POST' && url.pathname === '/v1/payment_links') {
      const body = await readJson(request);
      counter += 1;
      const id = `plink_${counter}`;
      const link = {
        id,
        short_url: `${base}/pay/${id}`,
        amount: body.amount,
        amount_paid: 0,
        status: 'created',
        reference_id: body.reference_id,
        expire_by: body.expire_by,
        callback_url: body.callback_url,
        customer: body.customer,
        payments: [],
      };
      links.set(id, link);
      return send(response, 200, link);
    }

    const linkMatch = /^\/v1\/payment_links\/(plink_\w+)$/.exec(url.pathname);
    if (request.method === 'GET' && linkMatch) {
      const link = links.get(linkMatch[1]);
      return link ? send(response, 200, link) : send(response, 404, { error: { description: 'Not found' } });
    }

    const refundMatch = /^\/v1\/payments\/(pay_\w+)\/refund$/.exec(url.pathname);
    if (request.method === 'POST' && refundMatch) {
      const body = await readJson(request);
      if (state.failRefunds) return send(response, 400, { error: { description: 'The refund could not be processed' } });
      counter += 1;
      const refund = { id: `rfnd_${counter}`, payment_id: refundMatch[1], amount: body.amount, status: 'processed' };
      refunds.push(refund);
      return send(response, 200, refund);
    }

    return send(response, 404, { error: { description: 'Unknown fake route' } });
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  base = `http://${host}:${server.address().port}`;

  const fake = {
    base,
    links,
    refunds,
    state,
    /** Marks a link paid in full, and returns the query Razorpay would append to the callback. */
    pay(linkId) {
      const link = links.get(linkId);
      counter += 1;
      const paymentId = `pay_${counter}`;
      link.status = 'paid';
      link.amount_paid = link.amount;
      link.payments = [{ payment_id: paymentId, amount: link.amount, status: 'captured' }];
      return {
        razorpay_payment_id: paymentId,
        razorpay_payment_link_id: linkId,
        razorpay_payment_link_reference_id: link.reference_id,
        razorpay_payment_link_status: 'paid',
        razorpay_signature: signForTests(keys.keySecret, `${linkId}|${link.reference_id}|paid|${paymentId}`),
      };
    },
    expire(linkId) {
      links.get(linkId).status = 'expired';
    },
    /** The raw body and signature of a `payment_link.paid` webhook. */
    webhook(linkId, secret = keys.webhookSecret) {
      const raw = JSON.stringify({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: linkId } } } });
      return { raw, signature: signForTests(secret, raw) };
    },
    lastLink: () => [...links.values()].at(-1),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
  return fake;
}
