/**
 * P29 Part E: taking back a ready tick made by mistake in the kitchen.
 * docs/API-CONTRACT.md M2 section 13.5.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { AuditLog } from '../models/AuditLog.js';
import { ALL_MODELS } from '../models/index.js';
import { businessDateFor } from '../utils/time.js';
import { createMenuItem, fireOrder, openOrder, readOrder, seedFloor } from './helpers/m2Fixtures.js';
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

/** Two dishes on a table, fired; the kitchen marks both ready, so the order is waiting for the cashier. */
async function readyTable() {
  const floor = await seedFloor();
  const second = ok(await createMenuItem(floor.tokens.OWNER, { name: 'Paneer Makhni', priceInPaise: 30000 }), 'dish');
  const opened = ok(
    await openOrder(floor.tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: floor.item.id, quantity: 1 }, { menuItemId: second.id, quantity: 1 }] }),
    'open',
  );
  const { kot } = ok(await fireOrder(floor.tokens.WAITER, opened.id, opened.version), 'fire');
  ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: floor.tokens.KITCHEN }), 'ready');
  const order = ok(await readOrder(floor.tokens.WAITER, opened.id), 'read');
  assert.equal(order.status, 'READY_TO_BILL');
  return { floor, kot, orderId: opened.id };
}

describe('undoing ready', () => {
  it('sends one line back to the kitchen and the order back to open, and writes one audit line', async () => {
    const { floor, kot, orderId } = await readyTable();
    const line = kot.lines.find((entry) => entry.itemName === 'Paneer Makhni');

    const undone = ok(await request('POST', `/api/v1/kots/${kot.id}/lines/${line.id}/undo-ready`, { token: floor.tokens.KITCHEN }), 'undo');
    assert.equal(undone.lines.find((entry) => entry.id === line.id).status, 'PENDING');
    assert.equal(undone.lines.find((entry) => entry.id === line.id).readyAt, null);
    assert.equal(undone.status, 'IN_PROGRESS');
    assert.equal(undone.platformAlreadyTold, false);

    const order = ok(await readOrder(floor.tokens.WAITER, orderId), 'read');
    const orderLine = order.lines.find((entry) => entry.id === line.orderLineId);
    assert.equal(orderLine.status, 'FIRED');
    assert.equal(orderLine.readyAt, null);
    assert.equal(orderLine.servedAt, null);
    assert.equal(order.status, 'OPEN');
    assert.equal(order.readyToBillAt, null);
    assert.equal(order.lines.find((entry) => entry.id !== line.orderLineId).status, 'SERVED', 'the other dish is untouched');

    const audits = await AuditLog.find({ restaurantId: floor.restaurant._id, action: 'KITCHEN_READY_UNDONE' }).lean();
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0].details.itemNames, ['Paneer Makhni']);
    assert.equal(audits[0].entityLabel, `Order ${order.orderNumber}`);

    // A manager may read it in the audit trail.
    const today = businessDateFor(audits[0].at, 300);
    const trail = ok(await request('GET', `/api/v1/audit?from=${today}&to=${today}&action=KITCHEN_READY_UNDONE`, { token: floor.tokens.MANAGER }), 'audit');
    assert.equal(trail.length, 1);
  });

  it('undoes a whole ticket', async () => {
    const { floor, kot, orderId } = await readyTable();
    const undone = ok(await request('POST', `/api/v1/kots/${kot.id}/undo-ready`, { token: floor.tokens.WAITER }), 'undo');
    assert.ok(undone.lines.every((entry) => entry.status === 'PENDING'));
    const order = ok(await readOrder(floor.tokens.WAITER, orderId), 'read');
    assert.ok(order.lines.every((entry) => entry.status === 'FIRED'));
    assert.equal(order.status, 'OPEN');
  });

  it('refuses a line that is not ready', async () => {
    const { floor, kot } = await readyTable();
    const line = kot.lines[0];
    ok(await request('POST', `/api/v1/kots/${kot.id}/lines/${line.id}/undo-ready`, { token: floor.tokens.KITCHEN }), 'undo');
    const again = await request('POST', `/api/v1/kots/${kot.id}/lines/${line.id}/undo-ready`, { token: floor.tokens.KITCHEN });
    assert.equal(again.status, 422);
    assert.equal(again.body.error.message, 'That one is not marked ready.');
  });

  it('refuses once the table is billed, and tells the kitchen to ask the cashier', async () => {
    const { floor, kot, orderId } = await readyTable();
    const order = ok(await readOrder(floor.tokens.WAITER, orderId), 'read');
    ok(await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId, version: order.version } }), 'bill');
    const refused = await request('POST', `/api/v1/kots/${kot.id}/undo-ready`, { token: floor.tokens.KITCHEN });
    assert.equal(refused.status, 422);
    assert.equal(refused.body.error.code, 'ORDER_ALREADY_BILLED');
    assert.equal(refused.body.error.message, 'This table has been billed. Ask the cashier to change the bill.');
  });

  it('is 404 for another restaurant\'s ticket and 401 without a token', async () => {
    const { kot } = await readyTable();
    const other = await seedFloor();
    assert.equal((await request('POST', `/api/v1/kots/${kot.id}/undo-ready`, { token: other.tokens.KITCHEN })).status, 404);
    assert.equal((await request('POST', `/api/v1/kots/${kot.id}/undo-ready`, {})).status, 401);
  });
});
