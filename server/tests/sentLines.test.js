/**
 * Changing a dish after it is sent. P42, API-CONTRACT P42.
 *
 * Remove, lower the quantity and change the note of a sent dish. No PIN while
 * the kitchen has not made it; the manager's PIN for a captain once it has.
 * Only the part taken off returns stock, and a later remove never returns
 * more than was taken.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { AuditLog } from '../models/AuditLog.js';
import { ALL_MODELS } from '../models/index.js';
import { fireOrder, openOrder, readOrder, seedFloor } from './helpers/m2Fixtures.js';
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

const paneerOf = async (token) =>
  ok(await request('GET', '/api/v1/ingredients', { token }), 'ingredients').find((row) => row.name === 'Paneer').currentQtyInBase;

async function managerApproval(floor, pin = '2468') {
  const manager = ok(await request('GET', '/api/v1/auth/me', { token: floor.tokens.MANAGER }), 'me').user;
  ok(await request('PATCH', `/api/v1/users/${manager.id}/pin`, { token: floor.tokens.OWNER, body: { pin } }), 'pin');
  return { approverId: manager.id, pin };
}

/** A table with `quantity` of one dish sent, its recipe taking 150 g of paneer each, from 5000 g. */
async function sentDish(quantity = 3) {
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
  const opened = ok(await openOrder(tokens.WAITER, { tableId: table.id, lines: [{ menuItemId: item.id, quantity, notes: 'Less spicy' }] }), 'open');
  const fired = ok(await fireOrder(tokens.WAITER, opened.id, opened.version), 'fire');
  return { floor, order: fired.order, line: fired.order.lines[0], kot: fired.kot, approval: await managerApproval(floor) };
}

const reduce = (token, order, line, body) =>
  request('POST', `/api/v1/orders/${order.id}/lines/${line.id}/reduce`, {
    token,
    body: { version: order.version, reasonCode: 'MODIFICATION', wasPrepared: false, ...body },
  });
const cancel = (token, order, line, body) =>
  request('POST', `/api/v1/orders/${order.id}/lines/${line.id}/cancel`, {
    token,
    body: { version: order.version, reasonCode: 'MODIFICATION', wasPrepared: false, ...body },
  });
const readKot = (floor, kot) => request('GET', `/api/v1/kots/${kot.id}`, { token: floor.tokens.KITCHEN });

describe('a sent dish the kitchen has not made', () => {
  it('lowers 3 to 2: the line keeps 2, 1 is cancelled, the ticket shows it, and one portion of stock comes back', async () => {
    const { floor, order, line, kot } = await sentDish(3);
    const { tokens } = floor;
    assert.equal(await paneerOf(tokens.OWNER), 5000 - 450);

    const lowered = ok(await reduce(tokens.WAITER, order, line, { quantity: 2 }), 'captain lowers, no PIN');
    const kept = lowered.lines.find((entry) => entry.id === line.id);
    const cancelled = lowered.lines.filter((entry) => entry.status === 'CANCELLED');
    assert.equal(kept.quantity, 2);
    assert.equal(kept.status, 'FIRED');
    assert.equal(cancelled.length, 1);
    assert.equal(cancelled[0].quantity, 1);
    assert.equal(cancelled[0].cancelReasonCode, 'MODIFICATION');
    assert.equal(cancelled[0].unitPriceInPaise, kept.unitPriceInPaise);
    assert.equal(await paneerOf(tokens.OWNER), 5000 - 300, 'one portion back');

    const ticket = ok(await readKot(floor, kot), 'ticket');
    const live = ticket.lines.find((entry) => entry.orderLineId === line.id);
    assert.equal(live.quantity, 2);
    assert.ok(live.changedAt, 'marked changed');
    const gone = ticket.lines.find((entry) => entry.orderLineId === cancelled[0].id);
    assert.equal(gone.status, 'CANCELLED');
    assert.equal(gone.quantity, 1);

    // Then the guest wants none: the rest comes back, and not a gram more.
    ok(await cancel(tokens.WAITER, lowered, kept), 'captain removes the rest, no PIN');
    assert.equal(await paneerOf(tokens.OWNER), 5000, 'exactly what was taken, no more');
  });

  it('takes a new note, on the order and on its kitchen ticket', async () => {
    const { floor, order, line, kot } = await sentDish(1);
    const changed = ok(
      await request('PATCH', `/api/v1/orders/${order.id}/lines/${line.id}`, { token: floor.tokens.WAITER, body: { version: order.version, notes: 'Less spicy, no onion' } }),
      'note',
    );
    assert.equal(changed.lines[0].notes, 'Less spicy, no onion');
    const ticket = ok(await readKot(floor, kot), 'ticket');
    assert.equal(ticket.lines[0].notes, 'Less spicy, no onion');
    assert.ok(ticket.lines[0].changedAt);

    // Its quantity is lowered with reduce, not the stepper's edit.
    const current = ok(await readOrder(floor.tokens.WAITER, order.id), 'read');
    const refused = await request('PATCH', `/api/v1/orders/${order.id}/lines/${line.id}`, { token: floor.tokens.WAITER, body: { version: current.version, quantity: 2 } });
    assert.equal(refused.status, 422);
  });
});

