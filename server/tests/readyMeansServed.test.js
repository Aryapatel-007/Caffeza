/**
 * P29 Part C: the kitchen's ready means served.
 * docs/API-CONTRACT.md M2 sections 12.7 and 13, DB-SCHEMA section 43.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ALL_MODELS } from '../models/index.js';
import { Order } from '../models/Order.js';
import { Restaurant } from '../models/Restaurant.js';
import { migrateReadyToServed } from '../scripts/migrateReadyToServed.js';
import { computeDayFigures } from '../services/dayFiguresService.js';
import { resetClockForTests } from '../utils/time.js';
import { buildGoldenDay, GOLDEN_DATE, GOLDEN_EXPECTED } from './helpers/goldenDay.js';
import { createMenuItem, fireOrder, openOrder, readOrder, seedFloor } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
});

after(async () => {
  resetClockForTests();
  await stopTestServer();
  await stopTestDatabase();
});

const ok = (response, what) => {
  assert.ok(response.status >= 200 && response.status < 300, `${what}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data;
};
const setReadyMeansServed = (floor, value) =>
  request('PATCH', '/api/v1/settings', { token: floor.tokens.OWNER, body: { reason: 'P29 test', kitchen: { readyMeansServed: value } } });

/** A table's order of two dishes, fired. Returns the order and its ticket. */
async function firedTwoDishes(floor) {
  const second = ok(await createMenuItem(floor.tokens.OWNER, { name: `Dish ${Math.random().toString(36).slice(2, 7)}` }), 'dish');
  const opened = ok(
    await openOrder(floor.tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: floor.item.id, quantity: 1 }, { menuItemId: second.id, quantity: 1 }] }),
    'open',
  );
  const fired = ok(await fireOrder(floor.tokens.WAITER, opened.id, opened.version), 'fire');
  return { orderId: opened.id, kot: fired.kot };
}

describe('with the setting on, the default', () => {
  it('serves a line when the kitchen marks it ready, and readies the order with the last one', async () => {
    const floor = await seedFloor();
    const { orderId, kot } = await firedTwoDishes(floor);

    ok(await request('PATCH', `/api/v1/kots/${kot.id}/lines/${kot.lines[0].id}/ready`, { token: floor.tokens.KITCHEN }), 'first');
    let order = ok(await readOrder(floor.tokens.WAITER, orderId), 'read');
    const first = order.lines.find((line) => line.id === kot.lines[0].orderLineId);
    assert.equal(first.status, 'SERVED');
    assert.equal(first.readyAt, first.servedAt);
    assert.equal(order.status, 'OPEN');

    ok(await request('PATCH', `/api/v1/kots/${kot.id}/lines/${kot.lines[1].id}/ready`, { token: floor.tokens.KITCHEN }), 'second');
    order = ok(await readOrder(floor.tokens.WAITER, orderId), 'read');
    assert.ok(order.lines.every((line) => line.status === 'SERVED'));
    assert.equal(order.status, 'READY_TO_BILL');
    assert.ok(order.readyToBillAt);

    // No served step: the counter bills it straight away.
    const bill = ok(await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId, version: order.version } }), 'bill');
    assert.equal(bill.status, 'UNPAID');
  });

  it('answers the old served call on a served line with the order, unchanged', async () => {
    const floor = await seedFloor();
    const { orderId, kot } = await firedTwoDishes(floor);
    ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: floor.tokens.KITCHEN }), 'ready');
    const order = ok(await readOrder(floor.tokens.WAITER, orderId), 'read');
    const served = await request('PATCH', `/api/v1/orders/${orderId}/lines/${order.lines[0].id}/served`, { token: floor.tokens.WAITER, body: { version: order.version } });
    assert.equal(served.status, 200, JSON.stringify(served.body));
    assert.equal(served.body.data.version, order.version);
  });

  it('cancels a made dish on an order waiting to be billed, before any bill, and reopens it when nothing is left', async () => {
    const floor = await seedFloor();
    const { orderId, kot } = await firedTwoDishes(floor);
    ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: floor.tokens.KITCHEN }), 'ready');
    let order = ok(await readOrder(floor.tokens.WAITER, orderId), 'read');
    assert.equal(order.status, 'READY_TO_BILL');

    const cancel = (line) =>
      request('POST', `/api/v1/orders/${orderId}/lines/${line.id}/cancel`, {
        token: floor.tokens.OWNER,
        body: { version: order.version, reasonCode: 'MODIFICATION', wasPrepared: true },
      });
    order = ok(await cancel(order.lines[0]), 'cancel the first');
    assert.equal(order.lines[0].status, 'CANCELLED');
    assert.equal(order.status, 'READY_TO_BILL');

    order = ok(await cancel(order.lines[1]), 'cancel the second');
    assert.equal(order.status, 'OPEN');
    assert.equal(order.readyToBillAt, null);
  });

  it('with the setting off, still refuses a cancel on an order waiting to be billed', async () => {
    const floor = await seedFloor();
    ok(await setReadyMeansServed(floor, false), 'setting off');
    const { orderId, kot } = await firedTwoDishes(floor);
    ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: floor.tokens.KITCHEN }), 'ready');
    let order = ok(await readOrder(floor.tokens.WAITER, orderId), 'read');
    for (const line of order.lines) {
      order = ok(await request('PATCH', `/api/v1/orders/${orderId}/lines/${line.id}/served`, { token: floor.tokens.WAITER, body: { version: order.version } }), 'served');
    }
    assert.equal(order.status, 'READY_TO_BILL');
    const refused = await request('POST', `/api/v1/orders/${orderId}/lines/${order.lines[0].id}/cancel`, {
      token: floor.tokens.OWNER,
      body: { version: order.version, reasonCode: 'MODIFICATION', wasPrepared: true },
    });
    assert.equal(refused.status, 422, JSON.stringify(refused.body));
  });
});

