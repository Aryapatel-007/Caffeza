/**
 * P37: WhatsApp, the connection, templates and the receipt, against a fake
 * Meta. API-CONTRACT "P37", DB-SCHEMA section 47.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import mongoose from 'mongoose';

import { ALL_MODELS } from '../models/index.js';
import { Bill } from '../models/Bill.js';
import { Customer } from '../models/Customer.js';
import { IntegrationEvent } from '../models/IntegrationEvent.js';
import { IntegrationJob } from '../models/IntegrationJob.js';
import { runDueJobs } from '../services/integrations/jobRunner.js';
import { signMetaBody } from '../services/integrations/messaging/whatsappAdapter.js';
import { queueBillReceipt, SEND_WHATSAPP_TEMPLATE, sendTemplate } from '../services/integrations/messaging/whatsappService.js';
import { resetClockForTests } from '../utils/time.js';
import { GOOD, startFakeMeta } from './helpers/fakeMeta.js';
import { GOLDEN_BILLS, setupGoldenRestaurant } from './helpers/goldenDay.js';
import { fireOrder, openOrder, seedFloor } from './helpers/m2Fixtures.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

let meta;

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  meta = await startFakeMeta();
});

after(async () => {
  await meta.stop();
  await stopTestServer();
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
  Object.assign(meta.state, { templates: [], messages: [], requests: [], refuseNext: null, down: false, platformType: 'CLOUD_API' });
});

afterEach(() => resetClockForTests());

const ok = (response, what) => {
  assert.ok(response.status >= 200 && response.status < 300, `${what}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data;
};

const GUEST = '9876543210';
const BODY = 'Thanks for visiting {{1}}! Your bill {{2}} for {{3}} is attached. We hope to see you again.';

/** Saves and tests this restaurant's WhatsApp, against the fake. Returns the webhook key. */
async function connectWhatsApp(tokens, { sendBillOnPayment = true } = {}) {
  const saved = ok(
    await request('PUT', '/api/v1/integrations/WHATSAPP', {
      token: tokens.OWNER,
      body: { environment: 'SANDBOX', credentials: { ...GOOD }, config: { apiBaseUrl: meta.url, sendBillOnPayment } },
    }),
    'save',
  );
  ok(await request('POST', '/api/v1/integrations/WHATSAPP/test', { token: tokens.OWNER }), 'test');
  return saved.webhookUrl.split('/').at(-1);
}

/** The bill receipt template, submitted to Meta and approved there. */
async function approvedReceipt(tokens, { approveAs = null } = {}) {
  ok(
    await request('POST', '/api/v1/integrations/whatsapp/templates', {
      token: tokens.OWNER,
      body: { key: 'BILL_RECEIPT', metaName: 'bill_receipt', category: 'UTILITY', bodyText: BODY, variables: ['restaurantName', 'billNumber', 'billTotal'], example: ['Fake Restaurant', '2026-27/000001', '₹100.00'] },
    }),
    'submit',
  );
  meta.approve('bill_receipt', approveAs);
  return ok(await request('POST', '/api/v1/integrations/whatsapp/templates/sync', { token: tokens.OWNER }), 'sync');
}

/** A table with a guest's mobile, sent, made, billed. Returns the bill. */
async function billForGuest(floor, { phone = GUEST, offersConsent = undefined, item = floor.item } = {}) {
  const opened = ok(
    await openOrder(floor.tokens.WAITER, {
      tableId: floor.table.id,
      guestCount: 2,
      ...(phone ? { customerName: 'Asha Patel', customerPhone: phone } : {}),
      ...(offersConsent === undefined ? {} : { offersConsent }),
      lines: [{ menuItemId: item.id, quantity: 1 }],
    }),
    'open',
  );
  const fired = ok(await fireOrder(floor.tokens.WAITER, opened.id, opened.version), 'fire');
  for (const kot of fired.kots) ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: floor.tokens.KITCHEN }), 'ready');
  const order = ok(await request('GET', `/api/v1/orders/${opened.id}`, { token: floor.tokens.WAITER }), 'read');
  return ok(await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: order.id, version: order.version } }), 'bill');
}

