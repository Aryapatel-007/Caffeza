/**
 * P29 Part B: revising a bill nothing has been paid on, instead of voiding it.
 * docs/API-CONTRACT.md M3 section 16.8, M2 sections 12.4 to 12.10, M19
 * sections 17 and 18 (R2, R10, R15, C13).
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { AuditLog } from '../models/AuditLog.js';
import { Bill } from '../models/Bill.js';
import { ALL_MODELS } from '../models/index.js';
import { checkC13 } from '../services/reconciliationService.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { GOLDEN_DATE, ist, setupGoldenRestaurant } from './helpers/goldenDay.js';
import { createMenuItem, readOrder, seedFloor } from './helpers/m2Fixtures.js';
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

afterEach(() => resetClockForTests());

const ok = (response, what) => {
  assert.ok(response.status >= 200 && response.status < 300, `${what}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data;
};
const lineOf = (bill, name) => bill.lines.find((line) => line.itemName.includes(name));
const removeLines = (token, billId, body) => request('POST', `/api/v1/bills/${billId}/remove-lines`, { token, body });
const readBill = async (token, billId) => ok(await request('GET', `/api/v1/bills/${billId}`, { token }), 'read bill');
const settings = (token, body) => request('PATCH', '/api/v1/settings', { token, body: { reason: 'P29 test', ...body } });

/** Fires every pending line, readies every ticket and serves every ready line. */
async function serveEverything(tokens, orderId) {
  let order = ok(await readOrder(tokens.WAITER, orderId), 'read');
  if (order.lines.some((line) => line.status === 'PENDING')) {
    const fired = ok(await request('POST', `/api/v1/orders/${orderId}/fire`, { token: tokens.WAITER, body: { version: order.version } }), 'fire');
    for (const kot of fired.kots) ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: tokens.KITCHEN ?? tokens.MANAGER }), 'ready');
  } else {
    const kots = ok(await request('GET', '/api/v1/kots?status=PENDING,IN_PROGRESS&limit=200', { token: tokens.MANAGER }), 'kots');
    for (const kot of kots.filter((entry) => entry.orderId === orderId)) {
      ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: tokens.KITCHEN ?? tokens.MANAGER }), 'ready');
    }
  }
  order = ok(await readOrder(tokens.WAITER, orderId), 'read');
  for (const line of order.lines.filter((entry) => entry.status === 'READY')) {
    order = ok(
      await request('PATCH', `/api/v1/orders/${orderId}/lines/${line.id}/served`, { token: tokens.WAITER, body: { version: order.version } }),
      'serve',
    );
  }
  return ok(await readOrder(tokens.WAITER, orderId), 'read');
}

/** An order of `lines` on a table, served and billed by the counter. */
async function billedOrder(floor, lines, { tableId = floor.table.id } = {}) {
  const opened = ok(await request('POST', '/api/v1/orders', { token: floor.tokens.WAITER, body: { orderType: 'DINE_IN', tableId, lines } }), 'open');
  const served = await serveEverything(floor.tokens, opened.id);
  assert.equal(served.status, 'READY_TO_BILL');
  return ok(await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: served.id, version: served.version } }), 'bill');
}

let dish = 0;
async function twoDishFloor() {
  const floor = await seedFloor();
  dish += 1;
  const second = ok(await createMenuItem(floor.tokens.OWNER, { name: `Masala Pav Bhaji ${dish}`, priceInPaise: 27000, taxRateBps: 500 }), 'dish');
  floor.tokens.KITCHEN ??= floor.tokens.MANAGER;
  return { floor, second };
}

async function managerApproval(floor, pin = '2468') {
  const manager = ok(await request('GET', '/api/v1/auth/me', { token: floor.tokens.MANAGER }), 'me').user;
  ok(await request('PATCH', `/api/v1/users/${manager.id}/pin`, { token: floor.tokens.OWNER, body: { pin } }), 'pin');
  return { approverId: manager.id, pin };
}

