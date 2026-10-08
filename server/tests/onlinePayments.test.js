/**
 * P24, advance payment through the cafe's own Razorpay account, against a
 * fake gateway. docs/API-CONTRACT.md M14 section 4.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, afterEach, before, describe, it } from 'node:test';

import { ALL_MODELS } from '../models/index.js';
import { OnlinePayment } from '../models/OnlinePayment.js';
import { PaymentMethod } from '../models/PaymentMethod.js';
import { Restaurant } from '../models/Restaurant.js';
import { setRazorpayBaseForTests } from '../services/razorpayClient.js';
import { setSecretsKeyForTests } from '../utils/secretBox.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { GOOD_KEYS, startFakeRazorpay } from './helpers/fakeRazorpay.js';
import { createMenuItem, createTable, seedTeam } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

let fake;

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  fake = await startFakeRazorpay();
  setRazorpayBaseForTests(fake.base);
});

after(async () => {
  setRazorpayBaseForTests(undefined);
  setSecretsKeyForTests(undefined);
  await fake.close();
  await stopTestServer();
  await stopTestDatabase();
});

afterEach(() => {
  resetClockForTests();
  fake.state.failRefunds = false;
});

const LUNCH = new Date('2026-10-08T13:00:00+05:30');
const minutesAfter = (date, minutes) => new Date(date.getTime() + minutes * 60_000);
const KEY = randomBytes(32).toString('base64');

let slugCounter = 0;

/** A cafe with online orders on, Razorpay connected, takeaway prepaid and a ₹100 deposit per person. */
async function seedPaid({ connect = true } = {}) {
  setSecretsKeyForTests(KEY);
  setClockForTests(LUNCH);
  const team = await seedTeam();
  const owner = team.tokens.OWNER;
  slugCounter += 1;
  const slug = `paid-${slugCounter}`;
  await request('PATCH', '/api/v1/settings', {
    token: owner,
    body: {
      reason: 'Online with payment',
      features: { online: true },
      online: { takeawayEnabled: true, reservationsEnabled: true, takeawayPrepay: true, depositPerPersonInPaise: 10000 },
    },
  });
  await request('PATCH', '/api/v1/online/site', { token: owner, body: { publicSlug: slug } });
  if (connect) {
    const connected = await request('PUT', '/api/v1/settings/payments/gateway', { token: owner, body: { ...GOOD_KEYS, reason: 'Connect Razorpay' } });
    assert.equal(connected.status, 200, JSON.stringify(connected.body));
  }
  const chai = (await createMenuItem(owner, { name: 'Masala Chai', priceInPaise: 24000, taxRateBps: 500 })).body.data;
  const table = (await createTable(owner, { name: 'Table 5' })).body.data;
  return { ...team, owner, slug, chai, table };
}

const placeOrder = (world, overrides = {}) =>
  request('POST', `/api/v1/public/${world.slug}/orders`, {
    body: {
      idempotencyKey: randomUUID(),
      customerName: 'Asha',
      customerPhone: '9876543210',
      pickup: 'ASAP',
      lines: [{ menuItemId: world.chai.id, quantity: 2 }],
      ...overrides,
    },
  });

const guestRead = (world, placed, kind = 'orders') =>
  request('GET', `/api/v1/public/${world.slug}/${kind}/${placed.id}`, { headers: { 'X-Status-Token': placed.statusToken } });

const paymentReturn = (world, placed, query, kind = 'orders') =>
  request('POST', `/api/v1/public/${world.slug}/${kind}/${placed.id}/payment-return`, {
    headers: { 'X-Status-Token': placed.statusToken },
    body: query,
  });

const inbox = (world) => request('GET', '/api/v1/online/inbox', { token: world.tokens.CASHIER });
const linkOf = (placed) => /plink_\d+/.exec(placed.payment.payUrl)[0];

/** Places a prepaid takeaway and pays it through the guest's return. */
async function placePaid(world) {
  const placed = (await placeOrder(world)).body.data;
  const paid = await paymentReturn(world, placed, fake.pay(linkOf(placed)));
  assert.equal(paid.body.data.status, 'WAITING', JSON.stringify(paid.body));
  return placed;
}

