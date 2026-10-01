/**
 * M6 report tests.
 *
 * The ones that matter most are marked in their describe names, and all three
 * are about a report telling the truth rather than merely returning a shape:
 * voided records leaving every total, an open shift contributing zero
 * minutes, and tax being summed from stored values rather than recomputed.
 *
 * Reports are read-only, so almost every test here builds real data through
 * the real M2/M3/M4/M5 endpoints first and then asserts what M6 says about
 * it. Asserting against hand-inserted documents would prove the aggregation
 * runs, not that it agrees with what the rest of the system actually wrote.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ROLES } from '../config/roles.js';
import { AttendanceEntry } from '../models/AttendanceEntry.js';
import { Bill } from '../models/Bill.js';
import { Counter } from '../models/Counter.js';
import {
  createMenuItem,
  fireOrder,
  openOrder,
  readOrder,
  readyToBillOrder,
  seedFloor,
  seedTeam,
} from './helpers/m2Fixtures.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));

const report = (token, path) => request('GET', `/api/v1/reports/${path}`, { token });

/** Today's business date, the way the server computes it, for range params. */
function todayBusinessDate() {
  // Default boundary is 05:00 IST. Tests run "now", so today's business date
  // is today in IST unless it is between midnight and 05:00, which the CI
  // clock will not reliably avoid -- so derive it the same way the server does.
  const IST_OFFSET_MINUTES = 330;
  const shifted = new Date(Date.now() + (IST_OFFSET_MINUTES - 300) * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** Runs an order all the way to a paid bill, and returns it. */
async function billedAndPaid(floor, lines = null) {
  const order = await readyToBillOrder(floor, lines);
  const bill = (
    await request('POST', '/api/v1/bills', {
      token: floor.tokens.CASHIER,
      body: { orderId: order.id, version: order.version },
    })
  ).body.data;

  const paid = (
    await request('POST', `/api/v1/bills/${bill.id}/payments`, {
      token: floor.tokens.CASHIER,
      body: { method: 'CASH', amountInPaise: bill.grandTotalInPaise },
    })
  ).body.data;

  return { order, bill: paid };
}

before(async () => {
  await startTestDatabase();
  await startTestServer();
  await Bill.init();
  await Counter.init();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
});

describe('the range rules every report shares', () => {
  it('requires both from and to, with no defaults', async () => {
    const { tokens } = await seedTeam();
    const today = todayBusinessDate();

    for (const query of ['', `?from=${today}`, `?to=${today}`]) {
      const response = await report(tokens.OWNER, `sales-summary${query}`);
      assert.equal(response.status, 400, `"${query}" should be refused`);
    }

    const both = await report(tokens.OWNER, `sales-summary?from=${today}&to=${today}`);
    assert.equal(both.status, 200);
  });

  it('refuses a range wider than 366 days with 422 RANGE_TOO_LARGE', async () => {
    const { tokens } = await seedTeam();

    const ok = await report(tokens.OWNER, 'sales-summary?from=2026-01-01&to=2026-12-31');
    assert.equal(ok.status, 200, '365 days is fine');

    const alsoOk = await report(tokens.OWNER, 'sales-summary?from=2026-01-01&to=2027-01-01');
    assert.equal(alsoOk.status, 200, '366 days is the cap, inclusive');

    const tooBig = await report(tokens.OWNER, 'sales-summary?from=2026-01-01&to=2027-01-02');
    assert.equal(tooBig.status, 422, '367 days is refused');
    assert.equal(tooBig.body.error.code, 'RANGE_TOO_LARGE');
  });

  it('refuses a date that is not a real calendar day', async () => {
    const { tokens } = await seedTeam();
    const response = await report(tokens.OWNER, 'sales-summary?from=2026-02-30&to=2026-02-30');
    assert.equal(response.status, 400);
  });

  it('the dashboard takes no parameters at all', async () => {
    const { tokens } = await seedTeam();
    const response = await report(tokens.OWNER, 'dashboard?from=2026-01-01');
    assert.equal(response.status, 400, 'a dashboard that accepts a date is not "today"');
  });
});

describe('VOIDED RECORDS LEAVE EVERY TOTAL', () => {
  it('a voided bill is out of sales, tax, top items, payments and the day row', async () => {
    /**
     * The soft-delete leak from BUILD-PLAN, which that document calls
     * RECURRING and names M6 as where it bites hardest. One kept bill, one
     * voided bill, and every figure in the module has to agree that only one
     * of them happened.
     */
    const floor = await seedFloor();
    const { tokens } = floor;
    const today = todayBusinessDate();

    const kept = await billedAndPaid(floor);

    const secondTable = (
      await request('POST', '/api/v1/tables', { token: tokens.OWNER, body: { name: 'T2' } })
    ).body.data;
    const doomed = await billedAndPaid({ ...floor, table: secondTable });
    await request('POST', `/api/v1/bills/${doomed.bill.id}/void`, {
      token: tokens.MANAGER,
      body: { reasonCode: 'OTHER', note: 'Rung up twice' },
    });

    const summary = (await report(tokens.OWNER, `sales-summary?from=${today}&to=${today}`)).body.data;
    assert.equal(summary.billCount, 1, 'one live bill');
    assert.equal(summary.grossSalesInPaise, kept.bill.grandTotalInPaise);
    assert.equal(summary.voidedBillCount, 1, 'the voided one is counted, separately');
    assert.equal(summary.voidedBillValueInPaise, doomed.bill.grandTotalInPaise);

    const byDay = (await report(tokens.OWNER, `sales-by-day?from=${today}&to=${today}`)).body.data;
    assert.equal(byDay[0].grossSalesInPaise, kept.bill.grandTotalInPaise);
    assert.equal(byDay[0].billCount, 1);

    const tax = (await report(tokens.OWNER, `tax-summary?from=${today}&to=${today}`)).body.data;
    assert.equal(tax.totalTaxInPaise, kept.bill.totalTaxInPaise, 'only the live bill contributes tax');

    const items = (await report(tokens.OWNER, `top-items?from=${today}&to=${today}`)).body.data;
    const totalQty = items.reduce((sum, row) => sum + row.quantity, 0);
    const keptQty = kept.bill.lines.reduce((sum, line) => sum + line.quantity, 0);
    assert.equal(totalQty, keptQty, 'a voided bill sells nothing');

    const payments = (await report(tokens.OWNER, `payment-methods?from=${today}&to=${today}`)).body.data;
    assert.equal(payments.totalCollectedInPaise, kept.bill.grandTotalInPaise);

    const hourly = (await report(tokens.OWNER, `hourly?from=${today}&to=${today}`)).body.data;
    const hourlyTotal = hourly.reduce((sum, row) => sum + row.grossSalesInPaise, 0);
    assert.equal(hourlyTotal, kept.bill.grandTotalInPaise);
  });

  it('a voided attendance entry contributes no minutes', async () => {
    const { tokens, users } = await seedTeamWithShift();
    const today = todayBusinessDate();

    const before = (await report(tokens.OWNER, `labour-hours?from=${today}&to=${today}`)).body.data;
    assert.ok(before.totalMinutes > 0, 'the closed shift counts to begin with');

    const entry = await AttendanceEntry.findOne({ restaurantId: users.restaurantId });
    await request('PATCH', `/api/v1/attendance/${entry._id}/void`, {
      token: tokens.OWNER,
      body: { reason: 'Duplicate entry' },
    });

    const after = (await report(tokens.OWNER, `labour-hours?from=${today}&to=${today}`)).body.data;
    assert.equal(after.totalMinutes, 0, 'a voided entry is worth zero minutes');
    assert.equal(after.byUser.length, 0);
  });
});

/** A team with one closed shift and one open shift, for the labour reports. */
async function seedTeamWithShift() {
  const team = await seedTeam();
  const now = new Date();

  // A closed shift, created through the manager endpoint so the server
  // computes workedMinutes itself rather than the test inventing it.
  await request('POST', '/api/v1/attendance', {
    token: team.tokens.OWNER,
    body: {
      userId: (await usersOf(team)).WAITER,
      clockInAt: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
      clockOutAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
      reason: 'Forgot to clock in',
    },
  });

  return { ...team, users: { restaurantId: team.restaurant._id } };
}

/** Maps role to userId for the seeded team. */
async function usersOf(team) {
  const list = (await request('GET', '/api/v1/users?limit=50', { token: team.tokens.OWNER })).body.data;
  return Object.fromEntries(list.map((user) => [user.role, user.id]));
}

describe('AN OPEN SHIFT CONTRIBUTES ZERO MINUTES', () => {
  it('is listed separately and never counted as elapsed time', async () => {
    /**
     * M5 refuses to invent a clock-out time, and M6 refuses in exactly the
     * same way. A number that grows while you look at it is not an
     * hours-worked figure, and M11 will pay people from this.
     */
    const team = await seedTeam();
    const today = todayBusinessDate();

    // A shift that is open right now: the waiter clocks in and does not out.
    await request('POST', '/api/v1/attendance/clock-in', { token: team.tokens.WAITER });

    const data = (await report(team.tokens.OWNER, `labour-hours?from=${today}&to=${today}`)).body.data;

    assert.equal(data.totalMinutes, 0, 'an open shift is worth zero, not elapsed-so-far');
    assert.equal(data.openShifts.length, 1, 'and it is surfaced separately');
    assert.equal(data.byUser.length, 1);
    assert.equal(data.byUser[0].totalMinutes, 0);
    assert.equal(data.byUser[0].shiftCount, 0, 'an open shift is not a completed shift');
    assert.equal(data.byUser[0].openShiftCount, 1);
    assert.equal(data.byUser[0].averageShiftMinutes, 0, 'no division by zero');
  });

  it('counts a closed shift and leaves an open one out of the same total', async () => {
    const team = await seedTeam();
    const today = todayBusinessDate();
    const users = await usersOf(team);
    const now = Date.now();

    await request('POST', '/api/v1/attendance', {
      token: team.tokens.OWNER,
      body: {
        userId: users.CASHIER,
        clockInAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        clockOutAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
        reason: 'Missed clock-in',
      },
    });
    await request('POST', '/api/v1/attendance/clock-in', { token: team.tokens.WAITER });

    const data = (await report(team.tokens.OWNER, `labour-hours?from=${today}&to=${today}`)).body.data;

    assert.equal(data.totalMinutes, 120, 'exactly the closed two-hour shift');
    assert.equal(data.openShifts.length, 1);
  });
});

describe('TAX IS SUMMED FROM STORED VALUES, NEVER RECOMPUTED', () => {
  it('the tax report equals the sum of what M3 froze onto each bill', async () => {
    /**
     * The failure this guards against is subtle: recomputing tax here from
     * line totals would round differently from M3's per-slab rule and the
     * report would disagree with the printed bill by a rupee, with no way to
     * tell an auditor which is right.
     */
    const floor = await seedFloor();
    const { tokens } = floor;
    const today = todayBusinessDate();

    const second = (await createMenuItem(tokens.OWNER, { name: 'Cola', taxRateBps: 1800, priceInPaise: 6000 }))
      .body.data;
    const third = (await createMenuItem(tokens.OWNER, { name: 'Chaas', taxRateBps: 0, priceInPaise: 4900 }))
      .body.data;

    const { bill } = await billedAndPaid(floor, [
      { menuItemId: floor.item.id, quantity: 3 },
      { menuItemId: second.id, quantity: 1 },
      { menuItemId: third.id, quantity: 2 },
    ]);

    const tax = (await report(tokens.OWNER, `tax-summary?from=${today}&to=${today}`)).body.data;

    assert.equal(tax.totalTaxInPaise, bill.totalTaxInPaise, 'exactly what the bill stored');
    assert.equal(
      tax.totalCgstInPaise + tax.totalSgstInPaise,
      bill.totalTaxInPaise,
      'CGST and SGST still re-add to the total',
    );

    // Every slab on the bill appears in the report with the same figures.
    for (const slab of bill.taxBreakdown) {
      const reported = tax.slabs.find((row) => row.taxRateBps === slab.taxRateBps);
      assert.ok(reported, `slab ${slab.taxRateBps} is in the report`);
      assert.equal(reported.taxInPaise, slab.taxInPaise);
      assert.equal(reported.cgstInPaise, slab.cgstInPaise);
      assert.equal(reported.sgstInPaise, slab.sgstInPaise);
      assert.equal(reported.taxableInPaise, slab.taxableInPaise);
    }

    assert.deepEqual(
      tax.slabs.map((slab) => slab.taxRateBps),
      [...tax.slabs.map((slab) => slab.taxRateBps)].sort((a, b) => a - b),
      'slabs come back ascending by rate',
    );
  });
});

describe('sales summary', () => {
  it('splits dine-in from takeaway and averages with integer division', async () => {
    const floor = await seedFloor();
    const { tokens } = floor;
    const today = todayBusinessDate();

    await billedAndPaid(floor);

    const summary = (await report(tokens.OWNER, `sales-summary?from=${today}&to=${today}`)).body.data;

    assert.equal(summary.dineIn.billCount, 1);
    assert.equal(summary.takeaway.billCount, 0);
    assert.equal(summary.dineIn.salesInPaise, summary.grossSalesInPaise);
    assert.equal(
      summary.averageBillInPaise,
      Math.floor(summary.grossSalesInPaise / summary.billCount),
    );
  });

  it('returns zeros rather than nulls for a range with no bills', async () => {
    const { tokens } = await seedTeam();
    const summary = (await report(tokens.OWNER, 'sales-summary?from=2020-01-01&to=2020-01-02')).body
      .data;

    assert.equal(summary.grossSalesInPaise, 0);
    assert.equal(summary.billCount, 0);
    assert.equal(summary.averageBillInPaise, 0, 'no division by zero');
    assert.equal(summary.voidedBillCount, 0);
  });
});

describe('sales by day', () => {
  it('fills days with no bills as zeros rather than omitting them', async () => {
    /**
     * A chart that skips empty days draws a continuous line across a closed
     * Monday and makes a quiet week look busy.
     */
    const { tokens } = await seedTeam();
    const rows = (await report(tokens.OWNER, 'sales-by-day?from=2026-03-01&to=2026-03-05')).body.data;

    assert.equal(rows.length, 5, 'five days requested, five rows returned');
    assert.deepEqual(
      rows.map((row) => row.businessDate),
      ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'],
    );
    assert.ok(rows.every((row) => row.grossSalesInPaise === 0 && row.billCount === 0));
  });

  it('spans a month boundary correctly', async () => {
    const { tokens } = await seedTeam();
    const rows = (await report(tokens.OWNER, 'sales-by-day?from=2026-02-27&to=2026-03-02')).body.data;

    assert.deepEqual(
      rows.map((row) => row.businessDate),
      ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'],
      '2026 is not a leap year, so February has 28 days',
    );
  });
});

describe('hourly', () => {
  it('always returns twenty-four rows, including empty hours', async () => {
    const { tokens } = await seedTeam();
    const today = todayBusinessDate();
    const rows = (await report(tokens.OWNER, `hourly?from=${today}&to=${today}`)).body.data;

    assert.equal(rows.length, 24);
    assert.deepEqual(
      rows.map((row) => row.hourIst),
      Array.from({ length: 24 }, (_unused, hour) => hour),
    );
  });

  it('puts a real bill in an hour, and the hours sum to the day total', async () => {
    const floor = await seedFloor();
    const today = todayBusinessDate();
    const { bill } = await billedAndPaid(floor);

    const rows = (await report(floor.tokens.OWNER, `hourly?from=${today}&to=${today}`)).body.data;
    const total = rows.reduce((sum, row) => sum + row.grossSalesInPaise, 0);

    assert.equal(total, bill.grandTotalInPaise);
    assert.equal(rows.filter((row) => row.billCount > 0).length, 1, 'one bill, one hour');
  });
});

describe('top items', () => {
  it('reports quantity and revenue, and sorts by whichever was asked for', async () => {
    const floor = await seedFloor();
    const { tokens } = floor;
    const today = todayBusinessDate();

    // A cheap item sold many times, and an expensive one sold once.
    const cheap = (await createMenuItem(tokens.OWNER, { name: 'Roti', priceInPaise: 2000 })).body.data;
    const dear = (await createMenuItem(tokens.OWNER, { name: 'Thali', priceInPaise: 50000 })).body.data;

    await billedAndPaid(floor, [
      { menuItemId: cheap.id, quantity: 10 },
      { menuItemId: dear.id, quantity: 1 },
    ]);

    const byQuantity = (await report(tokens.OWNER, `top-items?from=${today}&to=${today}&sort=quantity`))
      .body.data;
    assert.equal(byQuantity[0].itemName, 'Roti', '10 rotis beat 1 thali on quantity');
    assert.equal(byQuantity[0].quantity, 10);
    assert.equal(byQuantity[0].revenueInPaise, 20000);

    const byRevenue = (await report(tokens.OWNER, `top-items?from=${today}&to=${today}&sort=revenue`))
      .body.data;
    assert.equal(byRevenue[0].itemName, 'Thali', '1 thali beats 10 rotis on revenue');
    assert.equal(byRevenue[0].revenueInPaise, 50000);
  });

  it('honours limit', async () => {
    const floor = await seedFloor();
    const today = todayBusinessDate();
    const second = (await createMenuItem(floor.tokens.OWNER, { name: 'Second' })).body.data;

    await billedAndPaid(floor, [
      { menuItemId: floor.item.id, quantity: 1 },
      { menuItemId: second.id, quantity: 1 },
    ]);

    const limited = (await report(floor.tokens.OWNER, `top-items?from=${today}&to=${today}&limit=1`))
      .body.data;
    assert.equal(limited.length, 1);
  });

  it('shows a renamed dish under its current name, with its history joined', async () => {
    const floor = await seedFloor();
    const { tokens } = floor;
    const today = todayBusinessDate();

    await billedAndPaid(floor, [{ menuItemId: floor.item.id, quantity: 2 }]);

    await request('PATCH', `/api/v1/menu-items/${floor.item.id}`, {
      token: tokens.OWNER,
      body: { name: 'Paneer Tikka Deluxe' },
    });

    const secondTable = (
      await request('POST', '/api/v1/tables', { token: tokens.OWNER, body: { name: 'T2' } })
    ).body.data;
    await billedAndPaid({ ...floor, table: secondTable }, [
      { menuItemId: floor.item.id, quantity: 3 },
    ]);

    const items = (await report(tokens.OWNER, `top-items?from=${today}&to=${today}`)).body.data;
    const row = items.find((entry) => entry.menuItemId === floor.item.id);

    assert.equal(row.quantity, 5, 'both sales grouped under one menuItemId');
    assert.equal(row.itemName, 'Paneer Tikka Deluxe', 'reported under the newest name');
  });

  it('refuses a limit above 100 or a sort it does not know', async () => {
    const { tokens } = await seedTeam();
    const today = todayBusinessDate();

    const tooMany = await report(tokens.OWNER, `top-items?from=${today}&to=${today}&limit=101`);
    assert.equal(tooMany.status, 400);

    const badSort = await report(tokens.OWNER, `top-items?from=${today}&to=${today}&sort=price`);
    assert.equal(badSort.status, 400);
  });
});

describe('payment methods', () => {
  it('always returns all four methods, with zeros where unused', async () => {
    const floor = await seedFloor();
    const today = todayBusinessDate();
    await billedAndPaid(floor); // pays in CASH

    const data = (await report(floor.tokens.OWNER, `payment-methods?from=${today}&to=${today}`)).body
      .data;

    assert.deepEqual(
      data.methods.map((row) => row.method),
      ['CASH', 'UPI', 'CARD', 'OTHER'],
      'a missing method reads as "no data"; a zero reads as "none taken"',
    );
    assert.ok(data.methods.find((row) => row.method === 'CASH').amountInPaise > 0);
    assert.equal(data.methods.find((row) => row.method === 'UPI').amountInPaise, 0);
  });

  it('counts an unbilled remainder as unpaid', async () => {
    const floor = await seedFloor();
    const today = todayBusinessDate();

    const order = await readyToBillOrder(floor);
    const bill = (
      await request('POST', '/api/v1/bills', {
        token: floor.tokens.CASHIER,
        body: { orderId: order.id, version: order.version },
      })
    ).body.data;
    // Deliberately not paid.

    const data = (await report(floor.tokens.OWNER, `payment-methods?from=${today}&to=${today}`)).body
      .data;
    assert.equal(data.unpaidInPaise, bill.grandTotalInPaise);
    assert.equal(data.totalCollectedInPaise, 0);
  });

  it('is refused to a MANAGER: the cash figure is owner-only', async () => {
    const { tokens } = await seedTeam();
    const today = todayBusinessDate();

    const asManager = await report(tokens.MANAGER, `payment-methods?from=${today}&to=${today}`);
    assert.equal(asManager.status, 403, 'the one report a manager does not get');

    const asOwner = await report(tokens.OWNER, `payment-methods?from=${today}&to=${today}`);
    assert.equal(asOwner.status, 200);
  });
});

describe('discounts', () => {
  it('attributes each discount to the person who applied it', async () => {
    const floor = await seedFloor();
    const { tokens } = floor;
    const today = todayBusinessDate();

    const order = await readyToBillOrder(floor);
    const bill = (
      await request('POST', '/api/v1/bills', {
        token: tokens.CASHIER,
        body: { orderId: order.id, version: order.version },
      })
    ).body.data;
    await request('POST', `/api/v1/bills/${bill.id}/discount`, {
      token: tokens.MANAGER,
      body: { kind: 'FLAT', valueInPaise: 5000, reason: 'Regular customer' },
    });

    const data = (await report(tokens.OWNER, `discounts?from=${today}&to=${today}`)).body.data;

    assert.equal(data.totalDiscountInPaise, 5000);
    assert.equal(data.discountedBillCount, 1);
    assert.equal(data.byUser.length, 1);
    assert.equal(data.byUser[0].name, ROLES.MANAGER, 'seedTeam names each user after their role');
    assert.equal(data.byUser[0].amountInPaise, 5000);
    assert.equal(data.recent[0].reason, 'Regular customer');
    assert.equal(data.recent[0].billNumber, bill.billNumber);
  });

  it('is zero, not null, when nothing was discounted', async () => {
    const { tokens } = await seedTeam();
    const today = todayBusinessDate();
    const data = (await report(tokens.OWNER, `discounts?from=${today}&to=${today}`)).body.data;

    assert.equal(data.totalDiscountInPaise, 0);
    assert.equal(data.discountAsPercentOfSubtotalBps, 0, 'no division by zero');
    assert.deepEqual(data.byUser, []);
    assert.deepEqual(data.recent, []);
  });
});

describe('stock consumption', () => {
  it('nets deductions against returns and reports wastage separately', async () => {
    const floor = await seedFloor();
    const { tokens } = floor;
    const today = todayBusinessDate();

    const paneer = (
      await request('POST', '/api/v1/ingredients', {
        token: tokens.OWNER,
        body: { name: 'Paneer', baseUnit: 'G', openingQtyInBase: 5000 },
      })
    ).body.data;
    await request('PUT', '/api/v1/recipes', {
      token: tokens.OWNER,
      body: { menuItemId: floor.item.id, items: [{ ingredientId: paneer.id, qtyInBase: 150 }] },
    });

    // Fire two, so 300g is deducted.
    const order = (
      await openOrder(tokens.WAITER, {
        tableId: floor.table.id,
        lines: [{ menuItemId: floor.item.id, quantity: 2 }],
      })
    ).body.data;
    await fireOrder(tokens.WAITER, order.id, order.version);

    // Waste 100g by hand.
    await request('POST', `/api/v1/ingredients/${paneer.id}/movements`, {
      token: tokens.STOREKEEPER,
      body: { type: 'WASTAGE', qtyInBase: 100, reason: 'Spoiled' },
    });

    const rows = (await report(tokens.OWNER, `stock-consumption?from=${today}&to=${today}`)).body.data;
    const row = rows.find((entry) => entry.ingredientId === paneer.id);

    assert.equal(row.name, 'Paneer');
    assert.equal(row.baseUnit, 'G');
    assert.equal(row.consumedInBase, 300, 'two portions at 150g');
    assert.equal(row.returnedInBase, 0);
    assert.equal(row.netConsumedInBase, 300);
    assert.equal(row.wastageInBase, 100);
    assert.equal(row.receivedInBase, 5000, 'the opening balance was a RECEIVED movement');

    // Now cancel the line unmade, which returns the stock.
    const current = (await readOrder(tokens.WAITER, order.id)).body.data;
    await request('POST', `/api/v1/orders/${order.id}/lines/${current.lines[0].id}/cancel`, {
      token: tokens.MANAGER,
      body: { version: current.version, reasonCode: 'OTHER', note: 'Never made', wasPrepared: false },
    });

    const after = (await report(tokens.OWNER, `stock-consumption?from=${today}&to=${today}`)).body.data;
    const afterRow = after.find((entry) => entry.ingredientId === paneer.id);
    assert.equal(afterRow.returnedInBase, 300);
    assert.equal(afterRow.netConsumedInBase, 0, 'deducted then returned is net zero');
  });

  it('is open to a STOREKEEPER, whose job this read is', async () => {
    const { tokens } = await seedTeam();
    const today = todayBusinessDate();

    const asStorekeeper = await report(tokens.STOREKEEPER, `stock-consumption?from=${today}&to=${today}`);
    assert.equal(asStorekeeper.status, 200);

    const asWaiter = await report(tokens.WAITER, `stock-consumption?from=${today}&to=${today}`);
    assert.equal(asWaiter.status, 403);
  });
});

describe('the dashboard', () => {
  it('brings today together: sales, open orders, top items, low stock, staff, unpaid', async () => {
    const floor = await seedFloor();
    const { tokens } = floor;

    const { bill } = await billedAndPaid(floor);

    // A second table left open, so openOrders has something to count.
    const secondTable = (
      await request('POST', '/api/v1/tables', { token: tokens.OWNER, body: { name: 'T2' } })
    ).body.data;
    await openOrder(tokens.WAITER, {
      tableId: secondTable.id,
      lines: [{ menuItemId: floor.item.id, quantity: 2 }],
    });

    // An ingredient already below its threshold.
    await request('POST', '/api/v1/ingredients', {
      token: tokens.OWNER,
      body: { name: 'Butter', baseUnit: 'G', lowStockThresholdInBase: 2000, openingQtyInBase: 500 },
    });

    await request('POST', '/api/v1/attendance/clock-in', { token: tokens.KITCHEN });

    const data = (await report(tokens.OWNER, 'dashboard')).body.data;

    assert.ok(data.businessDate, 'the server decided which day this is');
    assert.equal(data.sales.grossSalesInPaise, bill.grandTotalInPaise);
    assert.equal(data.sales.billCount, 1);

    assert.equal(data.openOrders.count, 1);
    assert.equal(
      data.openOrders.runningValueInPaise,
      2 * 24000,
      'two portions at the seeded 240 rupee price',
    );

    assert.ok(data.topItems.length > 0);
    assert.ok(data.topItems.length <= 5, 'capped at five');

    assert.equal(data.lowStock.length, 1);
    assert.equal(data.lowStock[0].name, 'Butter');

    assert.equal(data.staffOnShift, 1);
    assert.equal(data.unpaidBills.count, 0, 'the one bill was paid');
  });

  it('is all zeros on a restaurant that has done nothing yet', async () => {
    const { tokens } = await seedTeam();
    const data = (await report(tokens.OWNER, 'dashboard')).body.data;

    assert.equal(data.sales.grossSalesInPaise, 0);
    assert.equal(data.sales.averageBillInPaise, 0);
    assert.equal(data.openOrders.count, 0);
    assert.equal(data.openOrders.runningValueInPaise, 0);
    assert.deepEqual(data.topItems, []);
    assert.deepEqual(data.lowStock, []);
    assert.equal(data.staffOnShift, 0);
    assert.equal(data.unpaidBills.count, 0);
  });
});

describe('report permissions and tenancy', () => {
  const RANGED = [
    'sales-summary',
    'sales-by-day',
    'hourly',
    'top-items',
    'tax-summary',
    'discounts',
    'labour-hours',
  ];

  it('lets an owner and a manager read every manager-level report', async () => {
    const { tokens } = await seedTeam();
    const today = todayBusinessDate();

    for (const role of [ROLES.OWNER, ROLES.MANAGER]) {
      for (const path of RANGED) {
        const response = await report(tokens[role], `${path}?from=${today}&to=${today}`);
        assert.equal(response.status, 200, `${role} should read ${path}`);
      }
      const dashboard = await report(tokens[role], 'dashboard');
      assert.equal(dashboard.status, 200, `${role} should read the dashboard`);
    }
  });

  it('refuses every report to a cashier, waiter and kitchen', async () => {
    const { tokens } = await seedTeam();
    const today = todayBusinessDate();

    for (const role of [ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN]) {
      for (const path of [...RANGED, 'payment-methods', 'stock-consumption']) {
        const response = await report(tokens[role], `${path}?from=${today}&to=${today}`);
        assert.equal(response.status, 403, `${role} should not read ${path}`);
      }
      const dashboard = await report(tokens[role], 'dashboard');
      assert.equal(dashboard.status, 403, `${role} should not read the dashboard`);
    }
  });

  it('refuses an unauthenticated caller', async () => {
    const today = todayBusinessDate();
    const response = await request('GET', `/api/v1/reports/sales-summary?from=${today}&to=${today}`);
    assert.equal(response.status, 401);
  });

  it('shows restaurant B none of restaurant A figures', async () => {
    const a = await seedFloor({ name: 'Restaurant A' });
    const today = todayBusinessDate();
    await billedAndPaid(a);

    const b = await seedTeam({ name: 'Restaurant B' });
    const summary = (await report(b.tokens.OWNER, `sales-summary?from=${today}&to=${today}`)).body.data;

    assert.equal(summary.grossSalesInPaise, 0, "A's sales are invisible to B");
    assert.equal(summary.billCount, 0);

    const dashboard = (await report(b.tokens.OWNER, 'dashboard')).body.data;
    assert.equal(dashboard.sales.grossSalesInPaise, 0);
  });
});

describe('the tenant guard escape hatch, after M6', () => {
  it('adds no new use', () => {
    /**
     * M6 adds zero. Every pipeline opens with a $match built by
     * scopedForAggregate, which the tenant guard requires as the FIRST stage
     * and throws otherwise. That requirement is the intended behaviour, not
     * an obstacle to route around with the hatch.
     */
    const files = readdirSync(SERVER_DIR, { recursive: true, encoding: 'utf8' })
      .map((name) => name.split(sep).join('/'))
      .filter(
        (name) =>
          name.endsWith('.js') &&
          !name.includes('node_modules') &&
          !name.startsWith('tests/') &&
          name !== 'models/plugins/tenantGuard.js',
      );

    const counts = {};
    for (const name of files) {
      const contents = readFileSync(join(SERVER_DIR, name), 'utf8');
      const uses = contents.match(/skipTenantGuard/g)?.length ?? 0;
      if (uses > 0) counts[name] = uses;
    }

    assert.deepEqual(counts, {
      'services/authService.js': 3,
      'services/tokenService.js': 1,
    });
  });

  it('M6 writes nothing: no report route uses a write verb', () => {
    const routeFile = readFileSync(join(SERVER_DIR, 'routes/reportRoutes.js'), 'utf8');

    for (const verb of ['router.post', 'router.patch', 'router.put', 'router.delete']) {
      assert.ok(!routeFile.includes(verb), `reportRoutes.js must not contain ${verb}`);
    }
  });
});
