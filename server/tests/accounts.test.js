/**
 * On Hold accounts and platform payouts. M16 and M17, built in P09.
 *
 * Both are money that arrives later. An On Hold bill is a sale on the day it is
 * issued; its money comes in as a collection on another day. A platform pays
 * in batches, and what it should have paid is worked out from each payment's
 * frozen commission.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Account } from '../models/Account.js';
import { AccountEntry } from '../models/AccountEntry.js';
import { AuditLog } from '../models/AuditLog.js';
import { Bill } from '../models/Bill.js';
import { Counter } from '../models/Counter.js';
import { Order } from '../models/Order.js';
import { PaymentMethod } from '../models/PaymentMethod.js';
import { PlatformPayout } from '../models/PlatformPayout.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import {
  createMenuItem,
  createTable,
  fireOrder,
  readOrder,
  readyToBillOrder,
  seedFloor,
} from './helpers/m2Fixtures.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of [Order, Bill, Counter, PaymentMethod, Account, AccountEntry, PlatformPayout]) {
    await model.init();
  }
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
});

afterEach(() => resetClockForTests());

const ist = (date, time) => new Date(`${date}T${time}:00+05:30`);

const createAccount = (token, body) => request('POST', '/api/v1/accounts', { token, body });
const listAccounts = (token, query = '') => request('GET', `/api/v1/accounts${query}`, { token });
const charge = (token, billId, accountId) =>
  request('POST', `/api/v1/bills/${billId}/charge-to-account`, { token, body: { accountId } });
const collect = (token, accountId, body) =>
  request('POST', `/api/v1/accounts/${accountId}/collections`, { token, body });
const adjust = (token, accountId, body) =>
  request('POST', `/api/v1/accounts/${accountId}/adjustments`, { token, body });
const statement = (token, accountId, query = '') =>
  request('GET', `/api/v1/accounts/${accountId}/statement${query}`, { token });
const pay = (token, billId, body) => request('POST', `/api/v1/bills/${billId}/payments`, { token, body });
const discount = (token, billId, body) => request('POST', `/api/v1/bills/${billId}/discount`, { token, body });
const voidBill = (token, billId) =>
  request('POST', `/api/v1/bills/${billId}/void`, { token, body: { reasonCode: 'WRONG_TABLE' } });

const listPayouts = (token, query = '') => request('GET', `/api/v1/platform-payouts${query}`, { token });
const recordPayout = (token, body) => request('POST', '/api/v1/platform-payouts', { token, body });
const voidPayout = (token, id, reason = 'Entered twice') =>
  request('POST', `/api/v1/platform-payouts/${id}/void`, { token, body: { reason } });

const menuItem = async (token, name, priceInPaise) =>
  (await createMenuItem(token, { name, priceInPaise, taxRateBps: 500 })).body.data.id;

let tableCounter = 0;
async function dineInBill(floor, items, tableName = null) {
  tableCounter += 1;
  const table = (await createTable(floor.tokens.OWNER, { name: tableName ?? `Acc ${tableCounter}` })).body.data;
  const order = await readyToBillOrder(
    { ...floor, table },
    items.map((menuItemId) => ({ menuItemId, quantity: 1 })),
  );
  const response = await request('POST', '/api/v1/bills', {
    token: floor.tokens.CASHIER,
    body: { orderId: order.id, version: order.version },
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { bill: response.body.data, table };
}

/** The ledger arithmetic of check C10, done by hand from the stored entries. */
async function ledgerBalance(restaurantId, accountId) {
  const entries = await AccountEntry.find({ restaurantId, accountId });
  return entries.reduce((total, entry) => {
    switch (entry.type) {
      case 'OPENING':
      case 'CHARGE':
        return total + entry.amountInPaise;
      case 'CHARGE_REVERSED':
      case 'COLLECTION':
        return total - entry.amountInPaise;
      default:
        return total + (entry.direction === 'UP' ? entry.amountInPaise : -entry.amountInPaise);
    }
  }, 0);
}

async function outstandingOf(token, accountId) {
  const accounts = (await listAccounts(token, '?includeInactive=true')).body.data;
  return accounts.find((account) => account.id === accountId).outstandingInPaise;
}