describe('connecting Razorpay', () => {
  it('refuses on a server with no PAYMENT_SECRETS_KEY', async () => {
    const world = await seedPaid({ connect: false });
    setSecretsKeyForTests(null);
    const refused = await request('PUT', '/api/v1/settings/payments/gateway', { token: world.owner, body: { ...GOOD_KEYS, reason: 'x' } });
    assert.equal(refused.status, 422);
    assert.equal(refused.body.error.code, 'PAYMENT_GATEWAY_NOT_CONNECTED');
  });

  it('refuses keys Razorpay rejects, with the gateway\'s own sentence', async () => {
    const world = await seedPaid({ connect: false });
    const refused = await request('PUT', '/api/v1/settings/payments/gateway', {
      token: world.owner,
      body: { ...GOOD_KEYS, keySecret: 'not-the-right-secret', reason: 'x' },
    });
    assert.equal(refused.status, 502);
    assert.equal(refused.body.error.code, 'PAYMENT_GATEWAY_ERROR');
    assert.match(refused.body.error.message, /did not accept these keys/);
  });

  it('stores the secrets sealed, never returns them, and adds Paid online', async () => {
    const world = await seedPaid();
    const status = await request('GET', '/api/v1/settings/payments/gateway', { token: world.owner });
    assert.equal(status.body.data.connected, true);
    assert.equal(status.body.data.mode, 'TEST');
    assert.equal(JSON.stringify(status.body).includes(GOOD_KEYS.keySecret), false);

    const stored = await Restaurant.findById(world.restaurant._id)
      .select('+paymentGateway.keySecretEncrypted +paymentGateway.webhookSecretEncrypted')
      .lean();
    assert.notEqual(stored.paymentGateway.keySecretEncrypted, GOOD_KEYS.keySecret);
    assert.equal(stored.paymentGateway.keySecretEncrypted.includes(GOOD_KEYS.keySecret), false);
    assert.ok(await PaymentMethod.exists({ restaurantId: world.restaurant._id, code: 'ONLINE' }));

    assert.equal((await request('GET', '/api/v1/settings/payments/gateway', { token: world.tokens.MANAGER })).status, 403);
  });
});

