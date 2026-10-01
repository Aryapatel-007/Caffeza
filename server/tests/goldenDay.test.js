/**
 * The golden day, end to end. P10's acceptance test.
 *
 * docs/TEST-DATA.md section 4 is the answer key, and every expected number in
 * it was produced by the repo's own tax code, not added up by hand. If a
 * number here ever disagrees with that file, the fix is to find which side is
 * wrong, never to change the expected number to make the test pass.
 *
 * The fixture is built once, through the real API at the real times. The
 * checks are broken on purpose first, each on a stored document and restored
 * straight after; then 26 September is closed, locked, reopened and closed
 * again.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { Bill } from '../models/Bill.js';
import { DayClosure } from '../models/DayClosure.js';
import { ALL_MODELS } from '../models/index.js';
import { computeDayFigures } from '../services/dayFiguresService.js';
import { runDayChecks } from '../services/reconciliationService.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { buildGoldenDay, GOLDEN_DATE, GOLDEN_EXPECTED, ist } from './helpers/goldenDay.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

let golden;

/** A request-shaped object the services accept, for running checks directly. */
const asReq = () => ({
  restaurantId: String(golden.restaurant._id),
  branchId: String(golden.branch._id),
  user: { id: 'test', role: 'OWNER' },
});

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  golden = await buildGoldenDay();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

afterEach(() => resetClockForTests());

const billByNumber = (number) =>
  Bill.findOne({ restaurantId: golden.restaurant._id, billNumber: number });

async function checksNow() {
  const figures = await computeDayFigures(asReq(), GOLDEN_DATE);
  return runDayChecks(asReq(), GOLDEN_DATE, figures, { countedCashInPaise: 340000 });
}

const failing = (checks) => checks.filter((check) => !check.passed).map((check) => check.id);

/** Applies `change` to one stored bill, runs the checks, and puts the bill back exactly. */
async function withBroken(number, change, run) {
  const original = (await billByNumber(number)).toObject();
  await Bill.collection.updateOne({ _id: original._id }, change);
  try {
    return await run();
  } finally {
    await Bill.collection.replaceOne({ _id: original._id }, original);
  }
}

// ---------------------------------------------------------------------------

describe('the checks, each broken on purpose (TEST-DATA section 6)', () => {
  it('pass on the golden day, apart from the C9 warning for the cash difference', async () => {
    const checks = await checksNow();
    assert.deepEqual(failing(checks), ['C9'], JSON.stringify(checks, null, 2));
    const c9 = checks.find((check) => check.id === 'C9');
    assert.equal(c9.severity, 'WARNING');
    assert.equal(c9.difference, -400);
    assert.equal(c9.message, 'C9 Cash: counted ₹3,400.00, expected ₹3,404.00. ₹4.00 short.');
  });

  it('C1 fails, alone, when B03\'s round-off is set to +60 paise', async () => {
    const checks = await withBroken('CFA/C/22444', { $set: { roundOffInPaise: 60 } }, checksNow);
    assert.deepEqual(failing(checks).filter((id) => id !== 'C9'), ['C1']);
    const c1 = checks.find((check) => check.id === 'C1');
    assert.deepEqual(c1.refs, ['CFA/C/22444']);
    assert.match(c1.message, /^C1 Bill arithmetic: bill CFA\/C\/22444 does not add up\./);
  });

  it('C3 and C4 fail when B04\'s payment is deleted but it stays PAID', async () => {
    const checks = await withBroken('CFA/C/22445', { $set: { payments: [] } }, checksNow);
    assert.deepEqual(failing(checks).filter((id) => id !== 'C9'), ['C3', 'C4']);
    const c3 = checks.find((check) => check.id === 'C3');
    assert.equal(c3.difference, -36800);
    assert.equal(
      c3.message,
      'C3 Money: on 2026-09-26, bills total ₹9,269.00 but received plus On Hold plus unpaid is ₹8,901.00. ₹368.00 is unaccounted for.',
    );
    assert.deepEqual(checks.find((check) => check.id === 'C4').refs, ['CFA/C/22445']);
  });

  it('C4 fails, alone, when B09 is marked PAID with no payment', async () => {
    const checks = await withBroken('CFA/C/22450', { $set: { status: 'PAID' } }, checksNow);
    assert.deepEqual(failing(checks).filter((id) => id !== 'C9'), ['C4']);
    const c4 = checks.find((check) => check.id === 'C4');
    assert.equal(
      c4.message,
      'C4 Payment: bill CFA/C/22450 is marked PAID but its payments total ₹0.00 against a bill total of ₹47.00.',
    );
  });

  it('C6 fails, alone, when B11 is deleted from the register instead of voided', async () => {
    const b11 = (await billByNumber('CFA/C/22452')).toObject();
    await Bill.collection.deleteOne({ _id: b11._id });
    try {
      const checks = await checksNow();
      assert.deepEqual(failing(checks).filter((id) => id !== 'C9'), ['C6']);
      const c6 = checks.find((check) => check.id === 'C6');
      assert.equal(c6.message, 'C6 Invoices: number CFA/C/22452 is missing from series CFA/C/.');
      assert.deepEqual(c6.refs, ['CFA/C/22452']);
    } finally {
      await Bill.collection.insertOne(b11);
    }
  });

  it('C8 fails, alone, when B14\'s business date is stored as 2026-09-27', async () => {
    const checks = await withBroken('CFA/C/22455', { $set: { businessDate: '2026-09-27' } }, checksNow);
    assert.deepEqual(failing(checks).filter((id) => id !== 'C9'), ['C8']);
    const c8 = checks.find((check) => check.id === 'C8');
    assert.deepEqual(c8.refs, ['CFA/C/22455']);
    assert.equal(
      c8.message,
      'C8 Date: bill CFA/C/22455 was issued at 2026-09-26 23:55:00 IST India time, which is business date 2026-09-26, but it is stored as 2026-09-27.',
    );
  });

  it('C9 is an ERROR when the expected cash leaves out the paid out', async () => {
    const { checkC9 } = await import('../services/reconciliationService.js');
    const figures = await computeDayFigures(asReq(), GOLDEN_DATE);
    const broken = { ...figures.cash, expectedCashInPaise: figures.cash.expectedCashInPaise + 35000 };
    const c9 = checkC9(broken, 340000);
    assert.equal(c9.passed, false);
    assert.equal(c9.severity, 'ERROR');
  });
});