/** The golden day's two accounts and its B09 and B10, at their real times. */
async function goldenOnHold() {
  const floor = await seedFloor();
  const { tokens } = floor;
  const e210 = (await createAccount(tokens.MANAGER, { name: 'E-210 Office' })).body.data;
  const w330 = (await createAccount(tokens.MANAGER, { name: 'W-330 Office' })).body.data;
  const tea = await menuItem(tokens.OWNER, 'Masala Tea', 9000);
  const bowl = await menuItem(tokens.OWNER, 'Mexican Bowl', 40000);
  const papad = await menuItem(tokens.OWNER, 'Roasted Papad', 8000);

  setClockForTests(ist('2026-09-26', '18:30'));
  const { bill: b09, table: table35 } = await dineInBill(floor, [tea], 'Table 35');
  const discounted = await discount(tokens.MANAGER, b09.id, {
    kind: 'PERCENT',
    rateBps: 5000,
    reasonCode: 'STAFF_OFFICE',
  });
  assert.equal(discounted.status, 200, JSON.stringify(discounted.body));
  assert.equal(discounted.body.data.grandTotalInPaise, 4700);

  setClockForTests(ist('2026-09-26', '19:10'));
  const { bill: b10 } = await dineInBill(floor, [bowl, papad], 'Table 30');
  assert.equal(b10.grandTotalInPaise, 50400);

  return { ...floor, e210, w330, b09, b10, table35 };
}

// ---------------------------------------------------------------------------

describe('accounts', () => {
  it('an opening balance of 120000 writes one OPENING entry and is the outstanding balance', async () => {
    const floor = await seedFloor();
    const created = await createAccount(floor.tokens.MANAGER, {
      name: 'Shah Traders',
      contactName: 'Mr Shah',
      openingBalanceInPaise: 120000,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.outstandingInPaise, 120000);
    assert.equal(created.body.data.openingBalanceInPaise, 120000);
    assert.equal(created.body.data.nameLower, undefined);

    const entries = await AccountEntry.find({ restaurantId: floor.restaurant.id });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].type, 'OPENING');
    assert.equal(entries[0].direction, 'UP');
    assert.equal(entries[0].amountInPaise, 120000);
  });

  it('refuses a duplicate name ignoring case, and never edits the opening balance', async () => {
    const { tokens } = await seedFloor();
    const first = (await createAccount(tokens.MANAGER, { name: 'W-330 Office' })).body.data;
    assert.equal((await createAccount(tokens.MANAGER, { name: 'w-330 office' })).status, 409);
    const edit = await request('PATCH', `/api/v1/accounts/${first.id}`, {
      token: tokens.MANAGER,
      body: { openingBalanceInPaise: 5000 },
    });
    assert.equal(edit.status, 400);
    const renamed = await request('PATCH', `/api/v1/accounts/${first.id}`, {
      token: tokens.MANAGER,
      body: { contactName: 'Reception' },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.data.contactName, 'Reception');
  });
});

