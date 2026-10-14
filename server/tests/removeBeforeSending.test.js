/**
 * Removing a dish before it is sent. P49, API-CONTRACT P49.
 *
 * A draft line goes with no reason and no trace; a sent one is never deleted.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { AuditLog } from '../models/AuditLog.js';
import { ALL_MODELS } from '../models/index.js';
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
const remove = (token, order, line, version = order.version) =>
  request('DELETE', `/api/v1/orders/${order.id}/lines/${line.id}?version=${version}`, { token });

describe('removing a dish before it is sent', () => {
  it('takes it off the order with no reason and no trace', async () => {
    const floor = await seedFloor();
    const { tokens, item } = floor;
    const order = ok(await openOrder(tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: item.id, quantity: 2 }, { menuItemId: item.id, quantity: 1, notes: 'Less spicy' }] }), 'order');
    const after = ok(await remove(tokens.WAITER, order, order.lines[1]), 'captain removes');
    assert.equal(after.lines.length, 1, 'gone, not cancelled');
    assert.equal(after.lines[0].id, order.lines[0].id);
    assert.equal(after.lines.filter((line) => line.status === 'CANCELLED').length, 0);
    assert.equal(await AuditLog.countDocuments({ restaurantId: floor.restaurant._id, entityId: order.id }), 0, 'nothing audited');

    // The last one too: the order stays open, empty.
    const empty = ok(await remove(tokens.WAITER, after, after.lines[0]), 'remove the last');
    assert.equal(empty.lines.length, 0);
    assert.equal(empty.status, 'OPEN');
  });

  it('refuses a sent dish, a stale version, a billed order, the kitchen login and another restaurant', async () => {
    const floor = await seedFloor();
    const { tokens, item } = floor;
    const order = ok(await openOrder(tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: item.id, quantity: 1 }] }), 'order');
    assert.equal((await remove(tokens.WAITER, order, order.lines[0], order.version + 5)).status, 409, 'stale version');
    assert.equal((await remove(tokens.KITCHEN, order, order.lines[0])).status, 403, 'the kitchen login');
    const other = await seedFloor();
    assert.equal((await remove(other.tokens.WAITER, order, order.lines[0])).status, 404, 'another restaurant');

    const fired = ok(await fireOrder(tokens.WAITER, order.id, order.version), 'fire');
    const sent = await remove(tokens.WAITER, fired.order, fired.order.lines[0]);
    assert.equal(sent.status, 422);
    assert.equal(sent.body.error.message, 'This dish has been sent to the kitchen. Use Change.');

    const billedOrder = await readyToBillOrder(other);
    const bill = ok(await request('POST', '/api/v1/bills', { token: other.tokens.CASHIER, body: { orderId: billedOrder.id, version: billedOrder.version } }), 'bill');
    const current = ok(await request('GET', `/api/v1/orders/${bill.orderId}`, { token: other.tokens.WAITER }), 'read');
    assert.equal((await remove(other.tokens.WAITER, current, current.lines[0])).status, 422, 'a billed order changes through its bill');
  });
});