describe('golden day B05, the shake taken off before payment', () => {
  let golden;
  let bill;
  let shake;

  before(async () => {
    golden = await setupGoldenRestaurant({ name: 'Revision Cafe', invoiceSeries: false });
    ok(await settings(golden.tokens.OWNER, { invoice: { mode: 'PREFIX', prefix: 'CFA/C/', startingNumber: 22446 } }), 'series');
    const { tokens, people, ids } = golden;
    setClockForTests(ist('15:05'));
    const items = ['Half & Half Pizza', 'Ferrero Hazelnut Shake', 'Water Bottle'].map((name) => ({ menuItemId: ids.items[name], quantity: 1 }));
    const opened = ok(
      await request('POST', '/api/v1/orders', { token: people['Budha Singh'], body: { orderType: 'DINE_IN', tableId: ids.tables['Table 3'], guestCount: 2, lines: items } }),
      'open',
    );
    setClockForTests(ist('15:50'));
    const served = await serveEverything({ ...tokens, WAITER: people['Budha Singh'], KITCHEN: tokens.MANAGER }, opened.id);
    bill = ok(await request('POST', '/api/v1/bills', { token: tokens.CASHIER, body: { orderId: served.id, version: served.version } }), 'bill');
    shake = lineOf(bill, 'Ferrero');
  });

  it('is CFA/C/22446 for ₹795.00 before anything changes', () => {
    assert.equal(bill.billNumber, 'CFA/C/22446');
    assert.equal(bill.grandTotalInPaise, 79500);
    assert.equal(bill.revision, 0);
  });

  it('previews ₹449.00, writes nothing, and asks no PIN', async () => {
    setClockForTests(ist('15:51'));
    const preview = ok(
      await removeLines(golden.tokens.CASHIER, bill.id, { lines: [{ lineId: shake.orderLineId, wasPrepared: true }], reasonCode: 'MODIFICATION', preview: true }),
      'preview',
    );
    assert.deepEqual(
      { preview: preview.preview, billNumber: preview.billNumber, before: preview.previousGrandTotalInPaise, after: preview.newGrandTotalInPaise },
      { preview: true, billNumber: 'CFA/C/22446', before: 79500, after: 44900 },
    );
    assert.equal(preview.removed[0].itemName, 'Ferrero Hazelnut Shake');
    const still = await readBill(golden.tokens.OWNER, bill.id);
    assert.equal(still.revision, 0);
    assert.equal(still.grandTotalInPaise, 79500);
    assert.equal(lineOf(still, 'Ferrero') !== undefined, true);
  });

  it('keeps CFA/C/22446 and revises it to ₹449.00, voiding nothing', async () => {
    setClockForTests(ist('15:52'));
    const revised = ok(
      await removeLines(golden.tokens.CASHIER, bill.id, { lines: [{ lineId: shake.orderLineId, wasPrepared: true }], reasonCode: 'MODIFICATION', approval: golden.managerApproval }),
      'remove',
    );
    assert.equal(revised.billNumber, 'CFA/C/22446');
    assert.equal(revised.subtotalInPaise, 42761);
    assert.equal(revised.totalTaxInPaise, 2138);
    assert.equal(revised.roundOffInPaise, 1);
    assert.equal(revised.grandTotalInPaise, 44900);
    assert.equal(revised.revision, 1);
    assert.equal(revised.revisions.length, 1);
    assert.equal(revised.revisions[0].kind, 'REMOVED');
    assert.equal(revised.revisions[0].previousGrandTotalInPaise, 79500);
    assert.equal(revised.revisions[0].newGrandTotalInPaise, 44900);
    assert.equal(revised.revisions[0].wasPrinted, false);
    assert.equal(revised.revisable, true);
    assert.equal(lineOf(revised, 'Ferrero'), undefined);
    // The cashier did not need a PIN for an unprinted bill... unless the kitchen had it: it did, so the manager approved.
    assert.ok(revised.revisions[0].approvedBy);

    assert.equal(await Bill.countDocuments({ restaurantId: golden.restaurant._id, isVoided: true }), 0);
    const order = ok(await readOrder(golden.tokens.OWNER, revised.orderId), 'order');
    const cancelled = order.lines.find((line) => line.itemName === 'Ferrero Hazelnut Shake');
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal(cancelled.removedFromBillId, bill.id);
    assert.equal(cancelled.wasPrepared, true);

    const audit = await AuditLog.findOne({ restaurantId: golden.restaurant._id, action: 'BILL_REVISED' }).lean();
    assert.equal(audit.amountInPaise, 79500 - 44900);
    assert.equal(audit.entityLabel, 'CFA/C/22446');
    assert.equal(audit.details.kind, 'REMOVED');
  });

  it('takes ₹449.00 in cash, and C1 to C4 and C13 pass for the day', async () => {
    setClockForTests(ist('15:54'));
    const paid = ok(await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: golden.tokens.CASHIER, body: { method: 'CASH', amountInPaise: 44900 } }), 'pay');
    assert.equal(paid.status, 'PAID');
    setClockForTests(ist('23:00'));
    const day = ok(await request('GET', `/api/v1/day-close/${GOLDEN_DATE}`, { token: golden.tokens.OWNER }), 'day');
    for (const id of ['C1', 'C2', 'C3', 'C4', 'C6', 'C7', 'C13']) {
      const check = day.checks.find((entry) => entry.id === id);
      assert.equal(check?.passed, true, `${id}: ${JSON.stringify(check)}`);
    }
    assert.deepEqual(day.figures.controls.billRevisions, { count: 1, removedValueInPaise: 34600, addedValueInPaise: 0, afterPrintingCount: 0 });
    assert.equal(day.figures.controls.voidedBills.count, 0);
  });

  it('R15 shows the shake as removed before payment and no void; R2 and R10 show the revision', async () => {
    setClockForTests(ist('23:00'));
    const query = `from=${GOLDEN_DATE}&to=${GOLDEN_DATE}`;
    const r15 = ok(await request('GET', `/api/v1/reports/v2/cancellations?${query}`, { token: golden.tokens.OWNER }), 'R15');
    const section = (key) => r15.sections.find((entry) => entry.key === key);
    const items = section('items').rows;
    assert.equal(items.length, 1);
    assert.equal(items[0].itemName, 'Ferrero Hazelnut Shake');
    assert.equal(items[0].stage, 'REMOVED_FROM_BILL');
    assert.equal(items[0].stageLabel, 'Removed from the bill before payment');
    assert.equal(section('voids').rows.length, 0);
    const changes = section('billChanges');
    assert.equal(changes.rows.length, 1);
    assert.equal(changes.rows[0].billNumber, 'CFA/C/22446');
    assert.equal(changes.rows[0].change, 'Removed');
    assert.equal(changes.rows[0].beforeInPaise, 79500);
    assert.equal(changes.rows[0].afterInPaise, 44900);
    assert.equal(changes.rows[0].afterPrinting, 'No');
    assert.equal(changes.totals.removedValueInPaise, 34600);
    assert.equal(r15.checks.find((check) => check.id === 'C13').passed, true);

    const r2 = ok(await request('GET', `/api/v1/reports/v2/day-close?date=${GOLDEN_DATE}`, { token: golden.tokens.OWNER }), 'R2');
    const controls = r2.sections.find((entry) => entry.key === 'controls').rows;
    const changed = controls.find((row) => row.line === 'Bills changed before payment');
    assert.equal(changed.count, 1);
    assert.equal(changed.amountInPaise, 34600);

    const r10 = ok(await request('GET', `/api/v1/reports/v2/invoice-register?${query}`, { token: golden.tokens.OWNER }), 'R10');
    const rows = r10.rows.filter((row) => row.billNumber === 'CFA/C/22446');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].revisedText, 'Revised 1');
    assert.equal(r10.totals.issued, 1);
  });

  it('C13 fails, alone, when a revised bill\'s total no longer matches its last revision', async () => {
    const stored = await Bill.findOne({ restaurantId: golden.restaurant._id, _id: bill.id }).lean();
    assert.equal(checkC13([stored]).passed, true);
    const broken = { ...stored, grandTotalInPaise: stored.grandTotalInPaise + 100 };
    const result = checkC13([broken]);
    assert.equal(result.passed, false);
    assert.match(result.message, /CFA\/C\/22446 is ₹450\.00 but its last revision says ₹449\.00/);
    const unnumbered = { ...stored, revision: 2 };
    assert.equal(checkC13([unnumbered]).passed, false);
  });
});