describe('paying for a takeaway', () => {
  it('waits for payment, invisible to the cafe, with a link for exactly the estimate', async () => {
    const world = await seedPaid();
    const placed = await placeOrder(world);
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    assert.equal(placed.body.data.status, 'AWAITING_PAYMENT');
    assert.equal(placed.body.data.payment.amountInPaise, placed.body.data.estimate.billTotalInPaise);
    assert.equal(fake.lastLink().amount, placed.body.data.estimate.billTotalInPaise);
    assert.equal((await inbox(world)).body.data.waitingOrders, 0);
  });

  it('counts nothing on a forged return, nor on a good signature for an unpaid link', async () => {
    const world = await seedPaid();
    const placed = (await placeOrder(world)).body.data;
    const forged = await paymentReturn(world, placed, {
      razorpay_payment_id: 'pay_999',
      razorpay_payment_link_id: linkOf(placed),
      razorpay_payment_link_reference_id: 'x',
      razorpay_payment_link_status: 'paid',
      razorpay_signature: 'a'.repeat(64),
    });
    assert.equal(forged.body.data.status, 'AWAITING_PAYMENT');

    // A real signature, then the link set back to unpaid: the read-back decides.
    const query = fake.pay(linkOf(placed));
    const link = fake.links.get(linkOf(placed));
    link.status = 'created';
    link.amount_paid = 0;
    assert.equal((await paymentReturn(world, placed, query)).body.data.status, 'AWAITING_PAYMENT');

    link.status = 'paid';
    link.amount_paid = link.amount;
    const paid = await paymentReturn(world, placed, query);
    assert.equal(paid.body.data.status, 'WAITING');
    assert.ok(paid.body.data.answerBy);
    assert.equal(paid.body.data.payment.status, 'PAID');
    assert.equal((await inbox(world)).body.data.waitingOrders, 1);
  });

  it('confirms through the webhook once, and refuses a bad signature', async () => {
    const world = await seedPaid();
    const placed = (await placeOrder(world)).body.data;
    fake.pay(linkOf(placed));
    const path = `/api/v1/public/${world.slug}/payments/webhook`;

    const bad = fake.webhook(linkOf(placed), 'wrong-secret-0000');
    assert.equal((await request('POST', path, { body: JSON.parse(bad.raw), headers: { 'X-Razorpay-Signature': bad.signature } })).status, 400);

    const good = fake.webhook(linkOf(placed));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sent = await request('POST', path, { body: JSON.parse(good.raw), headers: { 'X-Razorpay-Signature': good.signature } });
      assert.equal(sent.status, 200, JSON.stringify(sent.body));
    }
    assert.equal((await guestRead(world, placed)).body.data.status, 'WAITING');
    assert.equal(await OnlinePayment.countDocuments({ restaurantId: world.restaurant._id, status: 'PAID' }), 1);
  });

  it('finds a payment by reading back, when the guest never came back', async () => {
    const world = await seedPaid();
    const placed = (await placeOrder(world)).body.data;
    fake.pay(linkOf(placed));
    // The sweep reads the link back before counting, so the first read already sees it.
    assert.equal((await inbox(world)).body.data.waitingOrders, 1);
  });

  it('refunds in full when the cafe declines, and the guest sees it', async () => {
    const world = await seedPaid();
    const placed = await placePaid(world);
    const declined = await request('POST', `/api/v1/online/orders/${placed.id}/decline`, {
      token: world.tokens.CASHIER,
      body: { reasonCode: 'TOO_BUSY' },
    });
    assert.equal(declined.body.data.payment.status, 'REFUNDED');
    assert.equal(fake.refunds.at(-1).amount, placed.payment.amountInPaise);
    const guest = await guestRead(world, placed);
    assert.equal(guest.body.data.payment.refundedInPaise, placed.payment.amountInPaise);
  });

  it('refunds what nobody answered, on the next inbox read', async () => {
    const world = await seedPaid();
    const placed = await placePaid(world);
    setClockForTests(minutesAfter(LUNCH, 15));
    const refundsBefore = fake.refunds.length;
    await inbox(world);
    assert.equal(fake.refunds.length, refundsBefore + 1);
    assert.equal((await guestRead(world, placed)).body.data.status, 'EXPIRED');
  });

  it('refunds when the guest cancels while it waits', async () => {
    const world = await seedPaid();
    const placed = await placePaid(world);
    const cancelled = await request('POST', `/api/v1/public/${world.slug}/orders/${placed.id}/cancel`, {
      headers: { 'X-Status-Token': placed.statusToken },
    });
    assert.equal(cancelled.body.data.status, 'CANCELLED');
    assert.equal(cancelled.body.data.payment.status, 'REFUNDED');
  });

  it('shows a refund the gateway refused, and retries it', async () => {
    const world = await seedPaid();
    const placed = await placePaid(world);
    fake.state.failRefunds = true;
    const declined = await request('POST', `/api/v1/online/orders/${placed.id}/decline`, {
      token: world.tokens.CASHIER,
      body: { reasonCode: 'TOO_BUSY' },
    });
    assert.equal(declined.body.data.payment.status, 'REFUND_FAILED');
    assert.equal((await inbox(world)).body.data.refundFailures, 1);

    fake.state.failRefunds = false;
    const paymentId = declined.body.data.payment.id;
    assert.equal((await request('POST', `/api/v1/online/payments/${paymentId}/refund`, { token: world.tokens.CASHIER, body: {} })).status, 403);
    const retried = await request('POST', `/api/v1/online/payments/${paymentId}/refund`, { token: world.tokens.MANAGER, body: {} });
    assert.equal(retried.body.data.status, 'REFUNDED');
    assert.equal((await inbox(world)).body.data.refundFailures, 0);
  });
});

/** A paid takeaway, accepted, cooked and served, with its bill created. */
async function billedPaidOrder(world) {
  const placed = await placePaid(world);
  const { order, kots } = (await request('POST', `/api/v1/online/orders/${placed.id}/accept`, { token: world.tokens.CASHIER, body: {} })).body.data;
  await request('PATCH', `/api/v1/kots/${kots[0].id}/ready`, { token: world.tokens.KITCHEN });
  let current = (await request('GET', `/api/v1/orders/${order.id}`, { token: world.tokens.CASHIER })).body.data;
  for (const line of current.lines) {
    current = (await request('PATCH', `/api/v1/orders/${order.id}/lines/${line.id}/served`, { token: world.tokens.CASHIER, body: { version: current.version } })).body.data;
  }
  const bill = (await request('POST', '/api/v1/bills', { token: world.tokens.CASHIER, body: { orderId: order.id, version: current.version } })).body.data;
  return { placed, order, bill };
}

