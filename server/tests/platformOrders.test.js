/**
 * P25 Part H: delivery platform orders through the sandbox platform.
 * docs/API-CONTRACT.md M21 section 7.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { AuditLog } from '../models/AuditLog.js';
import { ALL_MODELS } from '../models/index.js';
import { IntegrationEvent } from '../models/IntegrationEvent.js';
import { IntegrationJob } from '../models/IntegrationJob.js';
import { Kot } from '../models/Kot.js';
import { Order } from '../models/Order.js';
import { PlatformOrder } from '../models/PlatformOrder.js';
import { User } from '../models/User.js';
import { signSandboxBody } from '../services/integrations/channels/sandbox.js';
import { runDueJobs } from '../services/integrations/jobRunner.js';
import '../services/integrations/platformOrderService.js';
import { setupGoldenRestaurant } from './helpers/goldenDay.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const SECRET = 'sandbox-secret-0123456789';
let baseUrl;
let worldCounter = 0;

before(async () => {
  await startTestDatabase();
  baseUrl = await startTestServer();
  for (const model of ALL_MODELS) await model.init();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

/** A restaurant with the golden menu, a sandbox platform acting as Zomato, and two dishes mapped. */
async function world({ config = {}, mapAll = true } = {}) {
  worldCounter += 1;
  const golden = await setupGoldenRestaurant({ name: `Sandbox Cafe ${worldCounter}` });
  const owner = golden.tokens.OWNER;
  const saved = await request('PUT', '/api/v1/integrations/SANDBOX_PLATFORM', {
    token: owner,
    body: { environment: 'SANDBOX', credentials: { webhookSecret: SECRET }, config: { actsAs: 'ZOMATO', ...config } },
  });
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  const tested = await request('POST', '/api/v1/integrations/SANDBOX_PLATFORM/test', { token: owner });
  assert.equal(tested.body.data.status, 'ACTIVE');
  const items = golden.ids.items;
  const map = (externalItemId, menuItemId) =>
    request('PUT', '/api/v1/integrations/SANDBOX_PLATFORM/item-mappings', { token: golden.tokens.MANAGER, body: { externalItemId, menuItemId } });
  if (mapAll) {
    assert.equal((await map('zo-ferrero', items['Ferrero Hazelnut Shake'])).status, 200);
    assert.equal((await map('zo-pav-sandwich', items['Masala Pav Sandwich'])).status, 200);
  }
  return { ...golden, owner, webhookUrl: saved.body.data.webhookUrl, map };
}

let orderCounter = 0;
/** B08's two dishes as a Zomato order, at the platform's prices. */
function b08Order(overrides = {}) {
  orderCounter += 1;
  return {
    platformOrderId: `864593${String(orderCounter).padStart(4, '0')}`,
    customerName: 'Guest',
    items: [
      { externalItemId: 'zo-ferrero', name: 'Ferrero Hazelnut Shake', quantity: 1, unitPriceInPaise: 33000, addOns: [] },
      { externalItemId: 'zo-pav-sandwich', name: 'Masala Pav Sandwich', quantity: 1, unitPriceInPaise: 17500, addOns: [] },
    ],
    packagingChargeInPaise: 0,
    merchantDiscountInPaise: 20000,
    platformDiscountInPaise: 0,
    totalInPaise: 30500,
    paymentMode: 'PREPAID',
    deliveredBy: 'PLATFORM',
    ...overrides,
  };
}

