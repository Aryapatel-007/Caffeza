/**
 * P66. Part payment across methods, Change payments, Change discount or GST,
 * and Price includes GST. API-CONTRACT "P66".
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { AuditLog } from '../models/AuditLog.js';
import { Bill } from '../models/Bill.js';
import { ALL_MODELS } from '../models/index.js';
import { exclusiveOfGst } from '../utils/tax.js';
import { createMenuItem, readyToBillOrder, seedFloor } from './helpers/m2Fixtures.js';
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

/** Two Paneer Tikka (₹240.00 at 5%) on a served table, billed: ₹504.00. */
async function billedTable(body = {}, token = 'CASHIER') {
  const floor = await seedFloor();
  floor.tokens.KITCHEN ??= floor.tokens.MANAGER;
  const order = await readyToBillOrder(floor, [{ menuItemId: floor.item.id, quantity: 2 }]);
  const bill = ok(await request('POST', '/api/v1/bills', { token: floor.tokens[token], body: { orderId: order.id, version: order.version, ...body } }), 'bill');
  return { floor, order, bill };
}

const pay = (token, billId, body) => request('POST', `/api/v1/bills/${billId}/payments`, { token, body });
const split = (token, billId, payments) => request('POST', `/api/v1/bills/${billId}/payments/split`, { token, body: { payments } });
const change = (token, billId, body) => request('POST', `/api/v1/bills/${billId}/payments/change`, { token, body });
const reprice = (token, billId, body) => request('POST', `/api/v1/bills/${billId}/reprice`, { token, body });

describe('exclusiveOfGst', () => {
  it('takes GST out of a price, half away from zero', () => {
    assert.equal(exclusiveOfGst(10000, 500), 9524);
    assert.equal(exclusiveOfGst(10500, 500), 10000);
    assert.equal(exclusiveOfGst(11800, 1800), 10000);
    assert.equal(exclusiveOfGst(12345, 0), 12345);
    assert.throws(() => exclusiveOfGst(10.5, 500), TypeError);
  });
});

describe('part payment across methods', () => {
  it('records UPI and cash together, paying the bill', async () => {
    const { floor, bill } = await billedTable();
    assert.equal(bill.grandTotalInPaise, 50400);
    const paid = ok(
      await split(floor.tokens.CASHIER, bill.id, [
        { method: 'UPI', amountInPaise: 20000, reference: 'T1' },
        { method: 'CASH', amountInPaise: 30400 },
      ]),
      'split',
    );
    assert.equal(paid.status, 'PAID');
    assert.deepEqual(paid.payments.map((payment) => [payment.method, payment.amountInPaise]), [['UPI', 20000], ['CASH', 30400]]);
  });

  it('records nothing when one row is refused', async () => {
    const { floor, bill } = await billedTable();
    const refused = await split(floor.tokens.CASHIER, bill.id, [
      { method: 'UPI', amountInPaise: 20000 },
      { method: 'OTHER', amountInPaise: 30400 },
    ]);
    assert.equal(refused.status, 422, JSON.stringify(refused.body));
    const stored = await Bill.findOne({ restaurantId: floor.restaurant._id, _id: bill.id }).lean();
    assert.equal(stored.payments.length, 0);
    assert.equal(stored.status, 'UNPAID');

    const over = await split(floor.tokens.CASHIER, bill.id, [
      { method: 'UPI', amountInPaise: 40000 },
      { method: 'CASH', amountInPaise: 20000 },
    ]);
    assert.equal(over.status, 422);
    assert.equal((await Bill.findOne({ restaurantId: floor.restaurant._id, _id: bill.id }).lean()).payments.length, 0);

    const twice = await split(floor.tokens.CASHIER, bill.id, [
      { method: 'CASH', amountInPaise: 100 },
      { method: 'CASH', amountInPaise: 100 },
    ]);
    assert.equal(twice.status, 400);
  });

  it('leaves the rest outstanding when the rows are less than the bill', async () => {
    const { floor, bill } = await billedTable();
    const part = ok(await split(floor.tokens.CASHIER, bill.id, [{ method: 'UPI', amountInPaise: 10000 }, { method: 'CASH', amountInPaise: 10000 }]), 'split');
    assert.equal(part.status, 'UNPAID');
    assert.equal(part.amountPaidInPaise, 20000);
  });
});

