/**
 * Recall Bill by number, and extras typed at the table. P48, API-CONTRACT P48.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ALL_MODELS } from '../models/index.js';
import { buildLineSnapshots } from '../services/orderService.js';
import { fireOrder, openOrder, readyToBillOrder, seedFloor } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

const ok = (response, what) => {
  assert.ok(response.status >= 200 && response.status < 300, `${what}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data;
};

describe('Recall Bill: GET /bills?number=', () => {
  it('finds a bill by the number after the series, voided ones too, and only this restaurant\'s', async () => {
    const floor = await seedFloor();
    const order = await readyToBillOrder(floor);
    const bill = ok(await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: order.id, version: order.version } }), 'bill');
    const sequence = Number(bill.billNumber.split('/').at(-1));

    const found = ok(await request('GET', `/api/v1/bills?number=${sequence}`, { token: floor.tokens.CASHIER }), 'recall');
    assert.deepEqual(found.map((entry) => entry.id), [bill.id]);

    ok(await request('POST', `/api/v1/bills/${bill.id}/void`, { token: floor.tokens.MANAGER, body: { reasonCode: 'OTHER', note: 'P48 test' } }), 'void');
    const voided = ok(await request('GET', `/api/v1/bills?number=${sequence}`, { token: floor.tokens.CASHIER }), 'recall voided');
    assert.equal(voided[0].isVoided, true, 'a cancelled bill is found too');

    const other = await seedFloor();
    const none = ok(await request('GET', `/api/v1/bills?number=${sequence}`, { token: other.tokens.CASHIER }), 'other restaurant');
    assert.ok(!none.some((entry) => entry.id === bill.id), 'never another restaurant\'s');

    assert.equal((await request('GET', '/api/v1/bills?number=0', { token: floor.tokens.CASHIER })).status, 400);
  });
});

describe('extras typed at the table', () => {
  it('go on the line, the KOT and the bill, taxed at the dish\'s rate', async () => {
    const floor = await seedFloor();
    const { tokens, item } = floor;
    let order = ok(
      await openOrder(tokens.WAITER, {
        tableId: floor.table.id,
        lines: [{ menuItemId: item.id, quantity: 2, extras: [{ name: 'Extra butter', priceInPaise: 1500 }, { name: 'Less spicy chutney', priceInPaise: 500 }] }],
      }),
      'order',
    );
    const [line] = order.lines;
    assert.deepEqual(line.addOns.map((addOn) => [addOn.addOnId ?? null, addOn.name, addOn.priceInPaise]), [
      [null, 'Extra butter', 1500],
      [null, 'Less spicy chutney', 500],
    ]);
    assert.equal(line.lineTotalInPaise, 2 * (item.priceInPaise + 2000));

    const fired = ok(await fireOrder(tokens.WAITER, order.id, order.version), 'fire');
    assert.deepEqual(fired.kot.lines[0].addOnNames, ['Extra butter', 'Less spicy chutney']);
    ok(await request('PATCH', `/api/v1/kots/${fired.kot.id}/ready`, { token: tokens.KITCHEN }), 'ready');
    order = ok(await request('GET', `/api/v1/orders/${order.id}`, { token: tokens.WAITER }), 'read');
    for (const entry of order.lines.filter((candidate) => candidate.status === 'READY')) {
      order = ok(await request('PATCH', `/api/v1/orders/${order.id}/lines/${entry.id}/served`, { token: tokens.WAITER, body: { version: order.version } }), 'serve');
    }
    order = ok(await request('GET', `/api/v1/orders/${order.id}`, { token: tokens.WAITER }), 'read');
    const bill = ok(await request('POST', '/api/v1/bills', { token: tokens.CASHIER, body: { orderId: order.id, version: order.version } }), 'bill');
    assert.equal(bill.subtotalInPaise, 2 * (item.priceInPaise + 2000));
    assert.deepEqual(bill.lines[0].addOnNames, ['Extra butter', 'Less spicy chutney']);
    assert.equal(bill.lines[0].taxRateBps, item.taxRateBps);
  });

  it('refuses more than five, a zero price, and any from a guest', async () => {
    const floor = await seedFloor();
    const { tokens, item } = floor;
    const many = Array.from({ length: 6 }, (_, index) => ({ name: `Extra ${index}`, priceInPaise: 100 }));
    assert.equal((await openOrder(tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: item.id, quantity: 1, extras: many }] })).status, 400);
    assert.equal((await openOrder(tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: item.id, quantity: 1, extras: [{ name: 'Free', priceInPaise: 0 }] }] })).status, 400);
    const guest = { restaurantId: String(floor.restaurant._id), branchId: String(floor.branch._id), user: undefined };
    await assert.rejects(
      () => buildLineSnapshots(guest, [{ menuItemId: item.id, quantity: 1, extras: [{ name: 'Extra', priceInPaise: 100 }] }]),
      (error) => error.message === 'One of those dishes is not on this menu any more.',
    );
  });
});

describe('a table\'s history: GET /tables/:tableId/history', () => {
  it('lists today\'s sends with KOT numbers and who sent them, cancellations with reasons, and the bill; read-only and scoped', async () => {
    const floor = await seedFloor();
    const { tokens, item } = floor;
    let order = ok(await openOrder(tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: item.id, quantity: 2 }, { menuItemId: item.id, quantity: 1, notes: 'No onion' }] }), 'order');
    const fired = ok(await fireOrder(tokens.WAITER, order.id, order.version), 'fire');
    order = fired.order;
    ok(
      await request('POST', `/api/v1/orders/${order.id}/lines/${order.lines[1].id}/cancel`, {
        token: tokens.WAITER,
        body: { version: order.version, reasonCode: 'MODIFICATION', wasPrepared: false },
      }),
      'cancel one',
    );

    const history = ok(await request('GET', `/api/v1/tables/${floor.table.id}/history`, { token: tokens.WAITER }), 'history');
    assert.equal(history.tableName, floor.table.name);
    assert.equal(history.orders.length, 1);
    const [entry] = history.orders;
    assert.equal(entry.openedByName, 'WAITER');
    assert.equal(entry.sends.length, 1);
    assert.deepEqual(entry.sends[0].kotNumbers, [fired.kot.kotNumber]);
    assert.equal(entry.sends[0].sentByName, 'WAITER');
    assert.deepEqual(entry.sends[0].lines.map((line) => line.quantity), [2]);
    assert.equal(entry.cancelled.length, 1);
    assert.equal(entry.cancelled[0].reason, 'Guest changed the order');
    assert.equal(entry.cancelled[0].byName, 'WAITER');
    assert.equal(entry.bill, null);

    const after = ok(await request('GET', `/api/v1/orders/${order.id}`, { token: tokens.WAITER }), 'order unchanged');
    assert.equal(after.lines.filter((line) => line.status === 'PENDING').length, 0, 'reading the history adds nothing');

    assert.equal((await request('GET', `/api/v1/tables/${floor.table.id}/history`, { token: tokens.KITCHEN })).status, 403);
    const other = await seedFloor();
    assert.equal((await request('GET', `/api/v1/tables/${floor.table.id}/history`, { token: other.tokens.WAITER })).status, 404);
  });
});
