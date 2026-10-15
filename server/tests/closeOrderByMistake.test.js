/**
 * Closing a table opened by mistake. P50, API-CONTRACT P50.
 *
 * An order nothing was sent from closes with no reason and counts nowhere;
 * once anything was sent, only the manager's Cancel order closes it.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { AuditLog } from '../models/AuditLog.js';
import { ALL_MODELS } from '../models/index.js';
import { nowUtc, businessDateFor } from '../utils/time.js';
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
const close = (token, order, version = order.version) => request('POST', `/api/v1/orders/${order.id}/close`, { token, body: { version } });

describe('closing a table opened by mistake', () => {
  it('a captain closes it with no reason: the table is free, nothing is audited, and no report counts it', async () => {
    const floor = await seedFloor();
    const { tokens, item } = floor;
    const order = ok(await openOrder(tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: item.id, quantity: 2 }] }), 'order');

    const closed = ok(await close(tokens.WAITER, order), 'captain closes');
    assert.equal(closed.status, 'CANCELLED');
    assert.equal(closed.cancelReasonCode, 'OPENED_BY_MISTAKE');
    assert.equal(closed.lines.length, 0, 'the unsent dish went with it');
    assert.equal(await AuditLog.countDocuments({ restaurantId: floor.restaurant._id, entityId: order.id }), 0, 'nothing audited');

    const tables = ok(await request('GET', '/api/v1/tables', { token: tokens.WAITER }), 'tables');
    assert.equal(tables.find((table) => table.id === floor.table.id).occupancy.state, 'FREE', 'the table is free');
    ok(await openOrder(tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: item.id, quantity: 1 }] }), 'the table opens again');

    const today = businessDateFor(nowUtc());
    const r15 = ok(await request('GET', `/api/v1/reports/v2/cancellations?from=${today}&to=${today}`, { token: tokens.OWNER }), 'R15');
    assert.equal(r15.sections.find((section) => section.key === 'orders').rows.length, 0, 'not a cancelled order in R15');
    assert.equal(r15.sections.find((section) => section.key === 'items'), undefined, 'P56: R15 has no single items');
    const r2 = ok(await request('GET', `/api/v1/reports/v2/day-close?date=${today}`, { token: tokens.OWNER }), 'R2');
    const controls = r2.sections.find((section) => section.key === 'controls').rows;
    assert.equal(controls.find((row) => row.line === 'Orders cancelled').count, 0, 'not in the day\'s figures');
  });

  it('refuses once anything was sent, with a bill, on a stale version, the kitchen login and another restaurant', async () => {
    const floor = await seedFloor();
    const { tokens, item } = floor;
    const order = ok(await openOrder(tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: item.id, quantity: 1 }] }), 'order');
    assert.equal((await close(tokens.WAITER, order, order.version + 5)).status, 409, 'stale version');
    assert.equal((await close(tokens.KITCHEN, order)).status, 403, 'the kitchen login');
    const other = await seedFloor();
    assert.equal((await close(other.tokens.WAITER, order)).status, 404, 'another restaurant');

    const fired = ok(await fireOrder(tokens.WAITER, order.id, order.version), 'fire');
    const sent = await close(tokens.WAITER, fired.order);
    assert.equal(sent.status, 422);
    assert.equal(sent.body.error.message, 'Dishes have been sent to the kitchen. Ask a manager to cancel the order.');

    // Sent and taken back is still sent: the kitchen saw it.
    const undone = ok(await request('POST', `/api/v1/orders/${order.id}/undo-send`, { token: tokens.WAITER, body: { version: fired.order.version } }), 'undo');
    assert.equal((await close(tokens.WAITER, undone)).status, 422, 'an undone send still counts');

    const billedOrder = await readyToBillOrder(other);
    const bill = ok(await request('POST', '/api/v1/bills', { token: other.tokens.CASHIER, body: { orderId: billedOrder.id, version: billedOrder.version } }), 'bill');
    const current = ok(await request('GET', `/api/v1/orders/${bill.orderId}`, { token: other.tokens.WAITER }), 'read');
    assert.equal((await close(other.tokens.WAITER, current)).status, 422, 'a billed order');
  });

  it('the manager\'s Cancel order does not accept the code', async () => {
    const floor = await seedFloor();
    const { tokens, item } = floor;
    const order = ok(await openOrder(tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: item.id, quantity: 1 }] }), 'order');
    const refused = await request('POST', `/api/v1/orders/${order.id}/cancel`, { token: tokens.MANAGER, body: { version: order.version, reasonCode: 'OPENED_BY_MISTAKE' } });
    assert.equal(refused.status, 400);
  });
});