describe('Change payments on a paid bill', () => {
  it('replaces cash with UPI and cash, keeping what was there', async () => {
    const { floor, bill } = await billedTable();
    ok(await pay(floor.tokens.CASHIER, bill.id, { method: 'CASH', amountInPaise: 50400 }), 'pay');

    const changed = ok(
      await change(floor.tokens.MANAGER, bill.id, {
        payments: [{ method: 'UPI', amountInPaise: 20000 }, { method: 'CASH', amountInPaise: 30400 }],
        reason: 'Guest paid part by UPI',
      }),
      'change',
    );
    assert.equal(changed.status, 'PAID');
    assert.equal(changed.amountPaidInPaise, 50400);
    assert.deepEqual(changed.payments.map((payment) => [payment.method, payment.amountInPaise]), [['UPI', 20000], ['CASH', 30400]]);
    assert.equal(changed.payments[0].businessDate, bill.businessDate);
    assert.equal(changed.paymentChanges.length, 1);
    assert.deepEqual(changed.paymentChanges[0].before.map((payment) => [payment.method, payment.amountInPaise]), [['CASH', 50400]]);
    assert.equal(await AuditLog.countDocuments({ restaurantId: floor.restaurant._id, action: 'PAYMENTS_CHANGED' }), 1);
  });

  it('refuses a cashier, a different total and a card-machine payment', async () => {
    const { floor, bill } = await billedTable();
    ok(await pay(floor.tokens.CASHIER, bill.id, { method: 'CASH', amountInPaise: 50400 }), 'pay');
    const rows = [{ method: 'UPI', amountInPaise: 50400 }];

    assert.equal((await change(floor.tokens.CASHIER, bill.id, { payments: rows, reason: 'x' })).status, 403);
    const short = await change(floor.tokens.MANAGER, bill.id, { payments: [{ method: 'UPI', amountInPaise: 50000 }], reason: 'x' });
    assert.equal(short.status, 422);
    assert.match(short.body.error.message, /add up to what was paid/);

    await Bill.updateOne({ restaurantId: floor.restaurant._id, _id: bill.id }, { $set: { 'payments.0.terminal': { provider: 'PINE_LABS', ptrid: '1' } } });
    const machine = await change(floor.tokens.MANAGER, bill.id, { payments: rows, reason: 'x' });
    assert.equal(machine.status, 422);
    assert.match(machine.body.error.message, /card machine/);
    assert.equal((await Bill.findOne({ restaurantId: floor.restaurant._id, _id: bill.id }).lean()).payments[0].method, 'CASH');
  });
});