describe('charging a bill to an account', () => {
  it('golden B09: Masala Tea at 50% off, charged to E-210 Office for 4700, frees the table', async () => {
    const { tokens, e210, b09, table35, restaurant } = await goldenOnHold();

    setClockForTests(ist('2026-09-26', '18:31'));
    const response = await charge(tokens.MANAGER, b09.id, e210.id);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const charged = response.body.data;
    assert.equal(charged.status, 'ON_ACCOUNT');
    assert.equal(charged.chargedToAccountInPaise, 4700);
    assert.deepEqual(charged.account, { accountId: e210.id, accountName: 'E-210 Office' });
    assert.equal(charged.businessDate, '2026-09-26');

    const tables = (await request('GET', '/api/v1/tables', { token: tokens.WAITER })).body.data;
    assert.equal(tables.find((row) => row.id === table35.id).occupancy.isOccupied, false);
    const order = (await readOrder(tokens.MANAGER, b09.orderId)).body.data;
    assert.equal(order.status, 'BILLED');

    const entries = await AccountEntry.find({ restaurantId: restaurant.id, accountId: e210.id });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].type, 'CHARGE');
    assert.equal(entries[0].amountInPaise, 4700);
    assert.equal(entries[0].billNumber, b09.billNumber);
    assert.equal(entries[0].businessDate, '2026-09-26');

    const [audit] = await AuditLog.find({ restaurantId: restaurant.id, action: 'BILL_CHARGED_TO_ACCOUNT' });
    assert.equal(audit.amountInPaise, 4700);
    assert.equal(audit.entityLabel, b09.billNumber);
    assert.equal(await outstandingOf(tokens.MANAGER, e210.id), 4700);
  });

  it('golden B10: Mexican Bowl and Roasted Papad charged to W-330 Office for 50400', async () => {
    const { tokens, w330, b10 } = await goldenOnHold();
    const response = await charge(tokens.OWNER, b10.id, w330.id);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.chargedToAccountInPaise, 50400);
    assert.equal(await outstandingOf(tokens.MANAGER, w330.id), 50400);
  });

  it('a partly paid bill puts only the remainder on the account, and C3 holds for it', async () => {
    const { tokens, w330, b10 } = await goldenOnHold();
    await pay(tokens.CASHIER, b10.id, { method: 'CASH', amountInPaise: 20000 });

    const charged = (await charge(tokens.MANAGER, b10.id, w330.id)).body.data;
    assert.equal(charged.chargedToAccountInPaise, 30400);
    assert.equal(charged.amountPaidInPaise + charged.chargedToAccountInPaise, charged.grandTotalInPaise);
    assert.equal(await outstandingOf(tokens.MANAGER, w330.id), 30400);
  });

  it('refuses payments and discounts on an On Hold bill, and a second charge', async () => {
    const { tokens, w330, e210, b10 } = await goldenOnHold();
    await charge(tokens.MANAGER, b10.id, w330.id);

    const payment = await pay(tokens.CASHIER, b10.id, { method: 'CASH', amountInPaise: 100 });
    assert.equal(payment.status, 422);
    const discounted = await discount(tokens.MANAGER, b10.id, {
      kind: 'FLAT',
      valueInPaise: 100,
      reasonCode: 'REGULAR_GUEST',
    });
    assert.equal(discounted.status, 422);
    assert.equal((await charge(tokens.MANAGER, b10.id, e210.id)).status, 422);
  });

  it('refuses a cashier, an inactive account, and a voided bill', async () => {
    const { tokens, w330, b10, b09, e210 } = await goldenOnHold();
    assert.equal((await charge(tokens.CASHIER, b10.id, w330.id)).status, 403);

    await request('PATCH', `/api/v1/accounts/${w330.id}`, { token: tokens.MANAGER, body: { isActive: false } });
    assert.equal((await charge(tokens.MANAGER, b10.id, w330.id)).status, 422);

    await voidBill(tokens.MANAGER, b09.id);
    assert.equal((await charge(tokens.MANAGER, b09.id, e210.id)).status, 422);
  });

  it('voiding B10 after charging writes CHARGE_REVERSED 50400 and the order is billable again', async () => {
    const { tokens, w330, b10, restaurant } = await goldenOnHold();
    await charge(tokens.MANAGER, b10.id, w330.id);
    assert.equal(await outstandingOf(tokens.MANAGER, w330.id), 50400);

    const voided = await voidBill(tokens.MANAGER, b10.id);
    assert.equal(voided.status, 200, JSON.stringify(voided.body));

    const reversed = await AccountEntry.find({ restaurantId: restaurant.id, type: 'CHARGE_REVERSED' });
    assert.equal(reversed.length, 1);
    assert.equal(reversed[0].amountInPaise, 50400);
    assert.equal(reversed[0].direction, 'DOWN');
    assert.equal(await outstandingOf(tokens.MANAGER, w330.id), 0);

    const order = (await readOrder(tokens.MANAGER, b10.orderId)).body.data;
    assert.equal(order.status, 'READY_TO_BILL');
    const rebilled = await request('POST', '/api/v1/bills', {
      token: tokens.CASHIER,
      body: { orderId: order.id, version: order.version },
    });
    assert.equal(rebilled.status, 201);
  });
});