describe('a printed bill', () => {
  it('needs a manager\'s PIN for a cashier, records wasPrinted, and prints as a new print', async () => {
    const { floor, second } = await twoDishFloor();
    const approval = await managerApproval(floor);
    const bill = await billedOrder(floor, [{ menuItemId: floor.item.id, quantity: 1 }, { menuItemId: second.id, quantity: 1 }]);
    ok(await request('POST', `/api/v1/bills/${bill.id}/printed`, { token: floor.tokens.CASHIER }), 'printed');

    const target = lineOf(bill, second.name);
    const body = { lines: [{ lineId: target.orderLineId, wasPrepared: false }], reasonCode: 'WRONG_ITEM' };
    // The line is served, so it went to the kitchen too: turn that rule off to test the printed rule alone.
    ok(await settings(floor.tokens.OWNER, { approvals: { lineCancel: false } }), 'settings');
    const refused = await removeLines(floor.tokens.CASHIER, bill.id, body);
    assert.equal(refused.status, 403, JSON.stringify(refused.body));

    const before = ok(await request('GET', `/api/v1/bills/${bill.id}/receipt`, { token: floor.tokens.CASHIER }), 'receipt');
    assert.match(before.text, /DUPLICATE/);

    const revised = ok(await removeLines(floor.tokens.CASHIER, bill.id, { ...body, approval }), 'remove');
    assert.equal(revised.revisions[0].wasPrinted, true);
    assert.equal(String(revised.revisions[0].approvedBy), approval.approverId);

    const receipt = ok(await request('GET', `/api/v1/bills/${bill.id}/receipt`, { token: floor.tokens.CASHIER }), 'receipt');
    assert.match(receipt.text, /Revised bill/);
    assert.doesNotMatch(receipt.text, /DUPLICATE/);
    const invoice = ok(await request('GET', `/api/v1/bills/${bill.id}/invoice`, { token: floor.tokens.CASHIER }), 'invoice');
    assert.equal(invoice.isRevised, true);
    assert.equal(invoice.isDuplicate, false);

    const printed = ok(await request('POST', `/api/v1/bills/${bill.id}/printed`, { token: floor.tokens.CASHIER }), 'printed again');
    assert.equal(printed.isDuplicate, false);
    assert.equal(printed.revision, 1);
    const again = ok(await request('GET', `/api/v1/bills/${bill.id}/invoice`, { token: floor.tokens.CASHIER }), 'invoice');
    assert.equal(again.isDuplicate, true, 'a second print with no change is a duplicate');
  });

  it('needs no PIN once the owner switches the printed rule off', async () => {
    const { floor, second } = await twoDishFloor();
    const bill = await billedOrder(floor, [{ menuItemId: floor.item.id, quantity: 1 }, { menuItemId: second.id, quantity: 1 }]);
    ok(await request('POST', `/api/v1/bills/${bill.id}/printed`, { token: floor.tokens.CASHIER }), 'printed');
    ok(await settings(floor.tokens.OWNER, { approvals: { lineCancel: false, revisePrintedBill: false } }), 'settings');
    const revised = ok(
      await removeLines(floor.tokens.CASHIER, bill.id, { lines: [{ lineId: lineOf(bill, second.name).orderLineId, wasPrepared: false }], reasonCode: 'WRONG_ITEM' }),
      'remove',
    );
    assert.equal(revised.revisions[0].approvedBy, null);
  });
});

