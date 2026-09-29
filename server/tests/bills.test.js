/**
 * Billing tests.
 *
 * The ones that matter most are marked in their describe names: the GST
 * arithmetic landing on a real bill, the bill number never being reused, a
 * voided bill leaving every total, and the receipt surviving a 60-character
 * dish name.
 *
 * utils/tax.js has its own unit tests in tax.test.js. These are about the
 * endpoints: permissions, tenancy, validation, and the arithmetic arriving
 * intact at the edge.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ROLES } from '../config/roles.js';
import { AuditLog } from '../models/AuditLog.js';
import { Bill } from '../models/Bill.js';
import { Counter } from '../models/Counter.js';
import { Order } from '../models/Order.js';
import {
  clearTestDatabase,
  startTestDatabase,
  stopTestDatabase,
} from './helpers/testDatabase.js';
import {
  createMenuItem,
  readOrder,
  readyToBillOrder,
  seedFloor,
} from './helpers/m2Fixtures.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));

const createBill = (token, body) => request('POST', '/api/v1/bills', { token, body });
const getBill = (token, billId) => request('GET', `/api/v1/bills/${billId}`, { token });
const discount = (token, billId, body) =>
  request('POST', `/api/v1/bills/${billId}/discount`, { token, body });
const pay = (token, billId, body) =>
  request('POST', `/api/v1/bills/${billId}/payments`, { token, body });
const voidBill = (token, billId, body) =>
  request('POST', `/api/v1/bills/${billId}/void`, { token, body });

/** A floor with an order sitting at READY_TO_BILL, which is the only billable state. */
async function billableFloor(options = {}) {
  const floor = await seedFloor(options);
  const order = await readyToBillOrder(floor);
  return { ...floor, order };
}

