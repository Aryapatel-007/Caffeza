/**
 * Undo a Send to kitchen, and the kitchen's Recall list. P41,
 * API-CONTRACT P41.
 *
 * Within a minute of a Send, before the kitchen has marked anything ready, the
 * Send is taken back: the kitchen lines are cancelled, stock comes back, and
 * unsent copies go back on the order, which the next Send deducts for again.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { AuditLog } from '../models/AuditLog.js';
import { ALL_MODELS } from '../models/index.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { createMenuItem, fireOrder, openOrder, readOrder, seedFloor } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
});

afterEach(() => resetClockForTests());

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

const T0 = new Date('2026-10-13T13:00:00.000Z');
const later = (seconds) => new Date(T0.getTime() + seconds * 1000);

const ok = (response, what) => {
  assert.ok(response.status >= 200 && response.status < 300, `${what}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data;
};
const refused = (response, message, what) => {
  assert.equal(response.status, 422, `${what}: ${response.status} ${JSON.stringify(response.body)}`);
  assert.equal(response.body.error.message, message, what);
};

const undo = (token, orderId, version) => request('POST', `/api/v1/orders/${orderId}/undo-send`, { token, body: { version } });
const stockOf = async (token) =>
  Object.fromEntries(ok(await request('GET', '/api/v1/ingredients', { token }), 'ingredients').map((row) => [row.name, row.currentQtyInBase]));

/** A table with one dish sent at T0, its recipe taking 150 g of paneer each. */
async function sentTable({ quantity = 2 } = {}) {
  const floor = await seedFloor();
  const { tokens, table, item } = floor;
  const paneer = ok(
    await request('POST', '/api/v1/ingredients', {
      token: tokens.OWNER,
      body: { name: 'Paneer', baseUnit: 'G', unitsPerBase: 1000, purchaseUnitName: 'kg', openingQtyInBase: 5000 },
    }),
    'ingredient',
  );
  ok(await request('PUT', '/api/v1/recipes', { token: tokens.OWNER, body: { menuItemId: item.id, items: [{ ingredientId: paneer.id, qtyInBase: 150 }] } }), 'recipe');

  setClockForTests(T0);
  const opened = ok(await openOrder(tokens.WAITER, { tableId: table.id, lines: [{ menuItemId: item.id, quantity, notes: 'Less spicy' }] }), 'open');
  const fired = ok(await fireOrder(tokens.WAITER, opened.id, opened.version), 'fire');
  return { floor, order: fired.order, kot: fired.kot };
}

describe('undo a Send within the minute', () => {
  it('puts the dishes back unsent, cancels the kitchen lines, returns the stock and is audited', async () => {
    const { floor, order, kot } = await sentTable();
    const { tokens } = floor;
    assert.equal((await stockOf(tokens.OWNER)).Paneer, 5000 - 300);

    setClockForTests(later(30));
    const undone = ok(await undo(tokens.WAITER, order.id, order.version), 'undo');

    const cancelled = undone.lines.filter((line) => line.status === 'CANCELLED');
    const pending = undone.lines.filter((line) => line.status === 'PENDING');
    assert.equal(undone.status, 'OPEN');
    assert.equal(cancelled.length, 1);
    assert.equal(cancelled[0].cancelReasonCode, 'SENT_BY_MISTAKE');
    assert.equal(cancelled[0].wasPrepared, false);
    assert.equal(pending.length, 1);
    assert.notEqual(pending[0].id, cancelled[0].id);
    assert.equal(pending[0].quantity, 2);
    assert.equal(pending[0].notes, 'Less spicy');
    assert.equal(pending[0].unitPriceInPaise, cancelled[0].unitPriceInPaise);

    const ticket = ok(await request('GET', `/api/v1/kots/${kot.id}`, { token: tokens.KITCHEN ?? tokens.MANAGER }), 'ticket');
    assert.ok(ticket.lines.every((line) => line.status === 'CANCELLED'));
    assert.equal((await stockOf(tokens.OWNER)).Paneer, 5000, 'the stock comes back');

    const audit = await AuditLog.findOne({ restaurantId: floor.restaurant._id, action: 'KOT_SEND_UNDONE' }).lean();
    assert.ok(audit, 'audited');
    assert.deepEqual(audit.details.itemNames, [`2 × ${cancelled[0].itemName}`]);

    // Sent again: a new round, and the stock is taken again under the copy's own key.
    setClockForTests(later(45));
    const again = ok(await fireOrder(tokens.WAITER, order.id, undone.version), 'send again');
    assert.equal(again.order.lines.filter((line) => line.status === 'FIRED').length, 1);
    assert.equal((await stockOf(tokens.OWNER)).Paneer, 5000 - 300, 'deducted again on the next Send');
  });

  it('takes back only the last Send, leaving an earlier round alone', async () => {
    const { floor, order } = await sentTable({ quantity: 1 });
    const { tokens } = floor;
    const second = ok(await createMenuItem(tokens.OWNER, { name: 'Pani Puri', priceInPaise: 9000, taxRateBps: 500 }), 'dish');

    setClockForTests(later(120));
    const added = ok(await request('POST', `/api/v1/orders/${order.id}/lines`, { token: tokens.WAITER, body: { version: order.version, lines: [{ menuItemId: second.id, quantity: 1 }] } }), 'add');
    const fired = ok(await fireOrder(tokens.WAITER, order.id, added.version), 'second Send');

    setClockForTests(later(140));
    const undone = ok(await undo(tokens.WAITER, order.id, fired.order.version), 'undo');
    const byStatus = (status) => undone.lines.filter((line) => line.status === status).map((line) => line.itemName);
    assert.deepEqual(byStatus('CANCELLED'), ['Pani Puri']);
    assert.deepEqual(byStatus('PENDING'), ['Pani Puri']);
    assert.equal(byStatus('FIRED').length, 1, 'the first round stays sent');
  });
});