const payInCash = (floor, bill, amountInPaise = bill.grandTotalInPaise) =>
  request('POST', `/api/v1/bills/${bill.id}/payments`, { token: floor.tokens.CASHIER, body: { method: 'CASH', amountInPaise } });

const sendJobs = (restaurantId, type = SEND_WHATSAPP_TEMPLATE) => IntegrationJob.find({ restaurantId, type }).lean();

/** The receipt is queued after the payment's write commits, a moment later. */
async function settle(restaurantId, expected) {
  for (let tries = 0; tries < 40; tries += 1) {
    if ((await sendJobs(restaurantId)).length >= expected) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  return sendJobs(restaurantId);
}

/** Posts a body to the webhook, signed as Meta signs it. */
function postWebhook(key, payload, { secret = GOOD.appSecret } = {}) {
  const raw = JSON.stringify(payload);
  return request('POST', `/api/v1/hooks/WHATSAPP/${key}`, { body: payload, headers: { 'X-Hub-Signature-256': signMetaBody(Buffer.from(raw), secret) } });
}

const statusPayload = (messageId, status, errors = undefined) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: GOOD.wabaId, changes: [{ field: 'messages', value: { statuses: [{ id: messageId, status, timestamp: '1760000000', recipient_id: `91${GUEST}`, ...(errors ? { errors } : {}) }] } }] }],
});
const replyPayload = (text, messageId = 'wamid.guest1') => ({
  object: 'whatsapp_business_account',
  entry: [{ id: GOOD.wabaId, changes: [{ field: 'messages', value: { messages: [{ from: `91${GUEST}`, id: messageId, timestamp: '1760000000', type: 'text', text: { body: text } }] } }] }],
});

describe('the WhatsApp connection', () => {
  it('passes its test only when Meta reads the number back on the Cloud API, and keeps the credentials sealed', async () => {
    const floor = await seedFloor();
    const saved = ok(
      await request('PUT', '/api/v1/integrations/WHATSAPP', { token: floor.tokens.OWNER, body: { environment: 'SANDBOX', credentials: { ...GOOD, accessToken: 'fake-wrong-token-not-real-0000' }, config: { apiBaseUrl: meta.url } } }),
      'save',
    );
    assert.equal(saved.credentialHints.accessToken, '0000');
    assert.doesNotMatch(JSON.stringify(saved), new RegExp(GOOD.appSecret));
    const refused = await request('POST', '/api/v1/integrations/WHATSAPP/test', { token: floor.tokens.OWNER });
    assert.equal(refused.status, 422);
    assert.match(refused.body.error.message, /Meta refused/);

    ok(await request('PUT', '/api/v1/integrations/WHATSAPP', { token: floor.tokens.OWNER, body: { environment: 'SANDBOX', credentials: { accessToken: GOOD.accessToken }, config: { apiBaseUrl: meta.url } } }), 'fix');
    meta.state.platformType = 'ON_PREMISE';
    assert.equal((await request('POST', '/api/v1/integrations/WHATSAPP/test', { token: floor.tokens.OWNER })).status, 422, 'a number not on the Cloud API');
    meta.state.platformType = 'CLOUD_API';
    const passed = ok(await request('POST', '/api/v1/integrations/WHATSAPP/test', { token: floor.tokens.OWNER }), 'test');
    assert.equal(passed.status, 'ACTIVE');

    // No stored event line carries a credential.
    const lines = JSON.stringify(await IntegrationEvent.find({ restaurantId: floor.restaurant._id }).lean());
    for (const value of Object.values(GOOD)) assert.equal(lines.includes(value), false, `event lines hide ${value.slice(0, 6)}…`);
  });

  it("answers Meta's subscription handshake only with its own verify token", async () => {
    const floor = await seedFloor();
    const key = await connectWhatsApp(floor.tokens);
    const ask = (token) => request('GET', `/api/v1/hooks/WHATSAPP/${key}?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=8675309`);
    const yes = await ask(GOOD.webhookVerifyToken);
    assert.equal(yes.status, 200);
    // The test helper reads the plain-text answer as a number.
    assert.equal(String(yes.body.raw ?? yes.body), '8675309');
    assert.equal((await ask('not-the-token-0000000')).status, 403);
    assert.equal((await request('GET', `/api/v1/hooks/WHATSAPP/${'x'.repeat(32)}?hub.mode=subscribe`)).status, 404);
  });
});

