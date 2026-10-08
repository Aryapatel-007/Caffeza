/**
 * P25 Part E: cancelling an item after the bill is made.
 * docs/API-CONTRACT.md M3 sections 16.4 and 16.5, M16 section 8.4.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { AuditLog } from '../models/AuditLog.js';
import { ALL_MODELS } from '../models/index.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { buildGoldenDay, ist } from './helpers/goldenDay.js';
import { createMenuItem, readyToBillOrder, seedFloor } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const GOLDEN_DATE = '2026-09-26';
let golden;

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  golden = await buildGoldenDay({ name: 'Cafezza' });
});

after(async () => {
  resetClockForTests();
  await stopTestServer();
  await stopTestDatabase();
});

const me = async (token) => (await request('GET', '/api/v1/auth/me', { token })).body.data.user;
const cancelLines = (token, billId, body) => request('POST', `/api/v1/bills/${billId}/cancel-lines`, { token, body });
const lineOf = (bill, name) => bill.lines.find((line) => line.itemName.includes(name));

let dishCounter = 0;

/** A floor with two dishes, one order of both, billed and paid by `method`. */
async function paidTwoDishBill({ method = 'CARD', discount = null, floor: given = null } = {}) {
  const floor = given ?? (await seedFloor());
  dishCounter += 1;
  const second = (await createMenuItem(floor.tokens.OWNER, { name: `Masala Pav Bhaji ${dishCounter}`, priceInPaise: 27000, taxRateBps: 500 })).body.data;
  const order = await readyToBillOrder(floor, [
    { menuItemId: floor.item.id, quantity: 1 },
    { menuItemId: second.id, quantity: 1 },
  ]);
  let bill = (await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: order.id, version: order.version } })).body.data;
  if (discount) {
    bill = (await request('POST', `/api/v1/bills/${bill.id}/discount`, { token: floor.tokens.MANAGER, body: discount })).body.data;
  }
  if (method) {
    const paid = await request('POST', `/api/v1/bills/${bill.id}/payments`, {
      token: floor.tokens.CASHIER,
      body: { method, amountInPaise: bill.grandTotalInPaise },
    });
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    bill = paid.body.data;
  }
  return { floor, bill, second };
}

async function managerWithPin(floor, pin = '2468') {
  const manager = await me(floor.tokens.MANAGER);
  const set = await request('PATCH', `/api/v1/users/${manager.id}/pin`, { token: floor.tokens.OWNER, body: { pin } });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  return manager;
}

describe('golden day B05, the shake cancelled after billing', () => {
  it('voids B05, re-bills ₹449.00 carrying UPI then cash, and says give back ₹346.00', async () => {
    const owner = golden.tokens.OWNER;
    const b05 = (await request('GET', `/api/v1/bills/${golden.ids.bills.B05}`, { token: owner })).body.data;
    assert.equal(b05.grandTotalInPaise, 79500);
    const shake = lineOf(b05, 'Ferrero');

    setClockForTests(ist('23:30'));
    try {
      const response = await cancelLines(golden.tokens.MANAGER, b05.id, {
        lines: [{ lineId: shake.orderLineId, wasPrepared: true }],
        reasonCode: 'MODIFICATION',
        note: 'Guest changed their mind',
      });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const result = response.body.data;

      assert.equal(result.voidedBillNumber, b05.billNumber);
      assert.equal(result.orderCancelled, false);
      assert.equal(result.cashToGiveBackInPaise, 34600);
      assert.deepEqual(result.refundsOwed, []);

      const bill = result.bill;
      assert.notEqual(bill.billNumber, b05.billNumber);
      assert.equal(bill.subtotalInPaise, 42761);
      assert.equal(bill.totalTaxInPaise, 2138);
      assert.equal(bill.roundOffInPaise, 1);
      assert.equal(bill.grandTotalInPaise, 44900);
      assert.equal(bill.status, 'PAID');
      assert.deepEqual(
        bill.payments.map((payment) => [payment.method, payment.amountInPaise]),
        [['UPI', 29500], ['CASH', 15400]],
      );
      assert.ok(bill.payments.every((payment) => payment.carriedFromBillId === b05.id));

      const voided = (await request('GET', `/api/v1/bills/${b05.id}`, { token: owner })).body.data;
      assert.equal(voided.isVoided, true);
      assert.equal(voided.voidReasonCode, 'ITEMS_CHANGED');
      assert.match(voided.voidReason, /Items cancelled after billing: Ferrero Hazelnut Shake/);

      const day = (await request('GET', `/api/v1/day-close/${GOLDEN_DATE}`, { token: owner })).body.data;
      for (const id of ['C1', 'C2', 'C3', 'C4']) {
        assert.equal(day.checks.find((check) => check.id === id).passed, true, `${id}: ${JSON.stringify(day.checks.find((check) => check.id === id))}`);
      }
      // The register shows the voided number and the new one, with no gap.
      const series = day.figures.invoices[0];
      assert.deepEqual(series.gaps, []);
      assert.equal(series.last, bill.billNumber);

      const audit = await AuditLog.findOne({ restaurantId: golden.restaurant._id, action: 'BILL_LINES_CANCELLED_AFTER_BILLING' }).lean();
      assert.equal(audit.details.newBillNumber, bill.billNumber);
      assert.equal(audit.amountInPaise, 79500 - 44900);
    } finally {
      resetClockForTests();
    }
  });
});