describe('the advance on the bill', () => {
  it('refuses cash, and Paid online by hand, until the advance is applied, then settles the bill', async () => {
    const world = await seedPaid();
    const { placed, bill } = await billedPaidOrder(world);

    const read = await request('GET', `/api/v1/bills/${bill.id}`, { token: world.tokens.CASHIER });
    assert.equal(read.body.data.advance.available, placed.payment.amountInPaise);

    const cash = await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: world.tokens.CASHIER, body: { method: 'CASH', amountInPaise: bill.grandTotalInPaise } });
    assert.equal(cash.status, 422);
    assert.equal(cash.body.error.code, 'ADVANCE_NOT_APPLIED');
    const byHand = await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: world.tokens.CASHIER, body: { method: 'ONLINE', amountInPaise: 100 } });
    assert.equal(byHand.body.error.code, 'PAYMENT_METHOD_NOT_ALLOWED');

    const applied = await request('POST', `/api/v1/bills/${bill.id}/apply-advance`, { token: world.tokens.CASHIER, body: {} });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.equal(applied.body.data.status, 'PAID');
    assert.equal(applied.body.data.payments[0].method, 'ONLINE');
    assert.equal(applied.body.data.payments[0].amountInPaise, bill.grandTotalInPaise);
    assert.equal(applied.body.data.advanceRefundedInPaise, 0);

    const again = await request('POST', `/api/v1/bills/${bill.id}/apply-advance`, { token: world.tokens.CASHIER, body: {} });
    assert.equal(again.status, 422);
  });

  it('refunds what is left when the bill comes to less than the advance', async () => {
    const world = await seedPaid();
    const { placed, bill } = await billedPaidOrder(world);
    const discounted = await request('POST', `/api/v1/bills/${bill.id}/discount`, {
      token: world.tokens.MANAGER,
      body: { kind: 'FLAT', valueInPaise: 5000, reasonCode: 'REGULAR_GUEST' },
    });
    assert.equal(discounted.status, 200, JSON.stringify(discounted.body));
    const total = discounted.body.data.grandTotalInPaise;

    const applied = await request('POST', `/api/v1/bills/${bill.id}/apply-advance`, { token: world.tokens.CASHIER, body: {} });
    assert.equal(applied.body.data.status, 'PAID');
    assert.equal(applied.body.data.advanceRefundedInPaise, placed.payment.amountInPaise - total);
    assert.equal(fake.refunds.at(-1).amount, placed.payment.amountInPaise - total);
  });
});

describe('booking deposits', () => {
  const ist = (time, date = '2026-10-10') => new Date(`${date}T${time}:00+05:30`);
  const requestBooking = (world, overrides = {}) =>
    request('POST', `/api/v1/public/${world.slug}/reservations`, {
      body: {
        idempotencyKey: randomUUID(),
        guestName: 'Mehta',
        guestPhone: '9123456789',
        partySize: 4,
        at: ist('20:00').toISOString(),
        ...overrides,
      },
    });

  async function paidBooking(world, overrides) {
    const placed = (await requestBooking(world, overrides)).body.data;
    assert.equal(placed.status, 'AWAITING_PAYMENT');
    assert.equal(placed.payment.amountInPaise, 4 * 10000);
    const paid = await paymentReturn(world, placed, fake.pay(linkOf(placed)), 'reservations');
    assert.equal(paid.body.data.status, 'REQUESTED');
    return placed;
  }

  const guestCancel = (world, placed) =>
    request('POST', `/api/v1/public/${world.slug}/reservations/${placed.id}/cancel`, { headers: { 'X-Status-Token': placed.statusToken } });

  it('takes people × the deposit, and refunds a guest who cancels in good time', async () => {
    const world = await seedPaid();
    const placed = await paidBooking(world);
    const cancelled = await guestCancel(world, placed);
    assert.equal(cancelled.body.data.payment.status, 'REFUNDED');
  });

  it('keeps the deposit from a guest who cancels too late, and from a no-show', async () => {
    const world = await seedPaid();
    const late = await paidBooking(world);
    await request('POST', `/api/v1/online/reservations/${late.id}/confirm`, { token: world.tokens.CASHIER, body: {} });
    setClockForTests(ist('19:00'));
    assert.equal((await guestCancel(world, late)).body.data.payment.status, 'FORFEITED');

    setClockForTests(LUNCH);
    const noShow = await paidBooking(world, { at: ist('21:00').toISOString() });
    await request('POST', `/api/v1/online/reservations/${noShow.id}/confirm`, { token: world.tokens.CASHIER, body: {} });
    setClockForTests(ist('21:20'));
    const marked = await request('POST', `/api/v1/online/reservations/${noShow.id}/no-show`, { token: world.tokens.CASHIER, body: {} });
    assert.equal(marked.body.data.payment.status, 'FORFEITED');
  });

  it('always refunds when the cafe cancels, and carries the deposit to the seated order', async () => {
    const world = await seedPaid();
    const cancelledByCafe = await paidBooking(world);
    const cancelled = await request('POST', `/api/v1/online/reservations/${cancelledByCafe.id}/cancel`, {
      token: world.tokens.CASHIER,
      body: { note: 'Kitchen closed for a private event' },
    });
    assert.equal(cancelled.body.data.payment.status, 'REFUNDED');

    const seatedBooking = await paidBooking(world, { at: ist('21:00').toISOString(), guestPhone: '9000000001' });
    await request('POST', `/api/v1/online/reservations/${seatedBooking.id}/confirm`, { token: world.tokens.CASHIER, body: {} });
    setClockForTests(ist('20:55'));
    const seated = await request('POST', `/api/v1/online/reservations/${seatedBooking.id}/seat`, {
      token: world.tokens.WAITER,
      body: { tableId: world.table.id, guestCount: 4 },
    });
    assert.equal(seated.status, 200, JSON.stringify(seated.body));
    assert.ok(seated.body.data.order.advancePaymentId);
  });
});

