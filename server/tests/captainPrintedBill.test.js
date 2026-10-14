/**
 * A captain cannot change a printed bill. P39, API-CONTRACT P39.
 *
 * Before the first print a captain adds and removes items as before. After it,
 * each of the four ways a bill's items change is a 403 for a captain, a
 * manager's PIN does not help, and the cashier carries on with the PIN.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ALL_MODELS } from '../models/index.js';
import { createMenuItem, readyToBillOrder, seedFloor } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const PRINTED = 'This bill has been printed. Only the counter or a manager can change it now.';

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
const refusedAsPrinted = (response, what) => {
  assert.equal(response.status, 403, `${what}: ${response.status} ${JSON.stringify(response.body)}`);
  assert.equal(response.body.error.code, 'FORBIDDEN', what);
  assert.equal(response.body.error.message, PRINTED, what);
};

async function managerApproval(floor, pin = '2468') {
  const manager = ok(await request('GET', '/api/v1/auth/me', { token: floor.tokens.MANAGER }), 'me').user;
  ok(await request('PATCH', `/api/v1/users/${manager.id}/pin`, { token: floor.tokens.OWNER, body: { pin } }), 'pin');
  return { approverId: manager.id, pin };
}

/** A two-dish table billed by its captain, nothing paid, never printed. */
async function captainsBill() {
  const floor = await seedFloor();
  floor.tokens.KITCHEN ??= floor.tokens.MANAGER;
  const second = ok(await createMenuItem(floor.tokens.OWNER, { name: 'Raj Kachori Basket Chaat', priceInPaise: 29500, taxRateBps: 500 }), 'dish');
  const order = await readyToBillOrder(floor, [
    { menuItemId: floor.item.id, quantity: 1 },
    { menuItemId: second.id, quantity: 1 },
  ]);
  const bill = ok(await request('POST', '/api/v1/bills', { token: floor.tokens.WAITER, body: { orderId: order.id, version: order.version } }), 'captain bills');
  return { floor, second, bill, approval: await managerApproval(floor) };
}

const removeLines = (token, bill, body) => request('POST', `/api/v1/bills/${bill.id}/remove-lines`, { token, body: { reasonCode: 'MODIFICATION', ...body } });
const firstLine = (bill) => ({ lineId: bill.lines[0].orderLineId, wasPrepared: true });

describe('a captain and an unprinted bill', () => {
  it('may still preview a removal and add a dish, which revises the bill', async () => {
    const { floor, second, bill } = await captainsBill();
    assert.equal(bill.printCount ?? 0, 0);

    ok(await removeLines(floor.tokens.WAITER, bill, { lines: [firstLine(bill)], preview: true }), 'preview a removal');

    const order = ok(await request('GET', `/api/v1/orders/${bill.orderId}`, { token: floor.tokens.WAITER }), 'order');
    ok(
      await request('POST', `/api/v1/orders/${bill.orderId}/lines`, {
        token: floor.tokens.WAITER,
        body: { version: order.version, lines: [{ menuItemId: second.id, quantity: 1 }] },
      }),
      'captain adds a dish to the unprinted bill',
    );
  });
});

describe('a captain and a printed bill', () => {
  let floor;
  let second;
  let bill;
  let approval;

  before(async () => {
    ({ floor, second, bill, approval } = await captainsBill());
    ok(await request('POST', `/api/v1/bills/${bill.id}/printed`, { token: floor.tokens.CASHIER }), 'printed at the counter');
    bill = ok(await request('GET', `/api/v1/bills/${bill.id}`, { token: floor.tokens.CASHIER }), 'read');
    assert.equal(bill.printCount, 1);
  });

  it('cannot remove an item, not even to preview it, and a manager PIN does not help', async () => {
    refusedAsPrinted(await removeLines(floor.tokens.WAITER, bill, { lines: [firstLine(bill)], preview: true }), 'preview');
    refusedAsPrinted(await removeLines(floor.tokens.WAITER, bill, { lines: [firstLine(bill)], approval }), 'remove with a PIN');
  });

  it('cannot add a dish to the order, which would revise the printed bill', async () => {
    const order = ok(await request('GET', `/api/v1/orders/${bill.orderId}`, { token: floor.tokens.WAITER }), 'order');
    refusedAsPrinted(
      await request('POST', `/api/v1/orders/${bill.orderId}/lines`, {
        token: floor.tokens.WAITER,
        body: { version: order.version, lines: [{ menuItemId: second.id, quantity: 1 }] },
      }),
      'add a dish',
    );
  });

  it('cannot cancel an item after billing or reopen the bill, PIN or not', async () => {
    refusedAsPrinted(
      await request('POST', `/api/v1/bills/${bill.id}/cancel-lines`, {
        token: floor.tokens.WAITER,
        body: { lines: [firstLine(bill)], reasonCode: 'MODIFICATION', approval, preview: true },
      }),
      'cancel-lines',
    );
    refusedAsPrinted(await request('POST', `/api/v1/bills/${bill.id}/reopen`, { token: floor.tokens.WAITER, body: { approval } }), 'reopen');
  });

  it('leaves the bill as it was, and the cashier can still remove the item with the PIN', async () => {
    const unchanged = ok(await request('GET', `/api/v1/bills/${bill.id}`, { token: floor.tokens.CASHIER }), 'read');
    assert.equal(unchanged.lines.length, bill.lines.length);
    assert.equal(unchanged.grandTotalInPaise, bill.grandTotalInPaise);

    const revised = ok(await removeLines(floor.tokens.CASHIER, bill, { lines: [firstLine(bill)], approval }), 'cashier removes');
    assert.equal(revised.billNumber, bill.billNumber);
    assert.ok(revised.grandTotalInPaise < bill.grandTotalInPaise);
  });
});