describe('a sent dish said to be made before the kitchen ticked it', () => {
  it('needs the manager PIN for a captain, as a made dish does', async () => {
    const { floor, order, line, approval } = await sentDish(1);
    assert.equal((await cancel(floor.tokens.WAITER, order, line, { wasPrepared: true })).status, 403, 'no PIN');
    ok(await cancel(floor.tokens.WAITER, order, line, { wasPrepared: true, approval }), 'with the PIN');
    assert.equal(await paneerOf(floor.tokens.OWNER), 5000 - 150, 'made, so nothing comes back');
  });
});

describe('a sent dish the kitchen has made', () => {
  it('needs the manager PIN for a captain to remove or lower it, and returns no stock', async () => {
    const { floor, order, line, kot, approval } = await sentDish(3);
    const { tokens } = floor;
    ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: tokens.KITCHEN }), 'kitchen marks it ready');
    let current = ok(await readOrder(tokens.WAITER, order.id), 'read');

    assert.equal((await cancel(tokens.WAITER, current, line, { wasPrepared: true })).status, 403, 'remove without PIN');
    assert.equal((await reduce(tokens.WAITER, current, line, { quantity: 1, wasPrepared: true })).status, 403, 'lower without PIN');

    const note = await request('PATCH', `/api/v1/orders/${order.id}/lines/${line.id}`, { token: tokens.WAITER, body: { version: current.version, notes: 'Too late' } });
    assert.equal(note.status, 422, 'a made dish keeps its note');

    current = ok(await readOrder(tokens.WAITER, order.id), 'read');
    ok(await reduce(tokens.WAITER, current, line, { quantity: 1, wasPrepared: true, approval }), 'lower with PIN');
    assert.equal(await paneerOf(tokens.OWNER), 5000 - 450, 'made, so nothing comes back');
    const audit = await AuditLog.findOne({ restaurantId: floor.restaurant._id, action: 'LINE_CANCELLED_AFTER_PREP' }).lean();
    assert.equal(audit.details.quantity, 2);
  });
});

describe('refused', () => {
  it('to the kitchen login, and for a quantity not lower, and for a dish not sent', async () => {
    const { floor, order, line } = await sentDish(2);
    assert.equal((await reduce(floor.tokens.KITCHEN, order, line, { quantity: 1 })).status, 403, 'kitchen');
    assert.equal((await reduce(floor.tokens.WAITER, order, line, { quantity: 2 })).status, 400, 'not lower');

    const opened = ok(await openOrder(floor.tokens.WAITER, { orderType: 'TAKEAWAY', lines: [{ menuItemId: floor.item.id, quantity: 2 }] }), 'takeaway');
    const pending = await reduce(floor.tokens.WAITER, opened, opened.lines[0], { quantity: 1 });
    assert.equal(pending.status, 422, 'not sent');
  });
});