describe('cancelling after billing', () => {
  it('previews the same numbers, writes nothing, and uses no bill number', async () => {
    const { floor, bill, second } = await paidTwoDishBill({ method: 'CASH' });
    const body = { lines: [{ lineId: lineOf(bill, second.name).orderLineId, wasPrepared: true }], reasonCode: 'MODIFICATION' };

    // A cashier sees the numbers before the manager types a PIN.
    const preview = await cancelLines(floor.tokens.CASHIER, bill.id, { ...body, preview: true });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.data.preview, true);
    assert.equal(preview.body.data.voidedBillTotalInPaise, bill.grandTotalInPaise);
    assert.ok(preview.body.data.newBillTotalInPaise > 0 && preview.body.data.newBillTotalInPaise < bill.grandTotalInPaise);
    assert.equal(preview.body.data.cashToGiveBackInPaise, bill.grandTotalInPaise - preview.body.data.newBillTotalInPaise);

    const still = (await request('GET', `/api/v1/bills/${bill.id}`, { token: floor.tokens.OWNER })).body.data;
    assert.equal(still.isVoided, false);
    assert.equal(await AuditLog.countDocuments({ restaurantId: floor.restaurant._id, action: 'BILL_LINES_CANCELLED_AFTER_BILLING' }), 0);

    const done = await cancelLines(floor.tokens.OWNER, bill.id, body);
    assert.equal(done.body.data.bill.grandTotalInPaise, preview.body.data.newBillTotalInPaise);
    assert.equal(done.body.data.cashToGiveBackInPaise, preview.body.data.cashToGiveBackInPaise);
    // The preview's rolled-back number was never used: the new bill is the very next one.
    assert.equal(done.body.data.bill.billSequence, bill.billSequence + 1);
  });

  it('leaves a refund owed for card money, shown on Day Close as a warning, and records it done', async () => {
    const { floor, bill, second } = await paidTwoDishBill({ method: 'CARD' });
    const response = await cancelLines(floor.tokens.OWNER, bill.id, {
      lines: [{ lineId: lineOf(bill, second.name).orderLineId, wasPrepared: false }],
      reasonCode: 'WRONG_ITEM',
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const result = response.body.data;
    assert.equal(result.cashToGiveBackInPaise, 0);
    assert.equal(result.refundsOwed.length, 1);
    assert.equal(result.refundsOwed[0].methodName, 'Card');
    assert.equal(result.refundsOwed[0].amountInPaise, bill.grandTotalInPaise - result.bill.grandTotalInPaise);
    assert.equal(result.bill.status, 'PAID');

    const today = result.bill.businessDate;
    const day = (await request('GET', `/api/v1/day-close/${today}`, { token: floor.tokens.OWNER })).body.data;
    const warning = day.checks.find((check) => check.id === 'REFUNDS');
    assert.equal(warning.severity, 'WARNING');
    assert.equal(day.figures.refunds.owedInPaise, result.refundsOwed[0].amountInPaise);
    assert.equal(day.blockers.some((blocker) => /refund/i.test(blocker.message)), false);

    const r2 = (await request('GET', `/api/v1/reports/v2/day-close?date=${today}`, { token: floor.tokens.OWNER })).body.data;
    const controls = r2.sections.find((section) => section.key === 'controls');
    assert.equal(controls.rows.find((row) => row.line === 'Refunds owed').amountInPaise, result.refundsOwed[0].amountInPaise);
    const r5 = (await request('GET', `/api/v1/reports/v2/payments?from=${today}&to=${today}`, { token: floor.tokens.OWNER })).body.data;
    assert.equal(r5.sections.find((section) => section.key === 'refunds').totals.amountInPaise, result.refundsOwed[0].amountInPaise);

    const listed = await request('GET', '/api/v1/refunds?status=OWED', { token: floor.tokens.CASHIER });
    assert.equal(listed.body.data.length, 1);
    assert.equal((await request('POST', `/api/v1/refunds/${result.refundsOwed[0].id}/done`, { token: floor.tokens.CASHIER, body: { reference: 'RRN 1234' } })).status, 403);
    const done = await request('POST', `/api/v1/refunds/${result.refundsOwed[0].id}/done`, { token: floor.tokens.MANAGER, body: { reference: 'RRN 1234' } });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.data.status, 'REFUNDED');
    assert.equal((await request('POST', `/api/v1/refunds/${result.refundsOwed[0].id}/done`, { token: floor.tokens.MANAGER, body: { reference: 'again' } })).status, 422);
  });

  it('keeps a percent discount as the same percent, and caps a flat one at the new item total', async () => {
    const percent = await paidTwoDishBill({ method: null, discount: { kind: 'PERCENT', rateBps: 1000, reasonCode: 'REGULAR_GUEST' } });
    const kept = await cancelLines(percent.floor.tokens.OWNER, percent.bill.id, {
      lines: [{ lineId: lineOf(percent.bill, percent.second.name).orderLineId, wasPrepared: true }],
      reasonCode: 'MODIFICATION',
    });
    assert.equal(kept.status, 200, JSON.stringify(kept.body));
    assert.equal(kept.body.data.bill.discount.kind, 'PERCENT');
    assert.equal(kept.body.data.bill.discount.rateBps, 1000);
    assert.equal(kept.body.data.bill.discount.reasonCode, 'REGULAR_GUEST');
    assert.equal(kept.body.data.bill.discount.amountInPaise, Math.round(kept.body.data.bill.subtotalInPaise / 10));

    const flat = await paidTwoDishBill({ method: null, discount: { kind: 'FLAT', valueInPaise: 40000, reasonCode: 'STAFF_OFFICE' } });
    const capped = await cancelLines(flat.floor.tokens.OWNER, flat.bill.id, {
      lines: [{ lineId: lineOf(flat.bill, flat.second.name).orderLineId, wasPrepared: true }],
      reasonCode: 'MODIFICATION',
    });
    assert.equal(capped.status, 200, JSON.stringify(capped.body));
    const bill = capped.body.data.bill;
    assert.equal(bill.discount.kind, 'FLAT');
    assert.equal(bill.discount.reasonCode, 'STAFF_OFFICE');
    assert.equal(bill.discount.amountInPaise, bill.subtotalInPaise);
  });

  it('cancels the order and leaves every payment over when every line goes', async () => {
    const { floor, bill } = await paidTwoDishBill({ method: 'CASH' });
    const response = await cancelLines(floor.tokens.MANAGER, bill.id, {
      lines: bill.lines.map((line) => ({ lineId: line.orderLineId, wasPrepared: false })),
      reasonCode: 'GUEST_LEFT',
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.data.bill, null);
    assert.equal(response.body.data.orderCancelled, true);
    assert.equal(response.body.data.cashToGiveBackInPaise, bill.grandTotalInPaise);
    const order = (await request('GET', `/api/v1/orders/${bill.orderId}`, { token: floor.tokens.MANAGER })).body.data;
    assert.equal(order.status, 'CANCELLED');
    assert.equal(order.cancelReasonCode, 'GUEST_LEFT');
  });

  it("needs a manager's PIN for the till, refuses a captain as approver, and locks after five wrong PINs", async () => {
    const { floor, bill, second } = await paidTwoDishBill({ method: 'CASH' });
    const manager = await managerWithPin(floor);
    const waiter = await me(floor.tokens.WAITER);
    const body = (approval) => ({
      lines: [{ lineId: lineOf(bill, second.name).orderLineId, wasPrepared: true }],
      reasonCode: 'MODIFICATION',
      ...(approval ? { approval } : {}),
    });

    const approvers = await request('GET', '/api/v1/users/approvers', { token: floor.tokens.CASHIER });
    assert.equal(approvers.status, 200);
    assert.ok(approvers.body.data.some((person) => person.id === manager.id));
    assert.ok(approvers.body.data.every((person) => ['OWNER', 'MANAGER'].includes(person.role) && Object.keys(person).length === 3));
    assert.equal((await request('GET', '/api/v1/users/approvers', { token: floor.tokens.KITCHEN })).status, 403);

    assert.equal((await cancelLines(floor.tokens.CASHIER, bill.id, body(null))).status, 403);
    assert.equal((await cancelLines(floor.tokens.CASHIER, bill.id, body({ approverId: waiter.id, pin: '2468' }))).status, 403);
    assert.equal((await cancelLines(floor.tokens.KITCHEN, bill.id, body({ approverId: manager.id, pin: '2468' }))).status, 403);

    const wrong = await cancelLines(floor.tokens.CASHIER, bill.id, body({ approverId: manager.id, pin: '1111' }));
    assert.equal(wrong.status, 401);
    const right = await cancelLines(floor.tokens.CASHIER, bill.id, body({ approverId: manager.id, pin: '2468' }));
    assert.equal(right.status, 200, JSON.stringify(right.body));
    const audit = await AuditLog.findOne({ restaurantId: floor.restaurant._id, action: 'BILL_LINES_CANCELLED_AFTER_BILLING' }).lean();
    assert.equal(audit.details.approvedBy, manager.id);

    // Five wrong PINs lock the manager's PIN, exactly as at the attendance station.
    const next = await paidTwoDishBill({ method: 'CASH', floor });
    let last;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      last = await cancelLines(floor.tokens.CASHIER, next.bill.id, {
        lines: [{ lineId: lineOf(next.bill, next.second.name).orderLineId, wasPrepared: true }],
        reasonCode: 'MODIFICATION',
        approval: { approverId: manager.id, pin: '9999' },
      });
    }
    assert.equal(last.status, 429);
    assert.equal(last.body.error.code, 'PIN_LOCKED');
  });

  it('refuses on a closed day, on a voided bill, and a line that is not on the bill', async () => {
    const { floor, bill, second } = await paidTwoDishBill({ method: 'CASH' });
    const line = lineOf(bill, second.name);

    assert.equal(
      (await cancelLines(floor.tokens.OWNER, bill.id, { lines: [{ lineId: floor.item.id, wasPrepared: true }], reasonCode: 'MODIFICATION' })).status,
      422,
    );
    assert.equal(
      (await cancelLines(floor.tokens.OWNER, bill.id, { lines: [{ lineId: line.orderLineId, wasPrepared: true }, { lineId: line.orderLineId, wasPrepared: true }], reasonCode: 'MODIFICATION' })).status,
      400,
    );

    const close = await request('POST', '/api/v1/day-close', { token: floor.tokens.OWNER, body: { businessDate: bill.businessDate, countedCashInPaise: bill.grandTotalInPaise } });
    assert.equal(close.status, 201, JSON.stringify(close.body));
    const closed = await cancelLines(floor.tokens.OWNER, bill.id, { lines: [{ lineId: line.orderLineId, wasPrepared: true }], reasonCode: 'MODIFICATION' });
    assert.equal(closed.status, 409);
    assert.equal(closed.body.error.code, 'DAY_CLOSED');

    const reopen = await request('POST', `/api/v1/day-close/${bill.businessDate}/reopen`, { token: floor.tokens.OWNER, body: { reason: 'Test' } });
    assert.equal(reopen.status, 200, JSON.stringify(reopen.body));
    await request('POST', `/api/v1/bills/${bill.id}/void`, { token: floor.tokens.OWNER, body: { reasonCode: 'DUPLICATE' } });
    const onVoided = await cancelLines(floor.tokens.OWNER, bill.id, { lines: [{ lineId: line.orderLineId, wasPrepared: true }], reasonCode: 'MODIFICATION' });
    assert.equal(onVoided.status, 422);
  });

  it('charges the new bill to the same account, and the balance is right', async () => {
    const { floor, bill, second } = await paidTwoDishBill({ method: null });
    const account = (await request('POST', '/api/v1/accounts', { token: floor.tokens.OWNER, body: { name: 'W-330 Office' } })).body.data;
    const charged = await request('POST', `/api/v1/bills/${bill.id}/charge-to-account`, { token: floor.tokens.MANAGER, body: { accountId: account.id } });
    assert.equal(charged.status, 200, JSON.stringify(charged.body));

    const response = await cancelLines(floor.tokens.MANAGER, bill.id, {
      lines: [{ lineId: lineOf(bill, second.name).orderLineId, wasPrepared: true }],
      reasonCode: 'MODIFICATION',
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const newBill = response.body.data.bill;
    assert.equal(newBill.status, 'ON_ACCOUNT');
    assert.equal(newBill.chargedToAccountInPaise, newBill.grandTotalInPaise);

    const accounts = (await request('GET', '/api/v1/accounts', { token: floor.tokens.MANAGER })).body.data;
    assert.equal(accounts.find((row) => row.id === account.id).outstandingInPaise, newBill.grandTotalInPaise);
  });
});