describe('when the bill cannot be revised, or would be emptied', () => {
  it('refuses a bill with ₹100 paid, and cancel after billing still voids and re-bills', async () => {
    const { floor, second } = await twoDishFloor();
    const bill = await billedOrder(floor, [{ menuItemId: floor.item.id, quantity: 1 }, { menuItemId: second.id, quantity: 1 }]);
    ok(await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: floor.tokens.CASHIER, body: { method: 'CASH', amountInPaise: 10000 } }), 'part pay');
    const read = await readBill(floor.tokens.OWNER, bill.id);
    assert.equal(read.revisable, false);
    assert.match(read.revisableReason, /Money has been taken/);

    const body = { lines: [{ lineId: lineOf(bill, second.name).orderLineId, wasPrepared: true }], reasonCode: 'MODIFICATION' };
    const refused = await removeLines(floor.tokens.MANAGER, bill.id, body);
    assert.equal(refused.status, 422);
    assert.equal(refused.body.error.code, 'BILL_NOT_REVISABLE');

    const cancelled = ok(await request('POST', `/api/v1/bills/${bill.id}/cancel-lines`, { token: floor.tokens.MANAGER, body }), 'cancel-lines');
    assert.equal(cancelled.voidedBillNumber, bill.billNumber);
    assert.notEqual(cancelled.bill.billNumber, bill.billNumber);
  });

  it('refuses taking every item off', async () => {
    const { floor, second } = await twoDishFloor();
    const bill = await billedOrder(floor, [{ menuItemId: floor.item.id, quantity: 1 }, { menuItemId: second.id, quantity: 1 }]);
    const response = await removeLines(floor.tokens.MANAGER, bill.id, {
      lines: bill.lines.map((line) => ({ lineId: line.orderLineId, wasPrepared: false })),
      reasonCode: 'WRONG_ITEM',
    });
    assert.equal(response.status, 422);
    assert.equal(response.body.error.message, 'To remove everything, cancel the order instead.');
  });

  it('with revisions switched off, behaves exactly as before P29', async () => {
    const { floor, second } = await twoDishFloor();
    ok(await settings(floor.tokens.OWNER, { billing: { reviseUnpaidBills: false } }), 'off');
    const bill = await billedOrder(floor, [{ menuItemId: floor.item.id, quantity: 1 }, { menuItemId: second.id, quantity: 1 }]);
    const refused = await removeLines(floor.tokens.MANAGER, bill.id, { lines: [{ lineId: lineOf(bill, second.name).orderLineId, wasPrepared: false }], reasonCode: 'WRONG_ITEM' });
    assert.equal(refused.body.error.code, 'BILL_NOT_REVISABLE');
    // Adding to the billed order is refused as before; reopen is the way.
    const order = ok(await readOrder(floor.tokens.WAITER, bill.orderId), 'order');
    const add = await request('POST', `/api/v1/orders/${order.id}/lines`, { token: floor.tokens.WAITER, body: { version: order.version, lines: [{ menuItemId: second.id, quantity: 1 }] } });
    assert.equal(add.status, 422);
  });
});