describe('templates', () => {
  it('submits for review, reads back the state, and warns when Meta approves it in another category', async () => {
    const floor = await seedFloor();
    await connectWhatsApp(floor.tokens);
    const submitted = ok(
      await request('POST', '/api/v1/integrations/whatsapp/templates', {
        token: floor.tokens.OWNER,
        body: { key: 'BILL_RECEIPT', metaName: 'bill_receipt', category: 'UTILITY', bodyText: BODY, variables: ['restaurantName', 'billNumber', 'billTotal'], example: ['A', 'B', 'C'] },
      }),
      'submit',
    );
    assert.equal(submitted[0].status, 'PENDING');
    assert.equal(meta.state.templates[0].name, 'bill_receipt');

    // Meta's reviewer approves it, as marketing.
    meta.approve('bill_receipt', 'MARKETING');
    const after = ok(await request('POST', '/api/v1/integrations/whatsapp/templates/sync', { token: floor.tokens.MANAGER }), 'sync');
    assert.equal(after[0].status, 'APPROVED');
    assert.equal(after[0].approvedCategory, 'MARKETING');
    assert.equal(after[0].categoryChanged, true);

    // The variables must match the text.
    const bad = await request('POST', '/api/v1/integrations/whatsapp/templates', {
      token: floor.tokens.OWNER,
      body: { key: 'BAD_ONE', metaName: 'bad_one', category: 'UTILITY', bodyText: 'Hello {{1}} and {{3}}', variables: ['a', 'b'], example: ['x', 'y'] },
    });
    assert.equal(bad.status, 400);
    // A manager may read and sync, not add.
    assert.equal((await request('POST', '/api/v1/integrations/whatsapp/templates', { token: floor.tokens.MANAGER, body: {} })).status, 403);
  });

  it('links a template made by hand in Meta, and reads its state at once', async () => {
    const floor = await seedFloor();
    await connectWhatsApp(floor.tokens);
    meta.addApproved({ name: 'bill_receipt' });
    const linked = ok(
      await request('POST', '/api/v1/integrations/whatsapp/templates', {
        token: floor.tokens.OWNER,
        body: { key: 'BILL_RECEIPT', metaName: 'bill_receipt', category: 'UTILITY', bodyText: BODY, variables: ['restaurantName', 'billNumber', 'billTotal'], submit: false },
      }),
      'link',
    );
    assert.equal(linked[0].status, 'APPROVED');
    assert.equal(meta.state.templates.length, 1, 'nothing was submitted');
  });
});