/** The same, already billed. */
async function billedFloor(options = {}) {
  const floor = await billableFloor(options);
  const response = await createBill(floor.tokens.CASHIER, {
    orderId: floor.order.id,
    version: floor.order.version,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { ...floor, bill: response.body.data };
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

describe('creating a bill', () => {
  it('bills a READY_TO_BILL order and computes GST on top of the price', async () => {
    const { order, tokens } = await billableFloor();

    const response = await createBill(tokens.CASHIER, { orderId: order.id, version: order.version });

    assert.equal(response.status, 201);
    const bill = response.body.data;

    // One Paneer Tikka at 240 rupees, 5% GST. Prices are tax-EXCLUSIVE (D1).
    assert.equal(bill.subtotalInPaise, 24000);
    assert.equal(bill.totalTaxInPaise, 1200);
    assert.equal(bill.grandTotalInPaise, 25200);
    assert.equal(bill.status, 'UNPAID');
    assert.equal(bill.amountPaidInPaise, 0);
    assert.deepEqual(bill.taxBreakdown, [
      {
        taxRateBps: 500,
        taxableInPaise: 24000,
        taxInPaise: 1200,
        cgstInPaise: 600,
        sgstInPaise: 600,
      },
    ]);
  });

  it('copies the name and price off the order line, not the live menu', async () => {
    /**
     * THE SNAPSHOT, one module further down. M2 proved the order line keeps the
     * 7pm price; this proves the bill does too, and that raising a price
     * between serving and billing does not reach the customer.
     */
    const floor = await billableFloor();
    const { order, tokens, item } = floor;

    await request('PATCH', `/api/v1/menu-items/${item.id}`, {
      token: tokens.OWNER,
      body: { name: 'Paneer Tikka Deluxe', priceInPaise: 99900, taxRateBps: 1800 },
    });

    const bill = (await createBill(tokens.CASHIER, { orderId: order.id, version: order.version }))
      .body.data;

    assert.equal(bill.lines[0].itemName, 'Paneer Tikka', 'the 7pm name');
    assert.equal(bill.lines[0].unitPriceInPaise, 24000, 'the 7pm price');
    assert.equal(bill.lines[0].taxRateBps, 500, 'the 7pm tax rate');
    assert.equal(bill.grandTotalInPaise, 25200);
  });

  it('leaves cancelled lines off the bill entirely', async () => {
    // The soft-delete leak from BUILD-PLAN section 8, closed where it would
    // first appear: a cancelled dish must not be charged for.
    const floor = await seedFloor();
    const second = (await createMenuItem(floor.tokens.OWNER, { name: 'Dal Fry' })).body.data;

    // Cancelled while the order is still OPEN: M2 only allows a line cancel
    // from OPEN, so the dish has to come off before the order is billable.
    const opened = (
      await request('POST', '/api/v1/orders', {
        token: floor.tokens.WAITER,
        body: {
          orderType: 'DINE_IN',
          tableId: floor.table.id,
          lines: [
            { menuItemId: floor.item.id, quantity: 1 },
            { menuItemId: second.id, quantity: 1 },
          ],
        },
      })
    ).body.data;

    const cancelled = (
      await request('POST', `/api/v1/orders/${opened.id}/lines/${opened.lines[1].id}/cancel`, {
        token: floor.tokens.MANAGER,
        body: { version: opened.version, reason: 'Changed their mind' },
      })
    ).body.data;
    assert.equal(cancelled.lines[1].status, 'CANCELLED');

    // Now run the remaining line through to billable.
    const fired = (
      await request('POST', `/api/v1/orders/${opened.id}/fire`, {
        token: floor.tokens.WAITER,
        body: { version: cancelled.version },
      })
    ).body.data;
    await request('PATCH', `/api/v1/kots/${fired.kot.id}/ready`, { token: floor.tokens.KITCHEN });

    const afterReady = (await readOrder(floor.tokens.WAITER, opened.id)).body.data;
    const served = (
      await request(
        'PATCH',
        `/api/v1/orders/${opened.id}/lines/${opened.lines[0].id}/served`,
        { token: floor.tokens.WAITER, body: { version: afterReady.version } },
      )
    ).body.data;
    assert.equal(served.status, 'READY_TO_BILL');

    const bill = (
      await createBill(floor.tokens.CASHIER, { orderId: opened.id, version: served.version })
    ).body.data;

    assert.equal(bill.lines.length, 1, 'only the live line is billed');
    assert.equal(bill.subtotalInPaise, 24000);
  });

  it('refuses an order that is still open', async () => {
    const { tokens, table, item } = await seedFloor();
    const opened = (
      await request('POST', '/api/v1/orders', {
        token: tokens.WAITER,
        body: { orderType: 'DINE_IN', tableId: table.id, lines: [{ menuItemId: item.id, quantity: 1 }] },
      })
    ).body.data;

    const response = await createBill(tokens.CASHIER, {
      orderId: opened.id,
      version: opened.version,
    });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'BUSINESS_RULE_VIOLATED');
  });

  it('refuses a second live bill and hands back the one that exists', async () => {
    const { bill, order, tokens } = await billedFloor();
    const current = (await readOrder(tokens.CASHIER, order.id)).body.data;

    const response = await createBill(tokens.CASHIER, {
      orderId: order.id,
      version: current.version,
    });

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'BILL_ALREADY_EXISTS');
    assert.equal(
      response.body.error.existingBillId,
      bill.id,
      'the client is told which bill to open instead of hitting a dead end',
    );
  });

  it('refuses a client that tries to send its own totals', async () => {
    const { order, tokens } = await billableFloor();

    const response = await request('POST', '/api/v1/bills', {
      token: tokens.CASHIER,
      body: { orderId: order.id, version: order.version, grandTotalInPaise: 1 },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_FAILED');
  });

  it('answers 404, not 403, for an order in another restaurant', async () => {
    const a = await seedFloor({ name: 'Restaurant A' });
    const b = await billableFloor({ name: 'Restaurant B' });

    const response = await createBill(a.tokens.CASHIER, {
      orderId: b.order.id,
      version: b.order.version,
    });

    assert.equal(response.status, 404);
  });

  it('keeps the table occupied until the bill is paid', async () => {
    /**
     * M2 decided READY_TO_BILL occupies a table and BILLED does not. If
     * creating the bill moved the order to BILLED, the table would read free
     * while the customers were still sitting there paying.
     */
    const { bill, tokens } = await billedFloor();

    const occupiedNow = (await request('GET', '/api/v1/tables', { token: tokens.OWNER })).body
      .data[0].occupancy.isOccupied;
    assert.equal(occupiedNow, true, 'still occupied while unpaid');

    await pay(tokens.CASHIER, bill.id, { method: 'CASH', amountInPaise: bill.grandTotalInPaise });

    const occupiedAfter = (await request('GET', '/api/v1/tables', { token: tokens.OWNER })).body
      .data[0].occupancy.isOccupied;
    assert.equal(occupiedAfter, false, 'free once paid');
  });
});

describe('bill numbers are never reused', () => {
  it('numbers the first bill of the year 000001 and counts up', async () => {
    const first = await billedFloor();
    assert.match(first.bill.billNumber, /^\d{4}-\d{2}\/000001$/);
    assert.equal(first.bill.billSequence, 1);

    const second = await billedFloor({ name: 'Same restaurant, second table' });
    assert.equal(second.bill.billSequence, 1, 'a different restaurant starts its own series');
  });

  it('does not reuse the number of a voided bill', async () => {
    /**
     * CLAUDE.md: bill numbers are sequential and never reused, not even after a
     * void. The replacement takes the next number and the voided one keeps its
     * own forever.
     */
    const { bill, order, tokens } = await billedFloor();

    await voidBill(tokens.MANAGER, bill.id, { reason: 'Wrong table billed' });

    const current = (await readOrder(tokens.CASHIER, order.id)).body.data;
    assert.equal(current.status, 'READY_TO_BILL', 'the order is billable again');

    const replacement = (
      await createBill(tokens.CASHIER, { orderId: order.id, version: current.version })
    ).body.data;

    assert.equal(replacement.billSequence, 2);
    assert.notEqual(replacement.billNumber, bill.billNumber);

    const voided = (await getBill(tokens.OWNER, bill.id)).body.data;
    assert.equal(voided.billNumber, bill.billNumber, 'the spent number stays on the voided bill');
  });
});

describe('discounts', () => {
  it('reduces taxable value, not just the payable total', async () => {
    const { bill, tokens } = await billedFloor();

    const response = await discount(tokens.MANAGER, bill.id, {
      kind: 'PERCENT',
      rateBps: 1000,
      reason: 'Regular customer',
    });

    assert.equal(response.status, 200);
    const discounted = response.body.data;

    // 10% of 240 is 24. Tax is then charged on 216, not on 240.
    assert.equal(discounted.discount.amountInPaise, 2400);
    assert.equal(discounted.taxBreakdown[0].taxableInPaise, 21600);
    assert.equal(discounted.totalTaxInPaise, 1080);

    // 24000 - 2400 + 1080 is 22680, which is not a whole rupee, so the bill
    // rounds up by 20 paise and records the adjustment.
    assert.equal(discounted.roundOffInPaise, 20);
    assert.equal(discounted.grandTotalInPaise, 22700);
    assert.equal(discounted.grandTotalInPaise % 100, 0);
  });

  it('is refused to a cashier', async () => {
    /**
     * The most deliberate permission in M3. BUILD-PLAN section 7 names
     * discounts as an event an owner loses money to, so the person who can
     * apply one is the person accountable for it.
     */
    const { bill, tokens } = await billedFloor();

    const response = await discount(tokens.CASHIER, bill.id, {
      kind: 'FLAT',
      valueInPaise: 5000,
      reason: 'Because I said so',
    });

    assert.equal(response.status, 403);
  });

  it('requires a reason, and refuses an empty one', async () => {
    const { bill, tokens } = await billedFloor();

    for (const reason of [undefined, '', '   ']) {
      const response = await discount(tokens.MANAGER, bill.id, {
        kind: 'FLAT',
        valueInPaise: 5000,
        reason,
      });
      assert.equal(response.status, 400, `reason ${JSON.stringify(reason)} should be refused`);
    }
  });

  it('refuses a flat discount carrying a rate, rather than ignoring it', async () => {
    const { bill, tokens } = await billedFloor();

    const response = await discount(tokens.MANAGER, bill.id, {
      kind: 'FLAT',
      valueInPaise: 5000,
      rateBps: 1000,
      reason: 'Both, somehow',
    });

    assert.equal(response.status, 400, 'a silently dropped rate looks like it worked');
  });

  it('refuses more than the bill is worth', async () => {
    const { bill, tokens } = await billedFloor();

    const response = await discount(tokens.MANAGER, bill.id, {
      kind: 'FLAT',
      valueInPaise: bill.subtotalInPaise + 1,
      reason: 'Too much',
    });

    assert.equal(response.status, 422);
  });

  it('writes an audit row with who, why and how much', async () => {
    const { bill, tokens } = await billedFloor();

    await discount(tokens.MANAGER, bill.id, {
      kind: 'FLAT',
      valueInPaise: 4000,
      reason: 'Service was slow',
    });

    const entries = await AuditLog.find({ restaurantId: bill.restaurantId });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, 'DISCOUNT_APPLIED');
    assert.equal(entries[0].entityLabel, bill.billNumber);
    assert.equal(entries[0].reason, 'Service was slow');
    assert.equal(entries[0].amountInPaise, 4000);
    assert.equal(entries[0].actorRole, ROLES.MANAGER);
  });

  it('is refused once money has been collected', async () => {
    const { bill, tokens } = await billedFloor();
    await pay(tokens.CASHIER, bill.id, { method: 'CASH', amountInPaise: bill.grandTotalInPaise });

    const response = await discount(tokens.MANAGER, bill.id, {
      kind: 'FLAT',
      valueInPaise: 1000,
      reason: 'Too late',
    });

    assert.equal(response.status, 422);
  });
});

describe('payments', () => {
  it('marks the bill paid when the payments reach the total', async () => {
    const { bill, tokens } = await billedFloor();

    const response = await pay(tokens.CASHIER, bill.id, {
      method: 'UPI',
      amountInPaise: bill.grandTotalInPaise,
      reference: '42XXXX9911',
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, 'PAID');
    assert.ok(response.body.data.paidAt);
  });

  it('accepts a split payment and only settles on the last one', async () => {
    const { bill, tokens } = await billedFloor();
    const half = Math.floor(bill.grandTotalInPaise / 2);

    const first = await pay(tokens.CASHIER, bill.id, { method: 'CASH', amountInPaise: half });
    assert.equal(first.body.data.status, 'UNPAID', 'half paid is not paid');

    const second = await pay(tokens.CASHIER, bill.id, {
      method: 'UPI',
      amountInPaise: bill.grandTotalInPaise - half,
    });
    assert.equal(second.body.data.status, 'PAID');
    assert.equal(second.body.data.payments.length, 2);
  });

  it('refuses an overpayment rather than storing it', async () => {
    // Change given in cash is not a payment, and storing it would break the
    // reconciliation every report downstream relies on.
    const { bill, tokens } = await billedFloor();

    const response = await pay(tokens.CASHIER, bill.id, {
      method: 'CASH',
      amountInPaise: bill.grandTotalInPaise + 100,
    });

    assert.equal(response.status, 422);
  });

  it('refuses a payment method that is not one of the four', async () => {
    const { bill, tokens } = await billedFloor();

    const response = await pay(tokens.CASHIER, bill.id, {
      method: 'CRYPTO',
      amountInPaise: 100,
    });

    assert.equal(response.status, 400);
  });
});

describe('voiding a bill', () => {
  it('keeps the bill, records who and why, and frees the order', async () => {
    const { bill, order, tokens } = await billedFloor();

    const response = await voidBill(tokens.OWNER, bill.id, { reason: 'Wrong table billed' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.isVoided, true);
    assert.equal(response.body.data.voidReason, 'Wrong table billed');

    // Never hard deleted.
    assert.ok(await Bill.findOne({ _id: bill.id, restaurantId: bill.restaurantId }));

    const reopened = (await readOrder(tokens.CASHIER, order.id)).body.data;
    assert.equal(reopened.status, 'READY_TO_BILL');
    assert.equal(reopened.billId, null);
  });

  it('is refused to a cashier', async () => {
    const { bill, tokens } = await billedFloor();
    const response = await voidBill(tokens.CASHIER, bill.id, { reason: 'Nope' });
    assert.equal(response.status, 403);
  });

  it('refuses to void twice', async () => {
    const { bill, tokens } = await billedFloor();
    await voidBill(tokens.MANAGER, bill.id, { reason: 'First' });

    const again = await voidBill(tokens.MANAGER, bill.id, { reason: 'Second' });
    assert.equal(again.status, 422);
    assert.equal(again.body.error.code, 'ENTRY_VOIDED');
  });

  it('writes an audit row carrying the amount voided', async () => {
    const { bill, tokens } = await billedFloor();
    await voidBill(tokens.MANAGER, bill.id, { reason: 'Duplicate' });

    const entries = await AuditLog.find({
      restaurantId: bill.restaurantId,
      action: 'BILL_VOIDED',
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].amountInPaise, bill.grandTotalInPaise);
  });
});

describe('voided bills leave every total', () => {
  it('is out of the list running total and the summary', async () => {
    /**
     * BUILD-PLAN section 8's soft delete leak. Forgetting once means a
     * cancelled sale shows up in the day's takings, and nobody notices because
     * the number still looks plausible.
     */
    const kept = await billedFloor();
    const { tokens } = kept;

    // A second bill on a second table, which is then voided.
    const secondTable = (
      await request('POST', '/api/v1/tables', { token: tokens.OWNER, body: { name: 'T2' } })
    ).body.data;
    const secondOrder = await readyToBillOrder({ ...kept, table: secondTable });
    const doomed = (
      await createBill(tokens.CASHIER, { orderId: secondOrder.id, version: secondOrder.version })
    ).body.data;
    await voidBill(tokens.MANAGER, doomed.id, { reason: 'Rung up twice' });

    const list = await request('GET', '/api/v1/bills', { token: tokens.CASHIER });
    assert.equal(list.body.meta.totals.billCount, 1, 'one live bill');
    assert.equal(list.body.meta.totals.voidedCount, 1);
    assert.equal(
      list.body.meta.totals.grandTotalInPaise,
      kept.bill.grandTotalInPaise,
      'the voided bill is not in the takings',
    );

    const { from } = list.body.meta;
    const summary = await request('GET', `/api/v1/bills/summary?from=${from}&to=${from}`, {
      token: tokens.OWNER,
    });
    assert.equal(summary.body.data.billCount, 1);
    assert.equal(summary.body.data.netInPaise, kept.bill.grandTotalInPaise);
    assert.equal(summary.body.data.voidedCount, 1);
    assert.equal(summary.body.data.voidedInPaise, doomed.grandTotalInPaise);
  });

  it('hides voided bills from the list unless asked for them', async () => {
    const { bill, tokens } = await billedFloor();
    await voidBill(tokens.MANAGER, bill.id, { reason: 'Gone' });

    const hidden = await request('GET', '/api/v1/bills', { token: tokens.CASHIER });
    assert.equal(hidden.body.data.length, 0);

    const shown = await request('GET', '/api/v1/bills?includeVoided=true', {
      token: tokens.CASHIER,
    });
    assert.equal(shown.body.data.length, 1);
  });
});

describe('the receipt', () => {
  it('survives a 60-character dish name without losing the amount column', async () => {
    /**
     * THE PRINTER TEST. BUILD-PLAN section 8: a thermal printer has a fixed
     * character width and a long dish name wraps and destroys the layout.
     *
     * Every line must be within the width, and the total must still be
     * readable and right-aligned.
     */
    const longName = 'Special Gujarati Thali With Extra Rotis And Chaas Deluxe Set';
    assert.ok(longName.length >= 58, `the name must be long enough to force a wrap at 48 columns, got ${longName.length}`);

    const floor = await seedFloor();
    const long = (await createMenuItem(floor.tokens.OWNER, { name: longName })).body.data;
    const order = await readyToBillOrder(floor, [{ menuItemId: long.id, quantity: 3 }]);
    const bill = (
      await createBill(floor.tokens.CASHIER, { orderId: order.id, version: order.version })
    ).body.data;

    for (const width of [32, 48]) {
      const response = await request(
        'GET',
        `/api/v1/bills/${bill.id}/receipt?width=${width}`,
        { token: floor.tokens.WAITER },
      );

      assert.equal(response.status, 200);
      const { text } = response.body.data;

      for (const line of text.split('\n')) {
        assert.ok(
          line.length <= width,
          `a ${line.length} character line overflows ${width} columns: ${JSON.stringify(line)}`,
        );
      }

      assert.match(text, /TOTAL/, 'the total survived the wrap');
      assert.match(text, /CGST/);
      assert.match(text, /SGST/);
      assert.ok(text.includes(bill.billNumber), 'the bill number is on the paper');
    }
  });

  it('refuses a width that is not a real paper size', async () => {
    const { bill, tokens } = await billedFloor();

    const response = await request('GET', `/api/v1/bills/${bill.id}/receipt?width=40`, {
      token: tokens.CASHIER,
    });

    assert.equal(response.status, 400, 'a wrong width prints as garbage; fail loudly instead');
  });
});

describe('bill permissions, every row of the contract table', () => {
  it('lets all six roles read a bill and its receipt', async () => {
    const { bill, tokens } = await billedFloor();

    for (const role of Object.values(ROLES)) {
      const read = await getBill(tokens[role], bill.id);
      assert.equal(read.status, 200, `${role} should read a bill`);

      const receipt = await request('GET', `/api/v1/bills/${bill.id}/receipt`, {
        token: tokens[role],
      });
      assert.equal(receipt.status, 200, `${role} should read a receipt`);
    }
  });

  it('refuses billing and payment to the kitchen, the storekeeper and a waiter', async () => {
    const { order, tokens } = await billableFloor();

    for (const role of [ROLES.WAITER, ROLES.KITCHEN, ROLES.STOREKEEPER]) {
      const response = await createBill(tokens[role], {
        orderId: order.id,
        version: order.version,
      });
      assert.equal(response.status, 403, `${role} should not create a bill`);
    }
  });

  it('refuses an unauthenticated caller', async () => {
    const { bill } = await billedFloor();
    const response = await request('GET', `/api/v1/bills/${bill.id}`);
    assert.equal(response.status, 401);
  });

  it('answers 404, not 403, for a bill in another restaurant', async () => {
    const a = await seedFloor({ name: 'Restaurant A' });
    const b = await billedFloor({ name: 'Restaurant B' });

    const response = await getBill(a.tokens.OWNER, b.bill.id);
    assert.equal(response.status, 404, 'a 403 would confirm the bill exists');
  });

  it('shows restaurant B none of restaurant A bills', async () => {
    await billedFloor({ name: 'Restaurant A' });
    const b = await seedFloor({ name: 'Restaurant B' });

    const list = await request('GET', '/api/v1/bills', { token: b.tokens.OWNER });
    assert.deepEqual(list.body.data, []);
    assert.equal(list.body.meta.totals.grandTotalInPaise, 0);
  });
});

describe('the tenant guard escape hatch, after M3', () => {
  it('adds no new use', () => {
    /**
     * The same tripwire as tests/menu.test.js, re-asserted here so M3 has its
     * own. It counts CALL SITES per file rather than filenames, because a
     * filename list cannot see a second hatch added inside a file already on
     * the list, which is how isEmailRegistered slipped in.
     *
     * M3 adds zero: every bill query is scoped(req), and the one Restaurant
     * lookup is by _id from a verified token, which is the documented tenancy
     * root pattern and needs no hatch.
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

  it('never lets a bill reach the database without a restaurantId filter', async () => {
    await assert.rejects(() => Bill.findOne({ billNumber: '2026-27/000001' }), {
      name: 'TenantFilterMissingError',
    });
  });
});

describe('the order is left consistent', () => {
  it('points the order at its bill, and only moves it to BILLED on payment', async () => {
    const { bill, order, tokens } = await billedFloor();

    const beforePayment = await Order.findOne({
      _id: order.id,
      restaurantId: bill.restaurantId,
    });
    assert.equal(String(beforePayment.billId), bill.id);
    assert.equal(beforePayment.status, 'READY_TO_BILL');

    await pay(tokens.CASHIER, bill.id, { method: 'CASH', amountInPaise: bill.grandTotalInPaise });

    const afterPayment = await Order.findOne({
      _id: order.id,
      restaurantId: bill.restaurantId,
    });
    assert.equal(afterPayment.status, 'BILLED');
    assert.equal(afterPayment.occupiesTable, false, 'the hook kept occupancy in step');
  });
});