describe('collections, adjustments and statements', () => {
  it('golden section 5: W-330 Office pays 50400 in cash at 1:15 PM on 27 Sep', async () => {
    const { tokens, w330, e210, b09, b10, restaurant } = await goldenOnHold();
    setClockForTests(ist('2026-09-26', '19:12'));
    await charge(tokens.MANAGER, b09.id, e210.id);
    await charge(tokens.MANAGER, b10.id, w330.id);

    setClockForTests(ist('2026-09-27', '13:15'));
    const response = await collect(tokens.CASHIER, w330.id, { method: 'CASH', amountInPaise: 50400 });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    const collection = response.body.data;
    assert.equal(collection.type, 'COLLECTION');
    assert.equal(collection.businessDate, '2026-09-27');
    assert.equal(collection.method, 'CASH');
    assert.equal(collection.methodName, 'Cash');
    assert.equal(collection.methodKind, 'IN_HAND');

    assert.equal(await outstandingOf(tokens.MANAGER, w330.id), 0);
    assert.equal(await outstandingOf(tokens.MANAGER, e210.id), 4700);

    // A collection is never a sale: no bill changed and none was created.
    assert.equal(await Bill.countDocuments({ restaurantId: restaurant.id }), 2);

    const accounts = (await listAccounts(tokens.CASHIER)).body.data;
    const byName = Object.fromEntries(accounts.map((account) => [account.name, account]));
    assert.equal(byName['W-330 Office'].oldestUncollectedDate, null);
    assert.equal(byName['E-210 Office'].oldestUncollectedDate, '2026-09-26');
  });

  it('refuses more than the balance, and a platform method', async () => {
    const floor = await seedFloor();
    const { tokens } = floor;
    const account = (await createAccount(tokens.MANAGER, { name: 'Tab', openingBalanceInPaise: 1000 })).body.data;
    await request('POST', '/api/v1/payment-methods', {
      token: tokens.OWNER,
      body: { code: 'ZOMATO_GOLD', name: 'Zomato Gold', kind: 'PLATFORM' },
    });

    const tooMuch = await collect(tokens.CASHIER, account.id, { method: 'CASH', amountInPaise: 1001 });
    assert.equal(tooMuch.status, 422);
    assert.equal(tooMuch.body.error.code, 'ACCOUNT_BALANCE_EXCEEDED');

    const platform = await collect(tokens.CASHIER, account.id, { method: 'ZOMATO_GOLD', amountInPaise: 100 });
    assert.equal(platform.status, 422);
    assert.equal(platform.body.error.code, 'PAYMENT_METHOD_NOT_ALLOWED');

    assert.equal((await collect(tokens.WAITER, account.id, { method: 'CASH', amountInPaise: 100 })).status, 403);
  });

  it('an adjustment is the owner\'s, moves the balance, and writes the audit line', async () => {
    const floor = await seedFloor();
    const { tokens } = floor;
    const account = (await createAccount(tokens.MANAGER, { name: 'Tab', openingBalanceInPaise: 10000 })).body.data;
    const body = { direction: 'DOWN', amountInPaise: 2500, reason: 'Written off, staff discount' };

    assert.equal((await adjust(tokens.MANAGER, account.id, body)).status, 403);
    const response = await adjust(tokens.OWNER, account.id, body);
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(await outstandingOf(tokens.OWNER, account.id), 7500);

    const tooMuch = await adjust(tokens.OWNER, account.id, { ...body, amountInPaise: 7501 });
    assert.equal(tooMuch.body.error.code, 'ACCOUNT_BALANCE_EXCEEDED');
    assert.equal((await adjust(tokens.OWNER, account.id, { ...body, direction: 'UP' })).status, 201);

    const audit = await AuditLog.find({ restaurantId: floor.restaurant.id, action: 'ACCOUNT_BALANCE_ADJUSTED' });
    assert.equal(audit.length, 2);
    assert.equal(audit[0].entityType, 'ACCOUNT');
    assert.equal(audit[0].amountInPaise, -2500);
    assert.equal(audit[0].reason, 'Written off, staff discount');
  });

  it('the statement over 26 to 27 September ends at the outstanding balance, and C10 holds', async () => {
    const { tokens, w330, e210, b09, b10, restaurant } = await goldenOnHold();
    setClockForTests(ist('2026-09-25', '12:00'));
    await adjust(tokens.OWNER, w330.id, { direction: 'UP', amountInPaise: 1000, reason: 'Carried over' });
    setClockForTests(ist('2026-09-26', '19:12'));
    await charge(tokens.MANAGER, b09.id, e210.id);
    await charge(tokens.MANAGER, b10.id, w330.id);
    setClockForTests(ist('2026-09-27', '13:15'));
    await collect(tokens.CASHIER, w330.id, { method: 'CASH', amountInPaise: 50400 });
    setClockForTests(ist('2026-09-28', '10:00'));
    await adjust(tokens.OWNER, w330.id, { direction: 'DOWN', amountInPaise: 400, reason: 'Rounded off' });

    const response = await statement(tokens.MANAGER, w330.id, '?from=2026-09-26&to=2026-09-27');
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const data = response.body.data;
    assert.equal(data.openingBalanceInPaise, 1000);
    assert.deepEqual(
      data.entries.map((entry) => [entry.type, entry.amountInPaise, entry.balanceInPaise, entry.businessDate]),
      [
        ['CHARGE', 50400, 51400, '2026-09-26'],
        ['COLLECTION', 50400, 1000, '2026-09-27'],
      ],
    );
    assert.equal(data.closingBalanceInPaise, 1000);

    const whole = (await statement(tokens.MANAGER, w330.id)).body.data;
    assert.equal(whole.closingBalanceInPaise, await outstandingOf(tokens.MANAGER, w330.id));
    assert.equal(whole.closingBalanceInPaise, 600);
    assert.equal((await statement(tokens.CASHIER, w330.id)).status, 403);

    // C10 by hand: OPENING + CHARGE − CHARGE_REVERSED − COLLECTION ± ADJUSTMENT.
    for (const account of [w330, e210]) {
      assert.equal(
        await ledgerBalance(restaurant.id, account.id),
        await outstandingOf(tokens.MANAGER, account.id),
        account.name,
      );
    }
  });
});