describe('Change discount or GST after billing', () => {
  it('bills again with the discount and hands back the cash over it; a preview writes nothing', async () => {
    const { floor, bill } = await billedTable();
    ok(await pay(floor.tokens.CASHIER, bill.id, { method: 'CASH', amountInPaise: 50400 }), 'pay');
    const discount = { kind: 'PERCENT', rateBps: 1000, reasonCode: 'REGULAR_GUEST' };
    const billsBefore = await Bill.countDocuments({ restaurantId: floor.restaurant._id });

    const preview = ok(await reprice(floor.tokens.MANAGER, bill.id, { discount, reason: 'Regular', preview: true }), 'preview');
    assert.equal(preview.preview, true);
    assert.equal(preview.newBillTotalInPaise, 45400);
    assert.equal(preview.cashToGiveBackInPaise, 5000);
    assert.equal(await Bill.countDocuments({ restaurantId: floor.restaurant._id }), billsBefore);
    assert.equal((await Bill.findOne({ restaurantId: floor.restaurant._id, _id: bill.id }).lean()).isVoided, false);

    const result = ok(await reprice(floor.tokens.MANAGER, bill.id, { discount, reason: 'Regular' }), 'reprice');
    assert.equal(result.bill.grandTotalInPaise, 45400);
    assert.equal(result.bill.discount.amountInPaise, 4800);
    assert.equal(result.bill.status, 'PAID');
    assert.equal(result.cashToGiveBackInPaise, 5000);
    assert.notEqual(result.bill.billNumber, bill.billNumber);
    const old = await Bill.findOne({ restaurantId: floor.restaurant._id, _id: bill.id }).lean();
    assert.equal(old.isVoided, true);
    assert.equal(old.isVoidedToChangeItems, true);
    assert.equal(old.voidReasonCode, 'DISCOUNT_CHANGED');
    assert.equal(await AuditLog.countDocuments({ restaurantId: floor.restaurant._id, action: 'BILL_REPRICED' }), 1);

    // Taking the discount off bills the full total, the rest to collect.
    const back = ok(await reprice(floor.tokens.OWNER, result.bill.id, { discount: null, reason: 'Wrong guest' }), 'reprice back');
    assert.equal(back.bill.grandTotalInPaise, 50400);
    assert.equal(back.bill.status, 'UNPAID');
    assert.equal(back.bill.amountPaidInPaise, 45400);
  });

  it('refuses a cashier and an empty change', async () => {
    const { floor, bill } = await billedTable();
    assert.equal((await reprice(floor.tokens.CASHIER, bill.id, { pricesIncludeGst: true, reason: 'x' })).status, 403);
    assert.equal((await reprice(floor.tokens.MANAGER, bill.id, { reason: 'x' })).status, 400);
  });
});

describe('Price includes GST', () => {
  it('bills ₹100.00 at 5% as ₹95.24 and ₹4.76, and the shares balance', async () => {
    const floor = await seedFloor();
    floor.tokens.KITCHEN ??= floor.tokens.MANAGER;
    const item = ok(await createMenuItem(floor.tokens.OWNER, { name: 'Pani Puri', priceInPaise: 10000, taxRateBps: 500 }), 'item');
    const order = await readyToBillOrder({ ...floor, item }, [{ menuItemId: item.id, quantity: 1 }]);

    const refused = await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: order.id, version: order.version, pricesIncludeGst: true } });
    assert.equal(refused.status, 403);

    const bill = ok(await request('POST', '/api/v1/bills', { token: floor.tokens.MANAGER, body: { orderId: order.id, version: order.version, pricesIncludeGst: true } }), 'bill');
    assert.equal(bill.pricesIncludeGst, true);
    assert.equal(bill.subtotalInPaise, 9524);
    assert.equal(bill.totalTaxInPaise, 476);
    assert.equal(bill.grandTotalInPaise, 10000);
    assert.equal(bill.lines[0].unitPriceInPaise, 9524);
    assert.equal(bill.lines[0].menuUnitPriceInPaise, 10000);
    assert.equal(bill.lines[0].taxableInPaise + bill.lines[0].taxInPaise, 10000);
    assert.equal(await AuditLog.countDocuments({ restaurantId: floor.restaurant._id, action: 'GST_INCLUDED_IN_PRICE' }), 1);

    // Untick it after billing: GST goes on top again.
    const again = ok(await reprice(floor.tokens.MANAGER, bill.id, { pricesIncludeGst: false, reason: 'Guest wants GST added' }), 'reprice');
    assert.equal(again.bill.pricesIncludeGst, false);
    assert.equal(again.bill.grandTotalInPaise, 10500);
  });

  it('off, a bill is exactly as before', async () => {
    const { bill } = await billedTable();
    assert.equal(bill.pricesIncludeGst, false);
    assert.equal(bill.subtotalInPaise, 48000);
    assert.equal(bill.lines[0].menuUnitPriceInPaise, null);
  });
});