describe('the discount on a revised bill', () => {
  it('caps a flat discount at the new item total, and keeps a percent the same percent', async () => {
    const { floor, second } = await twoDishFloor();
    // Paneer Tikka ₹240 and the pav bhaji ₹270. A flat ₹300 off is more than the ₹240 left.
    const flat = await billedOrder(floor, [{ menuItemId: floor.item.id, quantity: 1 }, { menuItemId: second.id, quantity: 1 }]);
    ok(await request('POST', `/api/v1/bills/${flat.id}/discount`, { token: floor.tokens.MANAGER, body: { kind: 'FLAT', valueInPaise: 30000, reasonCode: 'REGULAR_GUEST' } }), 'flat');
    const capped = ok(await removeLines(floor.tokens.MANAGER, flat.id, { lines: [{ lineId: lineOf(flat, second.name).orderLineId, wasPrepared: false }], reasonCode: 'WRONG_ITEM' }), 'remove');
    assert.equal(capped.subtotalInPaise, 24000);
    assert.equal(capped.discount.amountInPaise, 24000);
    assert.equal(capped.discount.reasonCode, 'REGULAR_GUEST');
    assert.equal(capped.grandTotalInPaise, 0);
  });

  it('keeps a 10% discount at 10% of what is left', async () => {
    const { floor, second } = await twoDishFloor();
    const bill = await billedOrder(floor, [{ menuItemId: floor.item.id, quantity: 1 }, { menuItemId: second.id, quantity: 1 }]);
    ok(await request('POST', `/api/v1/bills/${bill.id}/discount`, { token: floor.tokens.MANAGER, body: { kind: 'PERCENT', rateBps: 1000, reasonCode: 'REGULAR_GUEST' } }), 'percent');
    const revised = ok(await removeLines(floor.tokens.MANAGER, bill.id, { lines: [{ lineId: lineOf(bill, second.name).orderLineId, wasPrepared: false }], reasonCode: 'WRONG_ITEM' }), 'remove');
    assert.equal(revised.discount.kind, 'PERCENT');
    assert.equal(revised.discount.rateBps, 1000);
    assert.equal(revised.discount.amountInPaise, 2400);
  });
});