async function send(w, body) {
  const text = JSON.stringify(body);
  const response = await fetch(`${baseUrl}${new URL(w.webhookUrl).pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sandbox-signature': signSandboxBody(Buffer.from(text), SECRET) },
    body: text,
  });
  assert.equal(response.status, 200, await response.text());
  await runDueJobs();
}

const placed = (w, order) => send(w, { type: 'ORDER_PLACED', order });
const platformOrder = (w, platformOrderId) => PlatformOrder.findOne({ restaurantId: w.restaurant._id, platformOrderId }).lean();
const accept = (w, id, body = {}, token = w.tokens.CASHIER) => request('POST', `/api/v1/platform-orders/${id}/accept`, { token, body });

describe('a platform order, from arrival to paid', () => {
  it('waits with auto-accept off, then on Accept becomes a fired DELIVERY order at the platform’s prices', async () => {
    const w = await world();
    const order = b08Order();
    await placed(w, order);
    const record = await platformOrder(w, order.platformOrderId);
    assert.equal(record.status, 'RECEIVED');
    assert.equal(await Order.countDocuments({ restaurantId: w.restaurant._id, 'platform.orderId': order.platformOrderId }), 0);

    const inbox = (await request('GET', '/api/v1/online/inbox', { token: w.tokens.CASHIER })).body.data;
    assert.equal(inbox.waitingPlatformOrders, 1);
    assert.equal(inbox.latest.kind, 'PLATFORM_ORDER');

    const accepted = await accept(w, String(record._id), { prepMinutes: 15 });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.data.status, 'ACCEPTED');

    const ours = await Order.findOne({ restaurantId: w.restaurant._id, _id: accepted.body.data.orderId }).lean();
    assert.equal(ours.orderType, 'DELIVERY');
    assert.deepEqual({ code: ours.platform.code, orderId: ours.platform.orderId }, { code: 'ZOMATO', orderId: order.platformOrderId });
    assert.equal(ours.origin.kind, 'PLATFORM_ORDER');
    assert.ok(ours.lines.every((line) => line.priceSource === 'PLATFORM'));
    assert.deepEqual(ours.lines.map((line) => line.unitPriceInPaise), [33000, 17500]);
    assert.ok(ours.lines.every((line) => line.status === 'FIRED'));
    assert.ok((await Kot.countDocuments({ restaurantId: w.restaurant._id, orderId: ours._id })) >= 1);

    const out = await IntegrationEvent.findOne({ restaurantId: w.restaurant._id, direction: 'OUT', kind: 'acceptOrder' }).lean();
    assert.equal(out.externalId, order.platformOrderId);
    assert.equal((await accept(w, String(record._id))).status, 409);
  });

  it('bills golden day B08 on pickup: ₹200.00 merchant discount, ₹305.00 paid by Zomato, shares ₹130.69 and ₹69.31', async () => {
    const w = await world();
    const order = b08Order();
    await placed(w, order);
    const record = await platformOrder(w, order.platformOrderId);
    await accept(w, String(record._id));

    await send(w, { type: 'ORDER_PICKED_UP', platformOrderId: order.platformOrderId });
    const picked = await platformOrder(w, order.platformOrderId);
    assert.equal(picked.status, 'PICKED_UP');
    assert.equal(picked.amountMismatch, null);

    const bill = (await request('GET', `/api/v1/bills/${picked.billId}`, { token: w.tokens.OWNER })).body.data;
    assert.equal(bill.subtotalInPaise, 50500);
    assert.equal(bill.discount.amountInPaise, 20000);
    assert.equal(bill.discount.reasonCode, 'MERCHANT_PROMO');
    assert.equal(bill.discount.fundedBy, 'RESTAURANT');
    assert.equal(bill.totalTaxInPaise, 0);
    assert.equal(bill.grandTotalInPaise, 30500);
    assert.deepEqual(bill.lines.map((line) => line.discountShareInPaise), [13069, 6931]);
    assert.equal(bill.status, 'PAID');
    assert.deepEqual(bill.payments.map((payment) => [payment.method, payment.amountInPaise]), [['ZOMATO', 30500]]);

    const day = (await request('GET', `/api/v1/day-close/${bill.businessDate}`, { token: w.tokens.OWNER })).body.data;
    for (const id of ['C1', 'C2', 'C3', 'C4']) assert.equal(day.checks.find((check) => check.id === id).passed, true, id);
  });

  it('accepts and fires with no person when auto-accept is on, as the integration user', async () => {
    const w = await world({ config: { autoAccept: true } });
    const order = b08Order({ merchantDiscountInPaise: 0, totalInPaise: 50500 });
    await placed(w, order);
    const record = await platformOrder(w, order.platformOrderId);
    assert.equal(record.status, 'ACCEPTED');
    const ours = await Order.findOne({ restaurantId: w.restaurant._id, _id: record.orderId }).lean();
    const captain = await User.findOne({ restaurantId: w.restaurant._id, _id: ours.openedBy }).lean();
    assert.equal(captain.isSystem, true);
    assert.equal(captain.name, 'Sandbox platform (automatic)');
    assert.ok(ours.lines.every((line) => line.status === 'FIRED'));
  });

  it('needs attention for an unmapped item, refuses to accept, then accepts once it is mapped', async () => {
    const w = await world({ mapAll: false });
    await w.map('zo-ferrero', w.ids.items['Ferrero Hazelnut Shake']);
    const order = b08Order();
    await placed(w, order);
    const record = await platformOrder(w, order.platformOrderId);
    assert.equal(record.status, 'NEEDS_ATTENTION');
    assert.deepEqual(record.attentionReasons, ['UNMAPPED_ITEMS']);

    const unmapped = (await request('GET', '/api/v1/integrations/SANDBOX_PLATFORM/item-mappings/unmapped', { token: w.tokens.MANAGER })).body.data;
    assert.deepEqual(unmapped.map((item) => item.externalItemId), ['zo-pav-sandwich']);

    const refused = await accept(w, String(record._id));
    assert.equal(refused.status, 422);
    await w.map('zo-pav-sandwich', w.ids.items['Masala Pav Sandwich']);
    const accepted = await accept(w, String(record._id));
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  });

  it('makes one order from a webhook sent twice', async () => {
    const w = await world();
    const order = b08Order();
    await placed(w, order);
    await placed(w, order);
    assert.equal(await PlatformOrder.countDocuments({ restaurantId: w.restaurant._id, platformOrderId: order.platformOrderId }), 1);
    assert.ok(await IntegrationEvent.exists({ restaurantId: w.restaurant._id, outcome: 'DUPLICATE' }));
  });

  it('creates nothing when the platform refuses the accept, and says why', async () => {
    const w = await world({ config: { failCalls: ['acceptOrder'] } });
    const order = b08Order();
    await placed(w, order);
    const record = await platformOrder(w, order.platformOrderId);
    const refused = await accept(w, String(record._id));
    assert.equal(refused.status, 502);
    assert.equal(refused.body.error.code, 'PARTNER_CALL_FAILED');
    assert.equal((await platformOrder(w, order.platformOrderId)).status, 'RECEIVED');
    assert.equal(await Order.countDocuments({ restaurantId: w.restaurant._id, 'platform.orderId': order.platformOrderId }), 0);
  });

  it('rejects with a reason, tells the platform, and writes the audit line', async () => {
    const w = await world();
    const order = b08Order();
    await placed(w, order);
    const record = await platformOrder(w, order.platformOrderId);
    const rejected = await request('POST', `/api/v1/platform-orders/${record._id}/reject`, { token: w.tokens.CASHIER, body: { reasonCode: 'KITCHEN_BUSY' } });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
    assert.equal(rejected.body.data.status, 'REJECTED');
    assert.ok(await AuditLog.exists({ restaurantId: w.restaurant._id, action: 'PLATFORM_ORDER_REJECTED' }));
    assert.equal((await request('POST', `/api/v1/platform-orders/${record._id}/reject`, { token: w.tokens.WAITER, body: { reasonCode: 'KITCHEN_BUSY' } })).status, 403);
  });
});

describe('cancelled by the platform', () => {
  it('cancels an order before firing, after firing with what was made, and voids it after billing', async () => {
    const before = await world({ config: { autoFire: false } });
    const first = b08Order();
    await placed(before, first);
    await accept(before, String((await platformOrder(before, first.platformOrderId))._id));
    await send(before, { type: 'ORDER_CANCELLED', platformOrderId: first.platformOrderId });
    const notFired = await platformOrder(before, first.platformOrderId);
    assert.equal(notFired.status, 'CANCELLED_BY_PLATFORM');
    const firstOrder = await Order.findOne({ restaurantId: before.restaurant._id, _id: notFired.orderId }).lean();
    assert.equal(firstOrder.status, 'CANCELLED');
    assert.equal(firstOrder.cancelReasonCode, 'PLATFORM_CANCELLED');

    const w = await world();
    const second = b08Order();
    await placed(w, second);
    const record = await platformOrder(w, second.platformOrderId);
    await accept(w, String(record._id));
    const fired = await Order.findOne({ restaurantId: w.restaurant._id, _id: (await platformOrder(w, second.platformOrderId)).orderId }).lean();
    // The kitchen makes the shake; the sandwich is still cooking when the platform cancels.
    const kot = await Kot.findOne({ restaurantId: w.restaurant._id, orderId: fired._id, 'lines.orderLineId': fired.lines[0]._id }).lean();
    const kotLine = kot.lines.find((line) => String(line.orderLineId) === String(fired.lines[0]._id));
    await request('PATCH', `/api/v1/kots/${kot._id}/lines/${kotLine._id}/ready`, { token: w.tokens.MANAGER });
    await send(w, { type: 'ORDER_CANCELLED', platformOrderId: second.platformOrderId });
    const cancelled = await Order.findOne({ restaurantId: w.restaurant._id, _id: fired._id }).lean();
    assert.equal(cancelled.status, 'CANCELLED');
    assert.deepEqual(cancelled.lines.map((line) => line.wasPrepared), [true, false]);

    const third = b08Order();
    await placed(w, third);
    await accept(w, String((await platformOrder(w, third.platformOrderId))._id));
    await send(w, { type: 'ORDER_PICKED_UP', platformOrderId: third.platformOrderId });
    const billed = await platformOrder(w, third.platformOrderId);
    await send(w, { type: 'ORDER_CANCELLED', platformOrderId: third.platformOrderId });
    const bill = (await request('GET', `/api/v1/bills/${billed.billId}`, { token: w.tokens.OWNER })).body.data;
    assert.equal(bill.isVoided, true);
    assert.equal(bill.voidReasonCode, 'PLATFORM_CANCELLED');
    assert.equal((await platformOrder(w, third.platformOrderId)).status, 'CANCELLED_BY_PLATFORM');
  });

  it('changes nothing on a closed day, and asks a person to look', async () => {
    const w = await world();
    const order = b08Order();
    await placed(w, order);
    await accept(w, String((await platformOrder(w, order.platformOrderId))._id));
    await send(w, { type: 'ORDER_PICKED_UP', platformOrderId: order.platformOrderId });
    const billed = await platformOrder(w, order.platformOrderId);
    const bill = (await request('GET', `/api/v1/bills/${billed.billId}`, { token: w.tokens.OWNER })).body.data;
    const close = await request('POST', '/api/v1/day-close', { token: w.tokens.OWNER, body: { businessDate: bill.businessDate, countedCashInPaise: 0 } });
    assert.equal(close.status, 201, JSON.stringify(close.body));

    await send(w, { type: 'ORDER_CANCELLED', platformOrderId: order.platformOrderId });
    const after = await platformOrder(w, order.platformOrderId);
    assert.equal(after.status, 'NEEDS_ATTENTION');
    assert.ok(after.attentionReasons.includes('DAY_CLOSED'));
    assert.equal((await request('GET', `/api/v1/bills/${billed.billId}`, { token: w.tokens.OWNER })).body.data.isVoided, false);
  });
});

describe('around a platform order', () => {
  it('queues one availability call per active channel where a dish is mapped, and none for an unmapped dish', async () => {
    const w = await world();
    const shake = w.ids.items['Ferrero Hazelnut Shake'];
    const before = await IntegrationJob.countDocuments({ restaurantId: w.restaurant._id, type: 'CHANNEL_CALL' });
    await request('PATCH', `/api/v1/menu-items/${shake}/availability`, { token: w.tokens.CASHIER, body: { isAvailable: false } });
    const jobs = await IntegrationJob.find({ restaurantId: w.restaurant._id, type: 'CHANNEL_CALL', 'payload.call': 'setItemAvailability' }).lean();
    assert.equal(jobs.length - before, 1);
    assert.deepEqual(jobs[0].payload.args.items, [{ externalItemId: 'zo-ferrero', externalVariantId: null, available: false }]);

    await request('PATCH', `/api/v1/menu-items/${w.ids.items['Masala Tea']}/availability`, { token: w.tokens.CASHIER, body: { isAvailable: false } });
    assert.equal(await IntegrationJob.countDocuments({ restaurantId: w.restaurant._id, type: 'CHANNEL_CALL', 'payload.call': 'setItemAvailability' }), 1);
  });

  it('tells the platform the food is ready once every line is, exactly once', async () => {
    const w = await world();
    const order = b08Order();
    await placed(w, order);
    await accept(w, String((await platformOrder(w, order.platformOrderId))._id));
    const kots = await Kot.find({ restaurantId: w.restaurant._id, orderId: (await platformOrder(w, order.platformOrderId)).orderId }).lean();
    for (const kot of kots) await request('PATCH', `/api/v1/kots/${kot._id}/ready`, { token: w.tokens.MANAGER });
    const ready = await IntegrationJob.find({ restaurantId: w.restaurant._id, 'payload.call': 'markFoodReady' }).lean();
    assert.equal(ready.length, 1);
  });

  it('waits a minute before telling the platform, so a kitchen undo inside it stops the call (P29 Part E)', async () => {
    const w = await world();
    const order = b08Order();
    await placed(w, order);
    await accept(w, String((await platformOrder(w, order.platformOrderId))._id));
    const kots = await Kot.find({ restaurantId: w.restaurant._id, orderId: (await platformOrder(w, order.platformOrderId)).orderId }).lean();
    for (const kot of kots) await request('PATCH', `/api/v1/kots/${kot._id}/ready`, { token: w.tokens.MANAGER });

    const queued = await IntegrationJob.findOne({ restaurantId: w.restaurant._id, 'payload.call': 'markFoodReady' }).lean();
    assert.equal(queued.status, 'QUEUED');
    assert.ok(queued.runAfter.getTime() - Date.now() > 50_000, 'queued about a minute ahead');
    await runDueJobs();
    assert.equal((await IntegrationJob.findOne({ restaurantId: w.restaurant._id, _id: queued._id }).lean()).status, 'QUEUED', 'not run before its minute');

    const undone = await request('POST', `/api/v1/kots/${kots[0]._id}/undo-ready`, { token: w.tokens.MANAGER });
    assert.equal(undone.status, 200, JSON.stringify(undone.body));
    assert.equal(undone.body.data.platformAlreadyTold, false);
    const stopped = await IntegrationJob.findOne({ restaurantId: w.restaurant._id, _id: queued._id }).lean();
    assert.equal(stopped.status, 'CANCELLED');
    assert.match(stopped.dedupeKey, /:cancelled:/);

    // Ready again: a fresh call is queued, and this time it runs.
    await request('PATCH', `/api/v1/kots/${kots[0]._id}/ready`, { token: w.tokens.MANAGER });
    const again = await IntegrationJob.find({ restaurantId: w.restaurant._id, 'payload.call': 'markFoodReady', status: 'QUEUED' }).lean();
    assert.equal(again.length, 1);
    await runDueJobs({ now: new Date(Date.now() + 120_000) });
    assert.equal((await IntegrationJob.findOne({ restaurantId: w.restaurant._id, _id: again[0]._id }).lean()).status, 'DONE');

    // After the call ran, an undo still works here, says so, and the call is not repeated.
    const late = await request('POST', `/api/v1/kots/${kots[0]._id}/undo-ready`, { token: w.tokens.MANAGER });
    assert.equal(late.status, 200);
    assert.equal(late.body.data.platformAlreadyTold, true);
    await request('PATCH', `/api/v1/kots/${kots[0]._id}/ready`, { token: w.tokens.MANAGER });
    assert.equal(await IntegrationJob.countDocuments({ restaurantId: w.restaurant._id, 'payload.call': 'markFoodReady', status: { $ne: 'CANCELLED' } }), 1);
  });

  it('blocks Day Close while an accepted order has not been picked up', async () => {
    const w = await world();
    const order = b08Order();
    await placed(w, order);
    await accept(w, String((await platformOrder(w, order.platformOrderId))._id));
    const record = await platformOrder(w, order.platformOrderId);
    const close = await request('POST', '/api/v1/day-close', { token: w.tokens.OWNER, body: { businessDate: record.businessDate, countedCashInPaise: 0 } });
    assert.equal(close.status, 422);
    assert.ok(close.body.error.blockers.some((blocker) => blocker.kind === 'PLATFORM_ORDER'));
  });

  it('never lets a client send the platform’s prices on its own order', async () => {
    const w = await world();
    const sneaky = await request('POST', '/api/v1/orders', {
      token: w.tokens.CASHIER,
      body: { orderType: 'TAKEAWAY', platformPrices: true, lines: [{ menuItemId: w.ids.items['Masala Tea'], quantity: 1, platformUnitPriceInPaise: 1 }] },
    });
    assert.equal(sneaky.status, 400);
  });
});