describe('undo a Send, refused', () => {
  it('after 60 seconds', async () => {
    const { floor, order } = await sentTable();
    setClockForTests(later(61));
    refused(await undo(floor.tokens.WAITER, order.id, order.version), 'Too late to undo. Cancel the dishes instead.', 'too late');
  });

  it('once the kitchen has marked a dish ready', async () => {
    const { floor, order, kot } = await sentTable();
    setClockForTests(later(20));
    ok(await request('PATCH', `/api/v1/kots/${kot.id}/lines/${kot.lines[0].id}/ready`, { token: floor.tokens.MANAGER }), 'ready');
    const current = ok(await readOrder(floor.tokens.WAITER, order.id), 'read');
    const response = await undo(floor.tokens.WAITER, order.id, current.version);
    assert.equal(response.status, 422, JSON.stringify(response.body));
  });

  it('when nothing has been sent, and for another restaurant', async () => {
    const floor = await seedFloor();
    const opened = ok(await openOrder(floor.tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: floor.item.id, quantity: 1 }] }), 'open');
    refused(await undo(floor.tokens.WAITER, opened.id, opened.version), 'Nothing has been sent to the kitchen yet.', 'nothing sent');

    const other = await seedFloor();
    const response = await undo(other.tokens.WAITER, opened.id, opened.version);
    assert.equal(response.status, 404);
  });

  it('with a stale version', async () => {
    const { floor, order } = await sentTable();
    setClockForTests(later(10));
    const response = await undo(floor.tokens.WAITER, order.id, order.version - 1);
    assert.equal(response.status, 409, JSON.stringify(response.body));
  });
});

describe('the kitchen Recall list', () => {
  it('sort=recent lists the ticket finished last first', async () => {
    const floor = await seedFloor();
    const { tokens, item } = floor;
    const table2 = ok(await request('POST', '/api/v1/tables', { token: tokens.OWNER, body: { name: 'Table 2', section: 'Main' } }), 'table');
    const tickets = [];
    for (const tableId of [floor.table.id, table2.id]) {
      const opened = ok(await openOrder(tokens.WAITER, { tableId, lines: [{ menuItemId: item.id, quantity: 1 }] }), 'open');
      tickets.push(ok(await fireOrder(tokens.WAITER, opened.id, opened.version), 'fire').kot);
    }
    // The newer ticket is finished last.
    ok(await request('PATCH', `/api/v1/kots/${tickets[0].id}/ready`, { token: tokens.MANAGER }), 'ready first');
    await new Promise((resolve) => setTimeout(resolve, 20));
    ok(await request('PATCH', `/api/v1/kots/${tickets[1].id}/ready`, { token: tokens.MANAGER }), 'ready second');

    const recent = ok(await request('GET', '/api/v1/kots?status=COMPLETED&sort=recent', { token: tokens.MANAGER }), 'recent');
    assert.deepEqual(recent.map((kot) => kot.id), [tickets[1].id, tickets[0].id]);
    const queue = ok(await request('GET', '/api/v1/kots?status=COMPLETED', { token: tokens.MANAGER }), 'queue');
    assert.deepEqual(queue.map((kot) => kot.id), [tickets[0].id, tickets[1].id]);

    const bad = await request('GET', '/api/v1/kots?sort=oldest', { token: tokens.MANAGER });
    assert.equal(bad.status, 400);
  });
});