describe('sendTemplate', () => {
  it('refuses with no connection, an unapproved template, and a marketing message to a guest without consent', async () => {
    const floor = await seedFloor();
    const ctx = { restaurantId: floor.restaurant._id, branchId: floor.branch._id };
    await assert.rejects(sendTemplate({ ...ctx, phone: GUEST, templateKey: 'BILL_RECEIPT', idempotencyKey: 'a' }), (error) => error.code === 'MESSAGING_NOT_CONNECTED');

    await connectWhatsApp(floor.tokens);
    ok(
      await request('POST', '/api/v1/integrations/whatsapp/templates', {
        token: floor.tokens.OWNER,
        body: { key: 'BILL_RECEIPT', metaName: 'bill_receipt', category: 'UTILITY', bodyText: BODY, variables: ['restaurantName', 'billNumber', 'billTotal'], example: ['A', 'B', 'C'] },
      }),
      'submit',
    );
    await assert.rejects(sendTemplate({ ...ctx, phone: GUEST, templateKey: 'BILL_RECEIPT', idempotencyKey: 'b' }), (error) => error.code === 'TEMPLATE_NOT_APPROVED');
    assert.equal((await sendJobs(floor.restaurant._id)).length, 0, 'refused, never queued');

    // Meta approves it as marketing: a guest without offers consent is refused.
    meta.approve('bill_receipt', 'MARKETING');
    ok(await request('POST', '/api/v1/integrations/whatsapp/templates/sync', { token: floor.tokens.OWNER }), 'sync');
    await Customer.create({ restaurantId: floor.restaurant._id, branchId: floor.branch._id, phone: GUEST, firstVisitAt: new Date(), lastVisitAt: new Date(), visitCount: 1 });
    await assert.rejects(
      sendTemplate({ ...ctx, phone: GUEST, templateKey: 'BILL_RECEIPT', variables: { restaurantName: 'A', billNumber: 'B', billTotal: 'C' }, idempotencyKey: 'c' }),
      (error) => error.code === 'GUEST_OPTED_OUT',
    );
  });

  it('queues once per idempotency key, and sends the variables in their own order', async () => {
    const floor = await seedFloor();
    const ctx = { restaurantId: floor.restaurant._id, branchId: floor.branch._id };
    await connectWhatsApp(floor.tokens);
    await approvedReceipt(floor.tokens);
    await Customer.create({ ...ctx, phone: GUEST, firstVisitAt: new Date(), lastVisitAt: new Date(), visitCount: 1 });
    const send = () => sendTemplate({ ...ctx, phone: GUEST, templateKey: 'BILL_RECEIPT', variables: { billTotal: '₹1.00', restaurantName: 'Fake', billNumber: 'X-1' }, idempotencyKey: 'bill:x:receipt' });
    assert.equal((await send()).queued, true);
    assert.deepEqual(await send(), { queued: false, duplicate: true });
    await runDueJobs();
    assert.equal(meta.state.messages.length, 1);
    assert.deepEqual(meta.state.messages[0].template.components[0].parameters.map((entry) => entry.text), ['Fake', 'X-1', '₹1.00']);
    assert.equal(meta.state.messages[0].to, `91${GUEST}`);
  });
});