describe('platform payouts', () => {
  async function swiggyDay() {
    const floor = await seedFloor();
    const { tokens } = floor;
    const swiggy = (
      await request('POST', '/api/v1/payment-methods', {
        token: tokens.OWNER,
        body: {
          code: 'SWIGGY',
          name: 'Swiggy',
          kind: 'PLATFORM',
          platformCode: 'SWIGGY',
          orderTypes: ['DELIVERY'],
          tallyLedgerCode: '868',
          commissionBps: 2000,
        },
      })
    ).body.data;
    const pizza = await menuItem(tokens.OWNER, 'Half & Half Pizza', 38000);
    const shake = await menuItem(tokens.OWNER, 'Ferrero Hazelnut Shake', 33000);
    const latte = await menuItem(tokens.OWNER, 'Caffe Latte', 22000);
    return { ...floor, swiggy, items: { pizza, shake, latte } };
  }

  /** Golden B07: Swiggy, 93000 at 0%, paid by Swiggy at 5:21 PM on 26 September. */
  async function goldenB07(floor) {
    setClockForTests(ist('2026-09-26', '17:21'));
    const opened = (
      await request('POST', '/api/v1/orders', {
        token: floor.tokens.CASHIER,
        body: {
          orderType: 'DELIVERY',
          platform: { code: 'SWIGGY', orderId: '249377796192385' },
          lines: Object.values(floor.items).map((menuItemId) => ({ menuItemId, quantity: 1 })),
        },
      })
    ).body.data;
    const fired = (await fireOrder(floor.tokens.CASHIER, opened.id, opened.version)).body.data;
    for (const kot of fired.kots) {
      await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: floor.tokens.KITCHEN });
    }
    let current = (await readOrder(floor.tokens.CASHIER, opened.id)).body.data;
    for (const line of current.lines) {
      current = (
        await request('PATCH', `/api/v1/orders/${opened.id}/lines/${line.id}/served`, {
          token: floor.tokens.CASHIER,
          body: { version: current.version },
        })
      ).body.data;
    }
    const bill = (
      await request('POST', '/api/v1/bills', {
        token: floor.tokens.CASHIER,
        body: { orderId: current.id, version: current.version },
      })
    ).body.data;
    assert.equal(bill.grandTotalInPaise, 93000);
    await pay(floor.tokens.CASHIER, bill.id, { method: 'SWIGGY', amountInPaise: 93000 });
    return bill;
  }

  const payoutFor = (overrides = {}) => ({
    method: 'SWIGGY',
    periodFrom: '2026-09-26',
    periodTo: '2026-09-26',
    amountReceivedInPaise: 74400,
    receivedOn: '2026-10-02',
    reference: 'UTR123',
    ...overrides,
  });

  it('golden: Swiggy at 2000 bps, 93000 paid, 74400 received, expected 74400, difference 0 (C11)', async () => {
    const floor = await swiggyDay();
    await goldenB07(floor);

    const response = await recordPayout(floor.tokens.MANAGER, payoutFor());
    assert.equal(response.status, 201, JSON.stringify(response.body));
    const payout = response.body.data;
    assert.equal(payout.methodName, 'Swiggy');
    assert.equal(payout.expectedInPaise, 74400);
    assert.equal(payout.differenceInPaise, 0);
    assert.equal(payout.includedPaymentCount, 1);
    assert.deepEqual(payout.rateNotSet, []);

    const listed = (await listPayouts(floor.tokens.OWNER)).body.data;
    assert.equal(listed.length, 1);
    assert.equal(listed[0].expectedInPaise, 74400);

    const [audit] = await AuditLog.find({ restaurantId: floor.restaurant.id, action: 'PLATFORM_PAYOUT_RECORDED' });
    assert.equal(audit.entityType, 'PAYOUT');
    assert.equal(audit.amountInPaise, 74400);
  });

  it('a payment taken before a commission was set is listed under rate not set, and left out', async () => {
    const floor = await swiggyDay();
    await request('PATCH', `/api/v1/payment-methods/${floor.swiggy.id}`, {
      token: floor.tokens.OWNER,
      body: { commissionBps: null },
    });
    await goldenB07(floor);
    await request('PATCH', `/api/v1/payment-methods/${floor.swiggy.id}`, {
      token: floor.tokens.OWNER,
      body: { commissionBps: 2000 },
    });

    const payout = (await recordPayout(floor.tokens.MANAGER, payoutFor())).body.data;
    assert.equal(payout.expectedInPaise, 0);
    assert.equal(payout.includedPaymentCount, 0);
    assert.equal(payout.rateNotSet.length, 1);
    assert.equal(payout.rateNotSet[0].amountInPaise, 93000);
    assert.equal(payout.differenceInPaise, 74400);
  });

  it('refuses an overlapping payout until the first is voided', async () => {
    const floor = await swiggyDay();
    const first = (await recordPayout(floor.tokens.MANAGER, payoutFor({ periodTo: '2026-09-28' }))).body.data;

    const overlap = await recordPayout(floor.tokens.MANAGER, payoutFor({ periodFrom: '2026-09-28', periodTo: '2026-09-30' }));
    assert.equal(overlap.status, 409);
    assert.equal(overlap.body.error.code, 'PAYOUT_PERIOD_OVERLAP');

    // Next to it, not overlapping, is fine.
    const next = await recordPayout(floor.tokens.MANAGER, payoutFor({ periodFrom: '2026-09-29', periodTo: '2026-09-30' }));
    assert.equal(next.status, 201);

    assert.equal((await voidPayout(floor.tokens.MANAGER, first.id)).status, 403);
    const voided = await voidPayout(floor.tokens.OWNER, first.id);
    assert.equal(voided.status, 200);
    assert.equal(voided.body.data.isVoided, true);
    assert.equal(voided.body.data.voidReason, 'Entered twice');

    const again = await recordPayout(floor.tokens.MANAGER, payoutFor({ periodTo: '2026-09-28' }));
    assert.equal(again.status, 201, 'the voided payout no longer counts for the overlap rule');
    assert.equal(await PlatformPayout.countDocuments({ restaurantId: floor.restaurant.id }), 3, 'nothing deleted');
  });

  it('a later commission change does not move an existing payout\'s expected amount', async () => {
    const floor = await swiggyDay();
    await goldenB07(floor);
    const payout = (await recordPayout(floor.tokens.MANAGER, payoutFor())).body.data;
    assert.equal(payout.expectedInPaise, 74400);

    await request('PATCH', `/api/v1/payment-methods/${floor.swiggy.id}`, {
      token: floor.tokens.OWNER,
      body: { commissionBps: 2500 },
    });
    const [listed] = (await listPayouts(floor.tokens.OWNER)).body.data;
    assert.equal(listed.expectedInPaise, 74400);
  });

  it('refuses an in-hand method, a period that ends before it starts, and a voided bill\'s payment counts for nothing', async () => {
    const floor = await swiggyDay();
    assert.equal((await recordPayout(floor.tokens.MANAGER, payoutFor({ method: 'CASH' }))).status, 422);
    assert.equal(
      (await recordPayout(floor.tokens.MANAGER, payoutFor({ periodFrom: '2026-09-27' }))).status,
      400,
    );

    const bill = await goldenB07(floor);
    await voidBill(floor.tokens.MANAGER, bill.id);
    const payout = (await recordPayout(floor.tokens.MANAGER, payoutFor())).body.data;
    assert.equal(payout.expectedInPaise, 0);
  });
});