describe('adding items to an unpaid bill', () => {
  it('revises it as ADDED, keeps its number, and takes no money until the kitchen has them ready', async () => {
    const { floor, second } = await twoDishFloor();
    const bill = await billedOrder(floor, [{ menuItemId: floor.item.id, quantity: 1 }]);
    let order = ok(await readOrder(floor.tokens.WAITER, bill.orderId), 'order');
    assert.equal(order.status, 'READY_TO_BILL');

    order = ok(
      await request('POST', `/api/v1/orders/${order.id}/lines`, { token: floor.tokens.WAITER, body: { version: order.version, lines: [{ menuItemId: second.id, quantity: 1 }] } }),
      'add',
    );
    assert.equal(order.status, 'OPEN');
    assert.equal(order.billId, bill.id);

    const revised = await readBill(floor.tokens.CASHIER, bill.id);
    assert.equal(revised.billNumber, bill.billNumber);
    assert.equal(revised.revision, 1);
    assert.equal(revised.revisions[0].kind, 'ADDED');
    assert.equal(revised.revisions[0].lines[0].itemName, second.name);
    assert.equal(revised.subtotalInPaise, 24000 + 27000);

    const early = await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: floor.tokens.CASHIER, body: { method: 'CASH', amountInPaise: revised.grandTotalInPaise } });
    assert.equal(early.status, 422);
    assert.equal(early.body.error.code, 'WAITING_FOR_KITCHEN');

    // The order's own lines change only through the bill while it has one.
    const added = order.lines.find((line) => line.itemName === second.name);
    const edit = await request('PATCH', `/api/v1/orders/${order.id}/lines/${added.id}`, { token: floor.tokens.WAITER, body: { version: order.version, quantity: 2 } });
    assert.equal(edit.status, 422);
    assert.match(edit.body.error.message, /Change the items from the bill/);

    const served = await serveEverything(floor.tokens, order.id);
    assert.equal(served.status, 'READY_TO_BILL');
    const paid = ok(await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: floor.tokens.CASHIER, body: { method: 'CASH', amountInPaise: revised.grandTotalInPaise } }), 'pay');
    assert.equal(paid.status, 'PAID');
    assert.equal(await Bill.countDocuments({ restaurantId: floor.restaurant._id, orderId: bill.orderId }), 1);
  });
});

describe('cancelling a whole order with an unpaid bill', () => {
  it('voids the bill with it, so Day Close is not left with an unpaid bill', async () => {
    const { floor } = await twoDishFloor();
    const bill = await billedOrder(floor, [{ menuItemId: floor.item.id, quantity: 1 }]);
    const order = ok(await readOrder(floor.tokens.MANAGER, bill.orderId), 'order');
    const cancelled = ok(
      await request('POST', `/api/v1/orders/${order.id}/cancel`, { token: floor.tokens.MANAGER, body: { version: order.version, reasonCode: 'GUEST_LEFT', wasPrepared: true } }),
      'cancel',
    );
    assert.equal(cancelled.status, 'CANCELLED');
    const voided = await readBill(floor.tokens.OWNER, bill.id);
    assert.equal(voided.isVoided, true);
    assert.equal(voided.voidReason, 'Order cancelled');
  });

  it('refuses when money is already on the bill', async () => {
    const { floor } = await twoDishFloor();
    const bill = await billedOrder(floor, [{ menuItemId: floor.item.id, quantity: 2 }]);
    ok(await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: floor.tokens.CASHIER, body: { method: 'CASH', amountInPaise: 10000 } }), 'part');
    const order = ok(await readOrder(floor.tokens.MANAGER, bill.orderId), 'order');
    const refused = await request('POST', `/api/v1/orders/${order.id}/cancel`, { token: floor.tokens.MANAGER, body: { version: order.version, reasonCode: 'GUEST_LEFT', wasPrepared: true } });
    assert.equal(refused.status, 422);
    assert.match(refused.body.error.message, /Void the bill first/);
  });
});

describe('who may remove an item', () => {
  it('is the till and captains; the kitchen and storekeeper are refused', async () => {
    const { floor, second } = await twoDishFloor();
    const bill = await billedOrder(floor, [{ menuItemId: floor.item.id, quantity: 1 }, { menuItemId: second.id, quantity: 1 }]);
    const body = { lines: [{ lineId: lineOf(bill, second.name).orderLineId, wasPrepared: false }], reasonCode: 'WRONG_ITEM', preview: true };
    for (const role of ['KITCHEN', 'STOREKEEPER']) {
      assert.equal((await removeLines(floor.tokens[role], bill.id, body)).status, 403, role);
    }
    assert.equal((await removeLines(null, bill.id, body)).status, 401);
  });

  it('answers 404 for another restaurant\'s bill', async () => {
    const { floor, second } = await twoDishFloor();
    const bill = await billedOrder(floor, [{ menuItemId: floor.item.id, quantity: 1 }, { menuItemId: second.id, quantity: 1 }]);
    const other = await seedFloor();
    const response = await removeLines(other.tokens.MANAGER, bill.id, { lines: [{ lineId: bill.lines[0].orderLineId }], reasonCode: 'WRONG_ITEM' });
    assert.equal(response.status, 404);
  });
});