describe('with the setting off', () => {
  it('behaves exactly as before: ready is READY, and serving the last line readies the order', async () => {
    const floor = await seedFloor();
    ok(await setReadyMeansServed(floor, false), 'off');
    const { orderId, kot } = await firedTwoDishes(floor);
    ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: floor.tokens.KITCHEN }), 'ready');
    let order = ok(await readOrder(floor.tokens.WAITER, orderId), 'read');
    assert.ok(order.lines.every((line) => line.status === 'READY'));
    assert.equal(order.status, 'OPEN');

    for (const line of order.lines) {
      order = ok(await request('PATCH', `/api/v1/orders/${orderId}/lines/${line.id}/served`, { token: floor.tokens.WAITER, body: { version: order.version } }), 'serve');
    }
    assert.equal(order.status, 'READY_TO_BILL');
    const again = await request('PATCH', `/api/v1/orders/${orderId}/lines/${order.lines[0].id}/served`, { token: floor.tokens.WAITER, body: { version: order.version } });
    assert.equal(again.status, 422, 'served twice is still refused with the setting off');
  });
});

describe('npm run migrate:ready-to-served', () => {
  it('changes nothing on a dry run, then serves the ready lines and readies the order', async () => {
    const floor = await seedFloor();
    ok(await setReadyMeansServed(floor, false), 'off');
    const { orderId, kot } = await firedTwoDishes(floor);
    ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: floor.tokens.KITCHEN }), 'ready');
    // A restaurant switched on after its kitchen had marked these ready.
    await Restaurant.updateOne({ _id: floor.restaurant._id }, { $set: { 'settings.kitchen.readyMeansServed': true } });

    const dry = await migrateReadyToServed();
    const mine = dry.restaurants.find((row) => row.restaurantId === String(floor.restaurant._id));
    assert.deepEqual({ lines: mine.linesServed, orders: mine.ordersReadyToBill }, { lines: 2, orders: 1 });
    let order = await Order.findOne({ restaurantId: floor.restaurant._id, _id: orderId }).lean();
    assert.ok(order.lines.every((line) => line.status === 'READY'));
    assert.equal(order.status, 'OPEN');

    await migrateReadyToServed({ apply: true });
    order = await Order.findOne({ restaurantId: floor.restaurant._id, _id: orderId }).lean();
    assert.ok(order.lines.every((line) => line.status === 'SERVED' && line.servedAt));
    assert.equal(order.status, 'READY_TO_BILL');

    const second = await migrateReadyToServed({ apply: true });
    assert.equal(second.restaurants.find((row) => row.restaurantId === String(floor.restaurant._id)), undefined, 'a second run finds nothing');
  });
});

describe('the golden day with the setting off', () => {
  it('still produces every expected figure through the two-step flow', async () => {
    const golden = await buildGoldenDay({ name: 'Two Step Cafe', readyMeansServed: false });
    const figures = await computeDayFigures({ restaurantId: golden.restaurant._id, branchId: golden.branch._id }, GOLDEN_DATE);
    assert.deepEqual(figures.sales, GOLDEN_EXPECTED.sales);
    for (const [code, amount] of Object.entries(GOLDEN_EXPECTED.methods)) {
      assert.equal(figures.money.methods.find((row) => row.method === code)?.amountInPaise ?? 0, amount, code);
    }
  });
});
