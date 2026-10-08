/** P26: adding items after serving and after billing. API-CONTRACT M2 12.4, M3 16.7. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ALL_MODELS } from '../models/index.js';
import { addLines, fireOrder, readOrder, readyToBillOrder, seedFloor } from './helpers/m2Fixtures.js';
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

async function serveEverything(floor, orderId) {
  let order = (await readOrder(floor.tokens.WAITER, orderId)).body.data;
  const fired = (await fireOrder(floor.tokens.WAITER, orderId, order.version)).body.data;
  for (const kot of fired.kots ?? [fired.kot]) await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: floor.tokens.KITCHEN });
  order = (await readOrder(floor.tokens.WAITER, orderId)).body.data;
  for (const line of order.lines.filter((entry) => entry.status === 'READY')) {
    order = (await request('PATCH', `/api/v1/orders/${orderId}/lines/${line.id}/served`, { token: floor.tokens.WAITER, body: { version: order.version } })).body.data;
  }
  return order;
}

describe('adding items after serving and billing', () => {
  it('a served table takes a new dish, which reopens the order', async () => {
    const floor = await seedFloor();
    const served = await readyToBillOrder(floor);
    assert.equal(served.status, 'READY_TO_BILL');
    const added = await addLines(floor.tokens.WAITER, served.id, { version: served.version, lines: [{ menuItemId: floor.item.id, quantity: 1 }] });
    assert.equal(added.status, 200, JSON.stringify(added.body));
    assert.equal(added.body.data.status, 'OPEN');
    const again = await serveEverything(floor, served.id);
    assert.equal(again.status, 'READY_TO_BILL');
  });

  it('a paid bill reopens, takes a dish, and the next bill carries the cash already paid', async () => {
    const floor = await seedFloor();
    const order = await readyToBillOrder(floor);
    const bill = (await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: order.id, version: order.version } })).body.data;
    const paid = await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: floor.tokens.CASHIER, body: { method: 'CASH', amountInPaise: bill.grandTotalInPaise } });
    assert.equal(paid.status, 200, JSON.stringify(paid.body));

    assert.equal((await request('POST', `/api/v1/bills/${bill.id}/reopen`, { token: floor.tokens.CASHIER, body: {} })).status, 403);
    const reopened = await request('POST', `/api/v1/bills/${bill.id}/reopen`, { token: floor.tokens.MANAGER, body: {} });
    assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
    assert.equal(reopened.body.data.voidedBillNumber, bill.billNumber);

    let current = (await readOrder(floor.tokens.WAITER, order.id)).body.data;
    assert.equal(current.status, 'READY_TO_BILL');
    const added = await addLines(floor.tokens.WAITER, order.id, { version: current.version, lines: [{ menuItemId: floor.item.id, quantity: 1 }] });
    assert.equal(added.status, 200, JSON.stringify(added.body));
    current = await serveEverything(floor, order.id);

    const second = await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: order.id, version: current.version } });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    const newBill = second.body.data;
    assert.ok(newBill.grandTotalInPaise > bill.grandTotalInPaise);
    assert.equal(newBill.carried.fromBillNumber, bill.billNumber);
    assert.equal(newBill.carried.carriedInPaise, bill.grandTotalInPaise);
    assert.equal(newBill.carried.cashToGiveBackInPaise, 0);
    assert.equal(newBill.payments.length, 1);
    assert.equal(newBill.status, 'UNPAID');
    assert.equal(newBill.amountPaidInPaise, bill.grandTotalInPaise);
  });

  it('an unpaid bill reopened with nothing added bills the same, carrying nothing', async () => {
    const floor = await seedFloor();
    const order = await readyToBillOrder(floor);
    const bill = (await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: order.id, version: order.version } })).body.data;
    assert.equal((await request('POST', `/api/v1/bills/${bill.id}/reopen`, { token: floor.tokens.OWNER, body: {} })).status, 200);
    const current = (await readOrder(floor.tokens.WAITER, order.id)).body.data;
    const again = await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: order.id, version: current.version } });
    assert.equal(again.status, 201, JSON.stringify(again.body));
    assert.equal(again.body.data.grandTotalInPaise, bill.grandTotalInPaise);
    assert.notEqual(again.body.data.billNumber, bill.billNumber);
    assert.equal(again.body.data.carried.carriedInPaise, 0);
    assert.equal(again.body.data.payments.length, 0);
  });

  it('a cashier reopens with a manager’s PIN; a voided bill cannot be reopened', async () => {
    const floor = await seedFloor();
    const order = await readyToBillOrder(floor);
    const bill = (await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: order.id, version: order.version } })).body.data;
    const manager = (await request('GET', '/api/v1/auth/me', { token: floor.tokens.MANAGER })).body.data.user;
    assert.equal((await request('PATCH', `/api/v1/users/${manager.id}/pin`, { token: floor.tokens.OWNER, body: { pin: '2468' } })).status, 200);
    const wrong = await request('POST', `/api/v1/bills/${bill.id}/reopen`, { token: floor.tokens.CASHIER, body: { approval: { approverId: manager.id, pin: '1111' } } });
    assert.notEqual(wrong.status, 200);
    const right = await request('POST', `/api/v1/bills/${bill.id}/reopen`, { token: floor.tokens.CASHIER, body: { approval: { approverId: manager.id, pin: '2468' } } });
    assert.equal(right.status, 200, JSON.stringify(right.body));
    const again = await request('POST', `/api/v1/bills/${bill.id}/reopen`, { token: floor.tokens.OWNER, body: {} });
    assert.equal(again.status, 422);
  });

  it('a dish added then cancelled leaves the order ready to bill, and the payment covers it again', async () => {
    const floor = await seedFloor();
    const order = await readyToBillOrder(floor, [{ menuItemId: floor.item.id, quantity: 2 }]);
    const bill = (await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: order.id, version: order.version } })).body.data;
    await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: floor.tokens.CASHIER, body: { method: 'CASH', amountInPaise: bill.grandTotalInPaise } });
    assert.equal((await request('POST', `/api/v1/bills/${bill.id}/reopen`, { token: floor.tokens.MANAGER, body: {} })).status, 200);

    // A dish added, then cancelled before it reaches the kitchen: what is left is all served, so it is ready to bill again.
    let current = (await readOrder(floor.tokens.WAITER, order.id)).body.data;
    current = (await addLines(floor.tokens.WAITER, order.id, { version: current.version, lines: [{ menuItemId: floor.item.id, quantity: 1 }] })).body.data;
    const fresh = current.lines.find((line) => line.status === 'PENDING');
    current = (await request('POST', `/api/v1/orders/${order.id}/lines/${fresh.id}/cancel`, { token: floor.tokens.MANAGER, body: { version: current.version, reasonCode: 'MODIFICATION' } })).body.data;
    assert.equal(current.status, 'READY_TO_BILL');

    // Bill again for the same two dishes: what was paid covers it exactly.
    const smaller = await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: order.id, version: current.version } });
    assert.equal(smaller.status, 201, JSON.stringify(smaller.body));
    assert.equal(smaller.body.data.grandTotalInPaise, bill.grandTotalInPaise);
    assert.equal(smaller.body.data.carried.carriedInPaise, bill.grandTotalInPaise);
    assert.equal(smaller.body.data.carried.cashToGiveBackInPaise, 0);
    assert.equal(smaller.body.data.status, 'PAID');
  });
});