describe('permissions', () => {
  it('matches both permission tables', async () => {
    const floor = await seedFloor();
    const { tokens } = floor;
    const account = (await createAccount(tokens.OWNER, { name: 'Tab', openingBalanceInPaise: 100000 })).body.data;
    const someId = account.id;

    // [method, path, body, roles allowed]
    const cases = [
      ['GET', '/api/v1/accounts', undefined, ['OWNER', 'MANAGER', 'CASHIER']],
      ['POST', '/api/v1/accounts', { name: 'X' }, ['OWNER', 'MANAGER']],
      ['PATCH', `/api/v1/accounts/${someId}`, { note: 'x' }, ['OWNER', 'MANAGER']],
      ['POST', `/api/v1/accounts/${someId}/collections`, { method: 'CASH', amountInPaise: 1 }, ['OWNER', 'MANAGER', 'CASHIER']],
      ['POST', `/api/v1/accounts/${someId}/adjustments`, { direction: 'UP', amountInPaise: 1, reason: 'x' }, ['OWNER']],
      ['GET', `/api/v1/accounts/${someId}/statement`, undefined, ['OWNER', 'MANAGER']],
      ['POST', `/api/v1/bills/${someId}/charge-to-account`, { accountId: someId }, ['OWNER', 'MANAGER']],
      ['GET', '/api/v1/platform-payouts', undefined, ['OWNER', 'MANAGER']],
      ['POST', '/api/v1/platform-payouts', { method: 'X1' }, ['OWNER', 'MANAGER']],
      ['POST', `/api/v1/platform-payouts/${someId}/void`, { reason: 'x' }, ['OWNER']],
    ];

    let counter = 0;
    for (const [method, path, body, allowed] of cases) {
      for (const role of ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'STOREKEEPER']) {
        counter += 1;
        const sent = method === 'POST' && path === '/api/v1/accounts' ? { name: `X${counter}` } : body;
        const response = await request(method, path, { token: tokens[role], body: sent });
        if (allowed.includes(role)) {
          assert.notEqual(response.status, 403, `${role} ${method} ${path}`);
        } else {
          assert.equal(response.status, 403, `${role} ${method} ${path}`);
        }
      }
    }
    assert.equal((await request('GET', '/api/v1/accounts')).status, 401);
  });

  it('another restaurant\'s account is a 404, never a 403', async () => {
    const a = await seedFloor();
    const b = await seedFloor({ name: 'Other Cafe' });
    const theirs = (await createAccount(b.tokens.OWNER, { name: 'Theirs', openingBalanceInPaise: 1000 })).body.data;
    assert.equal((await statement(a.tokens.OWNER, theirs.id)).status, 404);
    assert.equal((await collect(a.tokens.OWNER, theirs.id, { method: 'CASH', amountInPaise: 1 })).status, 404);
  });
});