describe('roles and tenancy on the new endpoints', () => {
  it('refuses a signed-out caller, the wrong roles, and another restaurant', async () => {
    const world = await seedPaid();
    const other = await seedPaid();
    const { bill } = await billedPaidOrder(world);
    const payment = await OnlinePayment.findOne({ restaurantId: world.restaurant._id }).lean();
    const paymentId = String(payment._id);

    const endpoints = [
      ['GET', '/api/v1/settings/payments/gateway'],
      ['PUT', '/api/v1/settings/payments/gateway'],
      ['DELETE', '/api/v1/settings/payments/gateway'],
      ['POST', `/api/v1/bills/${bill.id}/apply-advance`],
      ['POST', `/api/v1/online/payments/${paymentId}/refund`],
      ['PUT', `/api/v1/menu-items/${world.chai.id}/photo`],
      ['DELETE', `/api/v1/menu-items/${world.chai.id}/photo`],
      ['GET', `/api/v1/menu-items/${world.chai.id}/photo`],
    ];
    for (const [method, path] of endpoints) {
      assert.equal((await request(method, path, method === 'GET' ? {} : { body: {} })).status, 401, `${method} ${path}`);
    }

    const refusedRoles = [
      ['PUT', '/api/v1/settings/payments/gateway', ['MANAGER', 'CASHIER']],
      ['DELETE', '/api/v1/settings/payments/gateway', ['MANAGER', 'CASHIER']],
      ['POST', `/api/v1/bills/${bill.id}/apply-advance`, ['WAITER', 'KITCHEN', 'STOREKEEPER']],
      ['POST', `/api/v1/online/payments/${paymentId}/refund`, ['CASHIER', 'WAITER']],
      ['PUT', `/api/v1/menu-items/${world.chai.id}/photo`, ['CASHIER', 'WAITER']],
      ['DELETE', `/api/v1/menu-items/${world.chai.id}/photo`, ['CASHIER', 'WAITER']],
    ];
    for (const [method, path, roles] of refusedRoles) {
      for (const role of roles) {
        assert.equal((await request(method, path, { token: world.tokens[role], body: { reason: 'x' } })).status, 403, `${role} ${method} ${path}`);
      }
    }

    const fromOther = [
      ['POST', `/api/v1/bills/${bill.id}/apply-advance`, other.tokens.CASHIER, {}],
      ['POST', `/api/v1/online/payments/${paymentId}/refund`, other.tokens.MANAGER, {}],
      ['GET', `/api/v1/menu-items/${world.chai.id}/photo`, other.tokens.OWNER],
      ['DELETE', `/api/v1/menu-items/${world.chai.id}/photo`, other.tokens.OWNER, { reason: 'x' }],
    ];
    for (const [method, path, token, body] of fromOther) {
      const options = body === undefined ? { token } : { token, body };
      assert.equal((await request(method, path, options)).status, 404, `other restaurant ${method} ${path}`);
    }
    assert.equal(await OnlinePayment.countDocuments({ restaurantId: world.restaurant._id, _id: payment._id, status: payment.status }), 1);
  });
});