describe('the receipt', () => {
  it('sends a paid bill once, after the payment, and never again', async () => {
    const floor = await seedFloor();
    const key = await connectWhatsApp(floor.tokens);
    await approvedReceipt(floor.tokens);
    const bill = await billForGuest(floor);
    ok(await payInCash(floor, bill), 'pay');
    const jobs = await settle(floor.restaurant._id, 1);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].dedupeKey, `whatsapp:bill:${bill.id}:receipt`);
    assert.equal(JSON.stringify(jobs[0].payload).includes(GUEST), false, 'the job names the guest by id, never the number');

    // Paying again is refused, and a later save of the paid bill sends nothing more.
    assert.notEqual((await payInCash(floor, bill, 100)).status, 200);
    ok(await request('POST', `/api/v1/bills/${bill.id}/printed`, { token: floor.tokens.CASHIER, body: {} }), 'print');
    assert.equal((await settle(floor.restaurant._id, 2)).length, 1);

    await runDueJobs();
    assert.equal(meta.state.messages.length, 1);
    const [message] = meta.state.messages;
    assert.equal(message.template.name, 'bill_receipt');
    assert.deepEqual(message.template.components[0].parameters.map((entry) => entry.text), [
      floor.restaurant.name,
      bill.billNumber,
      `₹${(bill.grandTotalInPaise / 100).toFixed(2)}`,
    ]);

    // The delivery receipt is recorded against the send.
    const sent = (await sendJobs(floor.restaurant._id))[0];
    ok(await postWebhook(key, statusPayload(sent.result.messageId, 'delivered')), 'delivered');
    ok(await postWebhook(key, statusPayload(sent.result.messageId, 'sent')), 'a late sent');
    await runDueJobs();
    const recorded = (await sendJobs(floor.restaurant._id))[0];
    assert.equal(recorded.result.deliveryStatus, 'DELIVERED', 'a late "sent" never moves it back');

    // No event line holds the guest's number.
    const lines = JSON.stringify(await IntegrationEvent.find({ restaurantId: floor.restaurant._id }).lean());
    assert.equal(lines.includes(GUEST), false);
  });

  it('sends nothing for a guest with no phone, a voided bill, a No Charge order, a platform order, or with the setting off', async () => {
    const floor = await seedFloor();
    await connectWhatsApp(floor.tokens);
    await approvedReceipt(floor.tokens);
    const tables = [floor.table];
    for (const name of ['T2', 'T3', 'T4']) tables.push(ok(await request('POST', '/api/v1/tables', { token: floor.tokens.OWNER, body: { name } }), name));
    const at = (index) => ({ ...floor, table: tables[index] });

    // No phone.
    ok(await payInCash(floor, await billForGuest(at(0), { phone: null })), 'pay without a phone');
    // A voided bill is never paid.
    const voided = await billForGuest(at(1));
    ok(await request('POST', `/api/v1/bills/${voided.id}/void`, { token: floor.tokens.MANAGER, body: { reasonCode: 'WRONG_TABLE' } }), 'void');
    // A No Charge order has no bill at all.
    const free = ok(await openOrder(floor.tokens.WAITER, { tableId: tables[2].id, guestCount: 1, customerName: 'Asha Patel', customerPhone: GUEST, lines: [{ menuItemId: floor.item.id, quantity: 1 }] }), 'open');
    const sentFree = ok(await fireOrder(floor.tokens.WAITER, free.id, free.version), 'send it');
    ok(await request('POST', `/api/v1/orders/${free.id}/no-charge`, { token: floor.tokens.MANAGER, body: { version: sentFree.order.version, reasonCode: 'STAFF_MEAL' } }), 'no charge');
    assert.equal((await settle(floor.restaurant._id, 1)).length, 0);

    // A platform order's bill, paid: the platform has the guest, not us.
    const paidPlatform = await queueBillReceipt({ status: 'PAID', isVoided: false, platform: { code: 'ZOMATO', orderId: '1' }, restaurantId: floor.restaurant._id, branchId: floor.branch._id, _id: new mongoose.Types.ObjectId() });
    assert.equal(paidPlatform, null);

    // With the setting off, a paid bill with a phone sends nothing.
    ok(await request('PUT', '/api/v1/integrations/WHATSAPP', { token: floor.tokens.OWNER, body: { environment: 'SANDBOX', credentials: {}, config: { apiBaseUrl: meta.url, sendBillOnPayment: false } } }), 'off');
    ok(await payInCash(floor, await billForGuest(at(3))), 'pay with the setting off');
    assert.equal((await settle(floor.restaurant._id, 1)).length, 0);
  });

  it('never queues for a payment whose transaction rolled back', async () => {
    const floor = await seedFloor();
    await connectWhatsApp(floor.tokens);
    await approvedReceipt(floor.tokens);
    const bill = await billForGuest(floor);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const doc = await Bill.findOne({ restaurantId: floor.restaurant._id, _id: bill.id }).session(session);
        doc.status = 'PAID';
        doc.paidAt = new Date();
        await doc.save({ session });
        throw new Error('rolled back on purpose');
      });
    } catch (error) {
      assert.match(error.message, /rolled back on purpose/);
    } finally {
      await session.endSession();
    }
    assert.equal((await settle(floor.restaurant._id, 1)).length, 0);
    assert.equal((await Bill.findOne({ restaurantId: floor.restaurant._id, _id: bill.id }).lean()).status, 'UNPAID');
  });

  it('never fails the payment when WhatsApp cannot be reached', async () => {
    const floor = await seedFloor();
    await connectWhatsApp(floor.tokens);
    await approvedReceipt(floor.tokens);
    meta.state.down = true;
    const bill = await billForGuest(floor);
    const paid = await payInCash(floor, bill);
    assert.equal(paid.status, 200);
    assert.equal(paid.body.data.status, 'PAID');
    await settle(floor.restaurant._id, 1);
    const ran = await runDueJobs();
    assert.equal(ran[0].status, 'FAILED', 'retried later on the ladder');
  });
});