describe('closing 26 September', () => {
  let closed;

  it('closes as the Manager with 340000 counted and a note, and hides the expected cash', async () => {
    setClockForTests(ist('09:00', '2026-09-27'));
    const withoutNote = await request('POST', '/api/v1/day-close', {
      token: golden.tokens.MANAGER,
      body: { businessDate: GOLDEN_DATE, countedCashInPaise: 340000 },
    });
    assert.equal(withoutNote.status, 422, 'a cash difference needs a note');
    assert.equal(withoutNote.body.error.noteRequired, true);
    assert.doesNotMatch(JSON.stringify(withoutNote.body), /3404|340400|-400/);

    const response = await request('POST', '/api/v1/day-close', {
      token: golden.tokens.MANAGER,
      body: { businessDate: GOLDEN_DATE, countedCashInPaise: 340000, note: 'Four rupees short, coins' },
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    closed = response.body.data;

    assert.equal(closed.status, 'CLOSED');
    assert.equal(closed.countedCashInPaise, 340000);
    assert.equal('expectedCashInPaise' in closed, false);
    assert.equal('differenceInPaise' in closed, false);
    assert.equal('expectedCashInPaise' in closed.figures.cash, false);
    assert.equal(closed.checks.find((check) => check.id === 'C9').expected, null);
  });

  it('stores a snapshot matching every number in TEST-DATA section 4', async () => {
    const stored = await DayClosure.findOne({ restaurantId: golden.restaurant._id, businessDate: GOLDEN_DATE }).lean();
    const figures = stored.snapshot;
    const expected = GOLDEN_EXPECTED;

    assert.deepEqual(figures.sales, expected.sales);

    const methodTotals = Object.fromEntries(figures.money.methods.map((row) => [row.method, row.amountInPaise]));
    for (const [method, amount] of Object.entries(expected.methods)) {
      assert.equal(methodTotals[method], amount, method);
    }
    assert.equal(figures.money.inHandInPaise, expected.money.inHandInPaise);
    assert.equal(figures.money.platformInPaise, expected.money.platformInPaise);
    assert.deepEqual(
      Object.fromEntries(figures.money.onHold.map((row) => [row.accountName, row.amountInPaise])),
      expected.money.onHold,
    );
    assert.equal(figures.money.onHoldInPaise, expected.money.onHoldInPaise);
    assert.equal(figures.money.unpaidInPaise, expected.money.unpaidInPaise);
    assert.equal(figures.money.totalInPaise, expected.money.totalInPaise);
    assert.equal(figures.money.totalInPaise, figures.sales.billTotalInPaise);

    const { countedCashInPaise, differenceInPaise, ...cash } = expected.cash;
    for (const [key, value] of Object.entries(cash)) assert.equal(figures.cash[key], value, key);
    assert.equal(stored.countedCashInPaise, countedCashInPaise);
    assert.equal(stored.expectedCashInPaise, cash.expectedCashInPaise);
    assert.equal(stored.differenceInPaise, differenceInPaise);
    assert.equal(figures.collections.totalInPaise, 0);

    assert.deepEqual(figures.orderTypes, expected.orderTypes);
    assert.deepEqual(figures.gst, expected.gst);

    const g = figures.controls;
    assert.equal(g.discounts.count, expected.controls.discounts.count);
    assert.equal(g.discounts.totalInPaise, expected.controls.discounts.totalInPaise);
    assert.deepEqual(
      g.discounts.largest.map((row) => [row.billNumber, row.amountInPaise]),
      expected.controls.discounts.largest,
    );
    assert.deepEqual(g.noCharge, expected.controls.noCharge);
    assert.deepEqual(g.cancelledItems, expected.controls.cancelledItems);
    assert.deepEqual(g.cancelledOrders, expected.controls.cancelledOrders);
    assert.equal(g.voidedBills.count, expected.controls.voidedBills.count);
    assert.equal(g.voidedBills.valueInPaise, expected.controls.voidedBills.valueInPaise);
    assert.equal(g.voidedBills.bills[0].billNumber, expected.controls.voidedBills.billNumber);
    assert.equal(g.voidedBills.bills[0].reason, expected.controls.voidedBills.reason);

    assert.deepEqual(figures.invoices, [expected.invoices]);
  });

  it('stored C1, C3, C4, C6 and C8 passing, and C9\'s warning for -400', async () => {
    const stored = await DayClosure.findOne({ restaurantId: golden.restaurant._id, businessDate: GOLDEN_DATE }).lean();
    const byId = Object.fromEntries(stored.checks.map((check) => [check.id, check]));
    for (const id of ['C1', 'C3', 'C4', 'C6', 'C8']) assert.equal(byId[id].passed, true, id);
    assert.equal(byId.C9.passed, false);
    assert.equal(byId.C9.severity, 'WARNING');
    assert.equal(byId.C9.difference, -400);
  });

  it('shows the Owner the expected cash and the difference, and the Manager neither', async () => {
    const asOwner = (await request('GET', `/api/v1/day-close/${GOLDEN_DATE}`, { token: golden.tokens.OWNER })).body.data;
    assert.equal(asOwner.expectedCashInPaise, 340400);
    assert.equal(asOwner.differenceInPaise, -400);
    assert.equal(asOwner.figures.cash.expectedCashInPaise, 340400);

    const asManager = (await request('GET', `/api/v1/day-close/${GOLDEN_DATE}`, { token: golden.tokens.MANAGER })).body.data;
    assert.equal('expectedCashInPaise' in asManager, false);
    assert.equal('differenceInPaise' in asManager, false);
    assert.equal('expectedCashInPaise' in asManager.figures.cash, false);

    const ownerPrint = (await request('GET', `/api/v1/day-close/${GOLDEN_DATE}/print?width=32`, { token: golden.tokens.OWNER })).body.data.text;
    const managerPrint = (await request('GET', `/api/v1/day-close/${GOLDEN_DATE}/print?width=32`, { token: golden.tokens.MANAGER })).body.data.text;
    assert.match(ownerPrint, /Expected cash\s+3,404\.00/);
    assert.match(ownerPrint, /Closed by Manager at 9:00 AM/);
    assert.doesNotMatch(managerPrint, /Expected cash|3,404\.00|Cash difference/);
    for (const line of managerPrint.split('\n')) assert.ok(line.length <= 32, line);

    const list = (await request('GET', '/api/v1/day-close', { token: golden.tokens.MANAGER })).body.data;
    assert.equal(list.length, 1);
    assert.equal('differenceInPaise' in list[0], false);
  });

  it('refuses closing twice', async () => {
    const again = await request('POST', '/api/v1/day-close', {
      token: golden.tokens.OWNER,
      body: { businessDate: GOLDEN_DATE, countedCashInPaise: 340400 },
    });
    assert.equal(again.status, 422);
  });
});

describe('the lock on a closed day', () => {
  const at26 = () => setClockForTests(ist('22:00'));
  const expectClosed = (response, what) => {
    assert.equal(response.status, 409, `${what}: ${JSON.stringify(response.body)}`);
    assert.equal(response.body.error.code, 'DAY_CLOSED');
    assert.equal(response.body.error.message, '2026-09-26 is closed. An owner can reopen it.');
  };

  /** Every write in the M16 lock table, aimed at 26 September. */
  async function lockedWrites() {
    const { tokens, ids } = golden;
    const b03 = ids.bills.B03;
    const b03Payment = (await Bill.findOne({ restaurantId: golden.restaurant._id, _id: b03 })).payments[0]._id;
    const results = {};

    at26();
    const opened = (
      await request('POST', '/api/v1/orders', {
        token: tokens.WAITER,
        body: { orderType: 'TAKEAWAY', lines: [{ menuItemId: ids.items['Masala Tea'], quantity: 1 }] },
      })
    ).body.data;
    const fired = (await request('POST', `/api/v1/orders/${opened.id}/fire`, { token: tokens.WAITER, body: { version: opened.version } })).body.data;
    for (const kot of fired.kots) await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: tokens.WAITER });
    let order = (await request('GET', `/api/v1/orders/${opened.id}`, { token: tokens.WAITER })).body.data;
    order = (await request('PATCH', `/api/v1/orders/${opened.id}/lines/${order.lines[0].id}/served`, { token: tokens.WAITER, body: { version: order.version } })).body.data;

    results['create a bill'] = await request('POST', '/api/v1/bills', { token: tokens.CASHIER, body: { orderId: order.id, version: order.version } });
    results.discount = await request('POST', `/api/v1/bills/${b03}/discount`, { token: tokens.MANAGER, body: { kind: 'FLAT', valueInPaise: 100, reasonCode: 'REGULAR_GUEST' } });
    results.void = await request('POST', `/api/v1/bills/${b03}/void`, { token: tokens.MANAGER, body: { reasonCode: 'DUPLICATE' } });
    results['take a payment'] = await request('POST', `/api/v1/bills/${b03}/payments`, { token: tokens.CASHIER, body: { method: 'CASH', amountInPaise: 100 } });
    results['correct a payment'] = await request('POST', `/api/v1/bills/${b03}/payments/${b03Payment}/correct`, { token: tokens.MANAGER, body: { method: 'UPI', reason: 'Was UPI' } });
    results['charge to account'] = await request('POST', `/api/v1/bills/${b03}/charge-to-account`, { token: tokens.MANAGER, body: { accountId: ids.accounts['E-210 Office'] } });

    const nc = (await request('POST', '/api/v1/orders', { token: tokens.WAITER, body: { orderType: 'TAKEAWAY', lines: [{ menuItemId: ids.items['Masala Tea'], quantity: 1 }] } })).body.data;
    const ncFired = (await request('POST', `/api/v1/orders/${nc.id}/fire`, { token: tokens.WAITER, body: { version: nc.version } })).body.data;
    results['No Charge'] = await request('POST', `/api/v1/orders/${nc.id}/no-charge`, { token: tokens.MANAGER, body: { version: ncFired.order.version, reasonCode: 'STAFF_MEAL' } });

    results['cash movement'] = await request('POST', '/api/v1/cash-movements', { token: tokens.MANAGER, body: { type: 'PAID_IN', amountInPaise: 100, reason: 'Change from the bank' } });
    results['void a cash movement'] = await request('POST', `/api/v1/cash-movements/${ids.paidOut}/void`, { token: tokens.MANAGER, body: { reason: 'Entered twice' } });
    results.collection = await request('POST', `/api/v1/accounts/${ids.accounts['E-210 Office']}/collections`, { token: tokens.CASHIER, body: { method: 'CASH', amountInPaise: 100 } });
    results.adjustment = await request('POST', `/api/v1/accounts/${ids.accounts['E-210 Office']}/adjustments`, { token: tokens.OWNER, body: { direction: 'UP', amountInPaise: 100, reason: 'Test' } });
    results['record a payout'] = await request('POST', '/api/v1/platform-payouts', { token: tokens.MANAGER, body: { method: 'SWIGGY', periodFrom: '2026-09-20', periodTo: '2026-09-20', amountReceivedInPaise: 100, receivedOn: '2026-09-26' } });
    return results;
  }

  it('refuses every write in the lock table that targets 26 September with 409 DAY_CLOSED', async () => {
    const results = await lockedWrites();
    for (const [what, response] of Object.entries(results)) expectClosed(response, what);
  });

  it('refuses voiding a payout while today is the closed day', async () => {
    setClockForTests(ist('12:00', '2026-09-28'));
    const payout = await request('POST', '/api/v1/platform-payouts', {
      token: golden.tokens.MANAGER,
      body: { method: 'SWIGGY', periodFrom: '2026-09-21', periodTo: '2026-09-21', amountReceivedInPaise: 100, receivedOn: '2026-09-28' },
    });
    assert.equal(payout.status, 201, JSON.stringify(payout.body));
    at26();
    expectClosed(
      await request('POST', `/api/v1/platform-payouts/${payout.body.data.id}/void`, { token: golden.tokens.OWNER, body: { reason: 'x' } }),
      'void a payout',
    );
  });

  it('never affects writes for 27 September', async () => {
    setClockForTests(ist('12:00', '2026-09-27'));
    const paidIn = await request('POST', '/api/v1/cash-movements', {
      token: golden.tokens.CASHIER,
      body: { type: 'PAID_IN', amountInPaise: 500, reason: 'Change from the bank' },
    });
    assert.equal(paidIn.status, 201, JSON.stringify(paidIn.body));
    assert.equal(paidIn.body.data.businessDate, '2026-09-27');

    const collection = await request('POST', `/api/v1/accounts/${golden.ids.accounts['W-330 Office']}/collections`, {
      token: golden.tokens.CASHIER,
      body: { method: 'CASH', amountInPaise: 50400 },
    });
    assert.equal(collection.status, 201, JSON.stringify(collection.body));
    assert.equal(collection.body.data.businessDate, '2026-09-27');
  });

  it('only the owner reopens, with a reason; then the same writes are no longer refused for the day', async () => {
    setClockForTests(ist('10:00', '2026-09-27'));
    const byManager = await request('POST', `/api/v1/day-close/${GOLDEN_DATE}/reopen`, { token: golden.tokens.MANAGER, body: { reason: 'x' } });
    assert.equal(byManager.status, 403);
    const noReason = await request('POST', `/api/v1/day-close/${GOLDEN_DATE}/reopen`, { token: golden.tokens.OWNER, body: {} });
    assert.equal(noReason.status, 400);
    const reopened = await request('POST', `/api/v1/day-close/${GOLDEN_DATE}/reopen`, {
      token: golden.tokens.OWNER,
      body: { reason: 'Correcting a payment method' },
    });
    assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
    assert.equal(reopened.body.data.status, 'REOPENED');

    const results = await lockedWrites();
    for (const [what, response] of Object.entries(results)) {
      assert.notEqual(response.body?.error?.code, 'DAY_CLOSED', what);
    }
  });

  it('closes again after reopening, with three entries in the history', async () => {
    // The lock test above left a new unpaid bill and an open order on the 26th; settle both first.
    setClockForTests(ist('23:00'));
    const day = (await request('GET', `/api/v1/day-close/${GOLDEN_DATE}`, { token: golden.tokens.OWNER })).body.data;
    for (const blocker of day.blockers) {
      if (blocker.kind === 'OPEN_ORDER') {
        const order = (await request('GET', `/api/v1/orders/${blocker.ref}`, { token: golden.tokens.MANAGER })).body.data;
        const cancelled = await request('POST', `/api/v1/orders/${order.id}/cancel`, {
          token: golden.tokens.MANAGER,
          body: { version: order.version, reasonCode: 'GUEST_LEFT', wasPrepared: true },
        });
        assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
      }
      if (blocker.kind === 'UNPAID_BILL') {
        const bill = (await request('GET', `/api/v1/bills/${blocker.ref}`, { token: golden.tokens.CASHIER })).body.data;
        await request('POST', `/api/v1/bills/${bill.id}/payments`, {
          token: golden.tokens.CASHIER,
          body: { method: 'CASH', amountInPaise: bill.grandTotalInPaise - bill.amountPaidInPaise },
        });
      }
    }
    const after = (await request('GET', `/api/v1/day-close/${GOLDEN_DATE}`, { token: golden.tokens.OWNER })).body.data;
    assert.deepEqual(after.blockers, [], JSON.stringify(after.blockers));

    setClockForTests(ist('11:00', '2026-09-27'));
    const counted = after.figures.cash.expectedCashInPaise;
    const response = await request('POST', '/api/v1/day-close', {
      token: golden.tokens.OWNER,
      body: { businessDate: GOLDEN_DATE, countedCashInPaise: counted },
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.data.history.length, 3);
    assert.deepEqual(
      response.body.data.history.map((entry) => entry.action),
      ['CLOSED', 'REOPENED', 'CLOSED'],
    );
  });
});
