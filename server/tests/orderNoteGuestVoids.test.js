/**
 * A note for every dish, the guest's details before the first KOT, and only
 * whole voids in the void lists. P56, API-CONTRACT P56.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { Bill } from '../models/Bill.js';
import { Customer } from '../models/Customer.js';
import { ALL_MODELS } from '../models/index.js';
import { businessDateFor, nowUtc } from '../utils/time.js';
import { createMenuItem, fireOrder, openOrder, readOrder, readyToBillOrder, seedFloor } from './helpers/m2Fixtures.js';
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
const setNote = (token, order, kitchenNote, version = order.version) =>
  request('PATCH', `/api/v1/orders/${order.id}/kitchen-note`, { token, body: { version, kitchenNote } });
const setGuest = (token, order, body, version = order.version) =>
  request('PATCH', `/api/v1/orders/${order.id}/customer`, { token, body: { version, ...body } });
const readKot = (token, kotId) => request('GET', `/api/v1/kots/${kotId}`, { token });
const section = (report, key) => report.sections.find((entry) => entry.key === key);

describe('a note for every dish', () => {
  it('reaches the order, its ticket, a later round, the printed KOT and a ticket already sent', async () => {
    const floor = await seedFloor();
    const { tokens, item } = floor;
    let order = ok(await openOrder(tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: item.id, quantity: 2 }] }), 'order');

    order = ok(await setNote(tokens.WAITER, order, '  Less spicy  '), 'captain sets the note');
    assert.equal(order.kitchenNote, 'Less spicy');

    const fired = ok(await fireOrder(tokens.WAITER, order.id, order.version), 'fire');
    const kotId = fired.kot.id;
    assert.equal(fired.kot.kitchenNote, 'Less spicy', 'the ticket carries it');

    const ticket = ok(await request('GET', `/api/v1/kots/${kotId}/ticket?width=32`, { token: tokens.WAITER }), 'ticket');
    assert.match(ticket.text, /FOR ALL ITEMS: Less spicy/);

    order = ok(await setNote(tokens.WAITER, fired.order, 'Less spicy, Jain'), 'changed after sending');
    assert.equal(ok(await readKot(tokens.WAITER, kotId), 'kot').kitchenNote, 'Less spicy, Jain', 'the sent ticket follows');

    order = ok(await request('POST', `/api/v1/orders/${order.id}/lines`, { token: tokens.WAITER, body: { version: order.version, lines: [{ menuItemId: item.id, quantity: 1 }] } }), 'add');
    const second = ok(await fireOrder(tokens.WAITER, order.id, order.version), 'second round');
    assert.equal(second.kot.kitchenNote, 'Less spicy, Jain', 'a later round carries it');

    order = ok(await setNote(tokens.WAITER, second.order, ''), 'cleared');
    assert.equal(order.kitchenNote, null);
    assert.equal(ok(await readKot(tokens.WAITER, kotId), 'kot').kitchenNote, null);
  });

  it('is refused on a stale version, to the kitchen login, from another restaurant and on a cancelled order', async () => {
    const floor = await seedFloor();
    const { tokens, item } = floor;
    const order = ok(await openOrder(tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: item.id, quantity: 1 }] }), 'order');
    assert.equal((await setNote(tokens.WAITER, order, 'Jain', order.version + 3)).status, 409, 'stale');
    assert.equal((await setNote(tokens.KITCHEN, order, 'Jain')).status, 403, 'kitchen login');
    const other = await seedFloor();
    assert.equal((await setNote(other.tokens.WAITER, order, 'Jain')).status, 404, 'another restaurant');
    assert.equal((await setNote(tokens.WAITER, order, 'x'.repeat(201))).status, 400, 'too long');

    const closed = ok(await request('POST', `/api/v1/orders/${order.id}/close`, { token: tokens.WAITER, body: { version: order.version } }), 'close');
    const refused = await setNote(tokens.WAITER, closed, 'Jain');
    assert.equal(refused.status, 422);
    assert.equal(refused.body.error.message, 'This order is closed, so its note cannot change.');
  });
});

describe("the guest's details before the first KOT", () => {
  it('records the visit and the consent once, and never swaps the mobile', async () => {
    const floor = await seedFloor();
    const { tokens, item } = floor;
    let order = ok(await openOrder(tokens.WAITER, { tableId: floor.table.id, guestCount: 2, lines: [{ menuItemId: item.id, quantity: 1 }] }), 'seated with guests only');
    assert.equal(order.customerPhone, null);

    order = ok(await setGuest(tokens.WAITER, order, { customerName: 'Meera Joshi', customerPhone: '98250 12345', offersConsent: true }), 'details');
    assert.equal(order.customerName, 'Meera Joshi');
    assert.equal(order.customerPhone, '9825012345');

    const customer = await Customer.findOne({ restaurantId: floor.restaurant._id, phone: '9825012345' }).lean();
    assert.equal(customer.visitCount, 1);
    assert.equal(customer.name, 'Meera Joshi');
    assert.equal(customer.offers.given, true);

    order = ok(await setGuest(tokens.WAITER, order, { customerPhone: '9825012345' }), 'the same mobile again');
    const again = await Customer.findOne({ restaurantId: floor.restaurant._id, phone: '9825012345' }).lean();
    assert.equal(again.visitCount, 1, 'no second visit');

    const swapped = await setGuest(tokens.WAITER, order, { customerPhone: '9898989898' });
    assert.equal(swapped.status, 422);
    assert.equal(swapped.body.error.message, "This order already has the guest's mobile.");

    assert.equal((await setGuest(tokens.WAITER, order, { offersConsent: true })).status, 400, 'consent needs a mobile');
    assert.equal((await setGuest(tokens.KITCHEN, order, { customerName: 'X' })).status, 403, 'kitchen login');
    const other = await seedFloor();
    assert.equal((await setGuest(other.tokens.WAITER, order, { customerName: 'X' })).status, 404, 'another restaurant');
    ok(await fireOrder(tokens.WAITER, order.id, order.version), 'and it goes to the kitchen');
  });

  it('is refused once the order has a bill', async () => {
    const floor = await seedFloor();
    const billed = await readyToBillOrder(floor);
    ok(await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: billed.id, version: billed.version } }), 'bill');
    const current = ok(await readOrder(floor.tokens.WAITER, billed.id), 'read');
    const refused = await setGuest(floor.tokens.WAITER, current, { customerName: 'Late Guest' });
    assert.equal(refused.status, 422);
    assert.equal(refused.body.error.message, "This order has a bill, so the guest's details are on it already.");
  });
});

describe('only whole voids in the void lists', () => {
  it('a bill voided to cancel an item is on no void list, but stays in the invoice register', async () => {
    const floor = await seedFloor();
    const { tokens } = floor;
    const second = ok(await createMenuItem(tokens.OWNER, { name: 'Dahi Puri', priceInPaise: 12000, taxRateBps: 500 }), 'dish');
    const order = await readyToBillOrder(floor, [
      { menuItemId: floor.item.id, quantity: 1 },
      { menuItemId: second.id, quantity: 1 },
    ]);
    let bill = ok(await request('POST', '/api/v1/bills', { token: tokens.CASHIER, body: { orderId: order.id, version: order.version } }), 'bill');
    bill = ok(await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: tokens.CASHIER, body: { method: 'CARD', amountInPaise: bill.grandTotalInPaise } }), 'paid');
    const puri = bill.lines.find((line) => line.itemName === 'Dahi Puri');
    const result = ok(
      await request('POST', `/api/v1/bills/${bill.id}/cancel-lines`, {
        token: tokens.MANAGER,
        body: { lines: [{ lineId: puri.orderLineId, wasPrepared: true }], reasonCode: 'MODIFICATION' },
      }),
      'cancel the puri',
    );
    assert.equal(result.orderCancelled, false);
    assert.equal((await Bill.findOne({ restaurantId: floor.restaurant._id, _id: bill.id }).lean()).isVoidedToChangeItems, true, 'marked');

    // A second table, voided as a whole by the manager, for comparison.
    const table2 = ok(await request('POST', '/api/v1/tables', { token: tokens.OWNER, body: { name: 'T2' } }), 'table');
    const wholeOrder = await readyToBillOrder({ ...floor, table: table2 });
    const whole = ok(await request('POST', '/api/v1/bills', { token: tokens.CASHIER, body: { orderId: wholeOrder.id, version: wholeOrder.version } }), 'second bill');
    ok(await request('POST', `/api/v1/bills/${whole.id}/void`, { token: tokens.MANAGER, body: { reasonCode: 'DUPLICATE' } }), 'manager voids');
    assert.equal((await Bill.findOne({ restaurantId: floor.restaurant._id, _id: whole.id }).lean()).isVoidedToChangeItems, false);

    const today = businessDateFor(nowUtc());
    const range = `from=${today}&to=${today}`;
    const numbers = (rows) => rows.map((row) => row.billNumber);

    const list = await request('GET', `/api/v1/bills?${range}&includeVoided=true`, { token: tokens.MANAGER });
    const voidedListed = list.body.data.filter((row) => row.isVoided).map((row) => row.billNumber);
    assert.deepEqual(voidedListed, [whole.billNumber], 'the bills list');
    assert.equal(list.body.meta.totals.voidedCount, 1, 'its Voided count');

    const summary = ok(await request('GET', `/api/v1/bills/summary?${range}`, { token: tokens.MANAGER }), 'summary');
    assert.equal(summary.voidedCount, 1);

    const r19 = ok(await request('GET', `/api/v1/reports/v2/bills?${range}&status=VOIDED`, { token: tokens.OWNER }), 'R19');
    assert.deepEqual(numbers(r19.rows), [whole.billNumber], 'R19 Voided');
    const byNumber = ok(await request('GET', `/api/v1/reports/v2/bills?${range}&status=VOIDED&billNumber=${encodeURIComponent(bill.billNumber)}`, { token: tokens.OWNER }), 'R19 by number');
    assert.deepEqual(numbers(byNumber.rows), [bill.billNumber], 'found by its number, as the register drills');

    const r15 = ok(await request('GET', `/api/v1/reports/v2/cancellations?${range}`, { token: tokens.OWNER }), 'R15');
    assert.deepEqual(numbers(section(r15, 'voids').rows), [whole.billNumber], "R15's voids");
    assert.equal(section(r15, 'items'), undefined, 'nor the dish: R15 shows whole cancellations only');

    const r1 = ok(await request('GET', '/api/v1/reports/v2/today', { token: tokens.OWNER }), 'R1');
    assert.deepEqual(section(r1, 'alerts').rows.filter((row) => row.kindCode === 'VOID').map((row) => row.detail), [whole.billNumber], "R1's alerts");

    const r2 = ok(await request('GET', `/api/v1/reports/v2/day-close?date=${today}`, { token: tokens.OWNER }), 'R2');
    assert.equal(section(r2, 'controls').rows.find((row) => row.line === 'Voided bills').count, 1, "R2's Voided bills");
    assert.equal(section(r2, 'controls').rows.find((row) => row.line === 'Items cancelled'), undefined, "R2 lists no single dishes");
    const day = ok(await request('GET', `/api/v1/day-close/${today}`, { token: tokens.OWNER }), 'day');
    assert.equal(day.figures.controls.cancelledItems.count, 1, 'the stored figures still count the dish, for C12');

    const register = ok(await request('GET', `/api/v1/reports/v2/invoice-register?${range}`, { token: tokens.OWNER }), 'R10');
    const voidedInRegister = register.rows.filter((row) => row.status === 'Voided').map((row) => row.billNumber).sort();
    assert.deepEqual(voidedInRegister, [bill.billNumber, whole.billNumber].sort(), 'the register keeps every number');
  });

  it('cancelling every item on a paid bill is a whole void', async () => {
    const floor = await seedFloor();
    const order = await readyToBillOrder(floor);
    let bill = ok(await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: order.id, version: order.version } }), 'bill');
    bill = ok(await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: floor.tokens.CASHIER, body: { method: 'CARD', amountInPaise: bill.grandTotalInPaise } }), 'paid');
    const result = ok(
      await request('POST', `/api/v1/bills/${bill.id}/cancel-lines`, {
        token: floor.tokens.MANAGER,
        body: { lines: [{ lineId: bill.lines[0].orderLineId, wasPrepared: true }], reasonCode: 'MODIFICATION' },
      }),
      'cancel everything',
    );
    assert.equal(result.orderCancelled, true);
    assert.equal((await Bill.findOne({ restaurantId: floor.restaurant._id, _id: bill.id }).lean()).isVoidedToChangeItems, false);
  });
});