describe('STOP and delivery failures', () => {
  it('withdraws offers consent at once, with a history entry, replies once, and still sends the bill', async () => {
    const floor = await seedFloor();
    const key = await connectWhatsApp(floor.tokens);
    await approvedReceipt(floor.tokens);
    const bill = await billForGuest(floor, { offersConsent: true });
    let guest = await Customer.findOne({ restaurantId: floor.restaurant._id, phone: GUEST }).lean();
    assert.equal(guest.offers.given, true);

    ok(await postWebhook(key, replyPayload(' stop ')), 'STOP');
    ok(await postWebhook(key, replyPayload(' stop ')), 'the same message again');
    await runDueJobs();
    guest = await Customer.findOne({ restaurantId: floor.restaurant._id, phone: GUEST }).lean();
    assert.equal(guest.offers.given, false);
    const last = guest.offersHistory.at(-1);
    assert.deepEqual([last.given, last.source, last.reason, last.by], [false, 'ONLINE', 'Replied STOP on WhatsApp', null]);

    await runDueJobs();
    const replies = meta.state.messages.filter((message) => message.type === 'text');
    assert.equal(replies.length, 1, 'told once');
    assert.match(replies[0].text.body, /offers/);

    // Opting out of offers does not stop the bill.
    ok(await payInCash(floor, bill), 'pay');
    await settle(floor.restaurant._id, 1);
    await runDueJobs();
    assert.equal(meta.state.messages.filter((message) => message.type === 'template').length, 1);
  });

  it('refuses a webhook with a bad signature, and marks a number not on WhatsApp unreachable', async () => {
    const floor = await seedFloor();
    const key = await connectWhatsApp(floor.tokens);
    await approvedReceipt(floor.tokens);
    assert.equal((await postWebhook(key, replyPayload('STOP'), { secret: 'fake-wrong-secret-not-real-00' })).status, 401);

    const bill = await billForGuest(floor);
    ok(await payInCash(floor, bill), 'pay');
    await settle(floor.restaurant._id, 1);
    await runDueJobs();
    const sent = (await sendJobs(floor.restaurant._id))[0];
    ok(await postWebhook(key, statusPayload(sent.result.messageId, 'failed', [{ code: 131026, title: 'Message undeliverable' }])), 'failed');
    await runDueJobs();
    const guest = await Customer.findOne({ restaurantId: floor.restaurant._id, phone: GUEST }).lean();
    assert.ok(guest.whatsappUnreachableAt, 'nothing more is tried');
    const ctx = { restaurantId: floor.restaurant._id, branchId: floor.branch._id };
    assert.deepEqual(await sendTemplate({ ...ctx, phone: GUEST, templateKey: 'BILL_RECEIPT', variables: { restaurantName: 'A', billNumber: 'B', billTotal: 'C' }, idempotencyKey: 'another' }), { queued: false, skipped: 'UNREACHABLE' });
  });
});

describe('the golden day', () => {
  it('paying B05 queues exactly one receipt, for ₹795.00, and paying again queues none', async () => {
    const golden = await setupGoldenRestaurant({ name: 'Golden Day Cafe' });
    const { tokens, people, ids } = golden;
    await connectWhatsApp(tokens);
    await approvedReceipt(tokens);
    const b05 = GOLDEN_BILLS.find((entry) => entry.id === 'B05');
    const opened = ok(
      await request('POST', '/api/v1/orders', {
        token: people[b05.captain],
        body: { orderType: 'DINE_IN', tableId: ids.tables[b05.table], guestCount: b05.covers, customerName: 'Asha Patel', customerPhone: GUEST, lines: b05.items.map((name) => ({ menuItemId: ids.items[name], quantity: 1 })) },
      }),
      'open B05',
    );
    const fired = ok(await fireOrder(people[b05.captain], opened.id, opened.version), 'fire');
    for (const kot of fired.kots) ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: tokens.MANAGER }), 'ready');
    const order = ok(await request('GET', `/api/v1/orders/${opened.id}`, { token: tokens.CASHIER }), 'read');
    const bill = ok(await request('POST', '/api/v1/bills', { token: tokens.CASHIER, body: { orderId: order.id, version: order.version } }), 'bill B05');
    assert.equal(bill.grandTotalInPaise, 79500);
    for (const [method, amountInPaise] of b05.payments) {
      ok(await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: tokens.CASHIER, body: { method, amountInPaise } }), 'pay B05');
    }
    const jobs = await settle(golden.restaurant._id, 1);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].payload.parameters[2], '₹795.00');
    assert.notEqual((await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: tokens.CASHIER, body: { method: 'CASH', amountInPaise: 100 } })).status, 200);
    assert.equal((await settle(golden.restaurant._id, 2)).length, 1);
  });
});

