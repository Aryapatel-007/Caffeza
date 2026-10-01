/**
 * Order tests.
 *
 * Three of these are the reason M2 exists at all, and they are marked in the
 * describe names: the snapshot surviving a price change, two writes racing on
 * one version, and two waiters racing on one table.
 *
 * The rest is the ordinary work: a client never being trusted with a price, a
 * cross-restaurant read answering 404, and the discriminated union keeping
 * dine-in and takeaway from borrowing each other's fields.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ROLES } from '../config/roles.js';
import { Order } from '../models/Order.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import {
  addLines,
  createMenuItem,
  createTable,
  fireOrder,
  openOrder,
  readOrder,
  readyToBillOrder,
  seedFloor,
  seedTeam,
} from './helpers/m2Fixtures.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

before(async () => {
  await startTestDatabase();
  await startTestServer();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
});

// ---------------------------------------------------------------------------

describe('creating an order', () => {
  it('opens an empty dine-in order on a table', async () => {
    const { tokens, table } = await seedFloor();

    const response = await openOrder(tokens.WAITER, { tableId: table.id, guestCount: 4 });

    assert.equal(response.status, 201);
    const order = response.body.data;
    assert.equal(order.orderNumber, 1);
    assert.equal(order.orderType, 'DINE_IN');
    assert.equal(order.tableId, table.id);
    // Snapshot, so renaming the table later does not rewrite this order.
    assert.equal(order.tableName, 'T1');
    assert.equal(order.guestCount, 4);
    assert.equal(order.status, 'OPEN');
    assert.equal(order.version, 1);
    assert.deepEqual(order.lines, []);
    assert.deepEqual(order.totals, { subtotalInPaise: 0, lineCount: 0 });
  });

  it('numbers orders sequentially per restaurant', async () => {
    const a = await seedFloor({ name: 'A' });
    const b = await seedFloor({ name: 'B' });

    const first = await openOrder(a.tokens.WAITER, { tableId: a.table.id });
    await request('POST', `/api/v1/orders/${first.body.data.id}/cancel`, {
      token: a.tokens.OWNER,
      body: { version: 1, reasonCode: 'OTHER', note: 'test' },
    });
    const second = await openOrder(a.tokens.WAITER, { tableId: a.table.id });

    assert.equal(first.body.data.orderNumber, 1);
    assert.equal(second.body.data.orderNumber, 2);

    // A different restaurant starts its own sequence at 1.
    const other = await openOrder(b.tokens.WAITER, { tableId: b.table.id });
    assert.equal(other.body.data.orderNumber, 1);
  });

  it('opens a takeaway order with a customer and no table', async () => {
    const { tokens } = await seedFloor();

    const response = await openOrder(tokens.CASHIER, {
      orderType: 'TAKEAWAY',
      customerName: 'Mehul',
      customerPhone: '9876543210',
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.orderType, 'TAKEAWAY');
    assert.equal(response.body.data.tableId, null);
    assert.equal(response.body.data.customerName, 'Mehul');
  });

  it('refuses a dine-in order with no table, and a takeaway order with one', async () => {
    const { tokens, table } = await seedFloor();

    const noTable = await openOrder(tokens.WAITER, {});
    assert.equal(noTable.status, 400);

    const takeawayWithTable = await openOrder(tokens.WAITER, {
      orderType: 'TAKEAWAY',
      tableId: table.id,
    });
    assert.equal(takeawayWithTable.status, 400);
    assert.match(takeawayWithTable.body.error.fields.tableId, /no table/i);

    // The union refuses the other branch's fields rather than ignoring them.
    const dineInWithCustomer = await openOrder(tokens.WAITER, {
      tableId: table.id,
      customerName: 'Mehul',
    });
    assert.equal(dineInWithCustomer.status, 400);
  });

  it('refuses a table that does not exist, and one that is switched off', async () => {
    const { tokens, table } = await seedFloor();

    const missing = await openOrder(tokens.WAITER, { tableId: '000000000000000000000000' });
    assert.equal(missing.status, 404);

    await request('PATCH', `/api/v1/tables/${table.id}/status`, {
      token: tokens.OWNER,
      body: { isActive: false },
    });

    const off = await openOrder(tokens.WAITER, { tableId: table.id });
    assert.equal(off.status, 422);
    assert.equal(off.body.error.code, 'BUSINESS_RULE_VIOLATED');
  });

  it('opens an order with its first lines already on it', async () => {
    const { tokens, table, item } = await seedFloor();

    const response = await openOrder(tokens.WAITER, {
      tableId: table.id,
      lines: [{ menuItemId: item.id, quantity: 2 }],
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.lines.length, 1);
    assert.equal(response.body.data.lines[0].status, 'PENDING');
    assert.equal(response.body.data.totals.subtotalInPaise, 48000);
  });
});

describe('the two waiters problem, on one table', () => {
  it('lets exactly one of two concurrent orders onto a table', async () => {
    const { tokens, table } = await seedFloor();

    /**
     * Promise.all, not two sequential calls. Sequential would pass against a
     * check-then-write implementation, which is the thing this has to rule out.
     * The partial unique index is what makes the loser lose.
     */
    const [first, second] = await Promise.all([
      openOrder(tokens.WAITER, { tableId: table.id }),
      openOrder(tokens.CASHIER, { tableId: table.id }),
    ]);

    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [201, 409]);

    const winner = first.status === 201 ? first : second;
    const loser = first.status === 201 ? second : first;

    assert.equal(loser.body.error.code, 'TABLE_OCCUPIED');
    // The loser is handed the winner's id so the client can open that order
    // rather than showing a dead end.
    assert.equal(loser.body.error.existingOrderId, winner.body.data.id);
  });

  it('frees the table once the order is cancelled', async () => {
    const { tokens, table } = await seedFloor();

    const first = await openOrder(tokens.WAITER, { tableId: table.id });
    const blocked = await openOrder(tokens.WAITER, { tableId: table.id });
    assert.equal(blocked.status, 409);

    await request('POST', `/api/v1/orders/${first.body.data.id}/cancel`, {
      token: tokens.OWNER,
      body: { version: 1, reasonCode: 'OTHER', note: 'Customer left' },
    });

    const afterCancel = await openOrder(tokens.WAITER, { tableId: table.id });
    assert.equal(afterCancel.status, 201);
  });

  it('shows the table as occupied on the floor view, with a running total', async () => {
    const { tokens, table, item } = await seedFloor();

    const order = (
      await openOrder(tokens.WAITER, {
        tableId: table.id,
        lines: [{ menuItemId: item.id, quantity: 3 }],
      })
    ).body.data;

    const floor = await request('GET', '/api/v1/tables', { token: tokens.KITCHEN });
    const [seen] = floor.body.data;

    assert.equal(seen.occupancy.isOccupied, true);
    assert.equal(seen.occupancy.orderId, order.id);
    assert.equal(seen.occupancy.orderNumber, order.orderNumber);
    assert.equal(seen.occupancy.runningTotalInPaise, 72000);
  });

  it('refuses to deactivate a table with an order open on it', async () => {
    const { tokens, table } = await seedFloor();
    await openOrder(tokens.WAITER, { tableId: table.id });

    const response = await request('PATCH', `/api/v1/tables/${table.id}/status`, {
      token: tokens.OWNER,
      body: { isActive: false },
    });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'BUSINESS_RULE_VIOLATED');
  });
});

describe('table occupancy includes READY_TO_BILL', () => {
  it('shows a READY_TO_BILL table as occupied, not free', async () => {
    const floor = await seedFloor();
    const order = await readyToBillOrder(floor);
    assert.equal(order.status, 'READY_TO_BILL');

    const tables = await request('GET', '/api/v1/tables', { token: floor.tokens.OWNER });
    const [seen] = tables.body.data;

    assert.equal(seen.occupancy.isOccupied, true);
    assert.equal(seen.occupancy.orderId, order.id);
  });

  it('refuses a second order on a table that is only waiting to be billed', async () => {
    const floor = await seedFloor();
    const order = await readyToBillOrder(floor);

    const response = await openOrder(floor.tokens.WAITER, { tableId: floor.table.id });

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'TABLE_OCCUPIED');
    assert.equal(response.body.error.existingOrderId, order.id);
  });

  it('refuses to deactivate a table that is only waiting to be billed', async () => {
    const floor = await seedFloor();
    const order = await readyToBillOrder(floor);

    const response = await request('PATCH', `/api/v1/tables/${floor.table.id}/status`, {
      token: floor.tokens.OWNER,
      body: { isActive: false },
    });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'BUSINESS_RULE_VIOLATED');
    assert.match(response.body.error.message, new RegExp(`#${order.orderNumber}`));
  });

  it('frees the table once the order is billed', async () => {
    const floor = await seedFloor();
    const order = await readyToBillOrder(floor);

    /**
     * M3 does not exist yet, so BILLED is faked directly through the model
     * rather than through an endpoint that has not been built. The filter
     * still carries restaurantId, so this is an ordinary scoped write, not the
     * tenant guard's escape hatch.
     */
    await Order.updateOne(
      { _id: order.id, restaurantId: order.restaurantId },
      { $set: { status: 'BILLED' } },
    );

    const tables = await request('GET', '/api/v1/tables', { token: floor.tokens.OWNER });
    assert.equal(tables.body.data[0].occupancy.isOccupied, false);

    const reopened = await openOrder(floor.tokens.WAITER, { tableId: floor.table.id });
    assert.equal(reopened.status, 201);
  });

  it('answers wasPrepared only for the lines that reached the kitchen', async () => {
    /**
     * A whole-order cancel takes one wasPrepared for the whole order, because
     * a manager cancelling a walkout is answering "did the kitchen make any of
     * this", not auditing it dish by dish.
     *
     * That one answer must still only land on the lines it is true of. A line
     * that is still PENDING was never fired, so M4 never deducted anything for
     * it and there is nothing to give back. Writing "yes it was made" onto it
     * records something untrue, and it contradicts the single-line cancel,
     * where answering for a never-fired line is a 400.
     */
    const floor = await seedFloor();
    const { tokens, table, item } = floor;

    const opened = (await openOrder(tokens.WAITER, {
      tableId: table.id,
      lines: [{ menuItemId: item.id, quantity: 1 }],
    })).body.data;

    // Line one goes to the kitchen. Fire answers { kot, order }, not a bare order.
    const fired = (await fireOrder(tokens.WAITER, opened.id, opened.version)).body.data.order;

    // Line two is added afterwards and never fired, so it stays PENDING.
    const secondResponse = await addLines(tokens.WAITER, fired.id, {
      version: fired.version,
      lines: [{ menuItemId: item.id, quantity: 1 }],
    });
    assert.equal(secondResponse.status, 200, JSON.stringify(secondResponse.body));
    const withSecond = secondResponse.body.data;

    const [firedLine, pendingLine] = withSecond.lines;
    assert.equal(firedLine.status, 'FIRED');
    assert.equal(pendingLine.status, 'PENDING');

    const cancelled = (
      await request('POST', `/api/v1/orders/${withSecond.id}/cancel`, {
        token: tokens.OWNER,
        body: { version: withSecond.version, reasonCode: 'OTHER', note: 'Walked out', wasPrepared: true },
      })
    ).body.data;

    assert.equal(cancelled.status, 'CANCELLED');

    const after = Object.fromEntries(cancelled.lines.map((line) => [line.id, line]));
    assert.equal(after[firedLine.id].wasPrepared, true, 'the fired line was made');
    assert.equal(
      after[pendingLine.id].wasPrepared,
      null,
      'the never-fired line has nothing to answer, so it keeps null',
    );

    // Both are still cancelled, and both keep their reason.
    assert.equal(after[pendingLine.id].status, 'CANCELLED');
    assert.equal(after[pendingLine.id].cancelReason, 'Walked out');
  });

  it('frees the table once the order is cancelled from READY_TO_BILL', async () => {
    const floor = await seedFloor();
    const order = await readyToBillOrder(floor);

    // wasPrepared is required: the order's only line was SERVED by
    // readyToBillOrder, and a served line counts as having reached the
    // kitchen just as much as a fired one.
    const cancelled = await request('POST', `/api/v1/orders/${order.id}/cancel`, {
      token: floor.tokens.OWNER,
      body: { version: order.version, reasonCode: 'OTHER', note: 'Walked out without paying', wasPrepared: true },
    });
    assert.equal(cancelled.status, 200);

    const tables = await request('GET', '/api/v1/tables', { token: floor.tokens.OWNER });
    assert.equal(tables.body.data[0].occupancy.isOccupied, false);
  });
});

describe('the snapshot, which is the whole point of this module', () => {
  it('keeps the original price after the menu price changes', async () => {
    const { tokens, table, item } = await seedFloor();

    const order = (
      await openOrder(tokens.WAITER, {
        tableId: table.id,
        lines: [{ menuItemId: item.id, quantity: 2 }],
      })
    ).body.data;

    // The owner raises the price at 8pm, after the 7pm order was taken.
    const raised = await request('PATCH', `/api/v1/menu-items/${item.id}`, {
      token: tokens.OWNER,
      body: { priceInPaise: 30000, taxRateBps: 1800 },
    });
    assert.equal(raised.status, 200);

    const reread = await readOrder(tokens.WAITER, order.id);
    const [line] = reread.body.data.lines;

    assert.equal(line.unitPriceInPaise, 24000, 'the 7pm price must survive');
    assert.equal(line.taxRateBps, 500, 'and so must the 7pm tax rate');
    assert.equal(line.lineTotalInPaise, 48000);
    assert.equal(reread.body.data.totals.subtotalInPaise, 48000);
  });

  it('keeps the original name after the dish is renamed and withdrawn', async () => {
    const { tokens, table, item } = await seedFloor();

    const order = (
      await openOrder(tokens.WAITER, {
        tableId: table.id,
        lines: [{ menuItemId: item.id, quantity: 1 }],
      })
    ).body.data;

    await request('PATCH', `/api/v1/menu-items/${item.id}`, {
      token: tokens.OWNER,
      body: { name: 'Paneer Tikka Masala' },
    });
    await request('PATCH', `/api/v1/menu-items/${item.id}/active`, {
      token: tokens.OWNER,
      body: { isActive: false },
    });

    const reread = await readOrder(tokens.WAITER, order.id);
    assert.equal(reread.body.data.lines[0].itemName, 'Paneer Tikka');
  });

  it('copies the variant price, not the base price, and keeps the variant id', async () => {
    const { tokens, table } = await seedFloor();

    const item = (
      await createMenuItem(tokens.OWNER, {
        name: 'Dal Tadka',
        priceInPaise: 24000,
        variants: [
          { name: 'Half', priceInPaise: 14000 },
          { name: 'Full', priceInPaise: 24000 },
        ],
      })
    ).body.data;

    const half = item.variants.find((variant) => variant.name === 'Half');

    const order = (
      await openOrder(tokens.WAITER, {
        tableId: table.id,
        lines: [{ menuItemId: item.id, variantId: half.id, quantity: 2 }],
      })
    ).body.data;

    const [line] = order.lines;
    // Absolute, not a delta from the item's base price.
    assert.equal(line.unitPriceInPaise, 14000);
    assert.equal(line.variantName, 'Half');
    // M4 attaches recipes to this id, so it has to survive onto the line.
    assert.equal(line.variantId, half.id);
    assert.equal(line.lineTotalInPaise, 28000);
  });

  it('copies add-on names and prices into the line total', async () => {
    const { tokens, table } = await seedFloor();

    const item = (
      await createMenuItem(tokens.OWNER, {
        name: 'Pav Bhaji',
        priceInPaise: 12000,
        addOns: [{ name: 'Extra butter', priceInPaise: 3000 }],
      })
    ).body.data;

    const order = (
      await openOrder(tokens.WAITER, {
        tableId: table.id,
        lines: [{ menuItemId: item.id, quantity: 2, addOnIds: [item.addOns[0].id] }],
      })
    ).body.data;

    const [line] = order.lines;
    assert.equal(line.addOns.length, 1);
    assert.equal(line.addOns[0].name, 'Extra butter');
    assert.equal(line.addOns[0].priceInPaise, 3000);
    // (12000 + 3000) * 2
    assert.equal(line.lineTotalInPaise, 30000);
  });

  it('refuses a line that tries to send its own price', async () => {
    const { tokens, table, item } = await seedFloor();

    for (const field of ['unitPriceInPaise', 'taxRateBps', 'itemName']) {
      const response = await openOrder(tokens.WAITER, {
        tableId: table.id,
        lines: [{ menuItemId: item.id, quantity: 1, [field]: 1 }],
      });

      assert.equal(response.status, 400, `${field} should be refused, not stripped`);
      assert.equal(response.body.error.code, 'VALIDATION_FAILED');
    }
  });

  it('refuses an unavailable dish, an inactive one, and one from another restaurant', async () => {
    const a = await seedFloor({ name: 'A' });
    const b = await seedFloor({ name: 'B' });

    const order = (await openOrder(a.tokens.WAITER, { tableId: a.table.id })).body.data;

    await request('PATCH', `/api/v1/menu-items/${a.item.id}/availability`, {
      token: a.tokens.KITCHEN,
      body: { isAvailable: false },
    });

    const outOfStock = await addLines(a.tokens.WAITER, order.id, {
      version: order.version,
      lines: [{ menuItemId: a.item.id, quantity: 1 }],
    });
    assert.equal(outOfStock.status, 422);
    assert.equal(outOfStock.body.error.code, 'BUSINESS_RULE_VIOLATED');

    // Another restaurant's dish is simply not on this menu, same answer.
    const crossTenant = await addLines(a.tokens.WAITER, order.id, {
      version: order.version,
      lines: [{ menuItemId: b.item.id, quantity: 1 }],
    });
    assert.equal(crossTenant.status, 422);
  });

  it('refuses a variant or add-on that is not on the item', async () => {
    const { tokens, table, item } = await seedFloor();
    const order = (await openOrder(tokens.WAITER, { tableId: table.id })).body.data;

    const badVariant = await addLines(tokens.WAITER, order.id, {
      version: order.version,
      lines: [{ menuItemId: item.id, variantId: '000000000000000000000000', quantity: 1 }],
    });
    assert.equal(badVariant.status, 422);

    const badAddOn = await addLines(tokens.WAITER, order.id, {
      version: order.version,
      lines: [{ menuItemId: item.id, quantity: 1, addOnIds: ['000000000000000000000000'] }],
    });
    assert.equal(badAddOn.status, 422);
  });
});

describe('optimistic concurrency', () => {
  it('rejects the second of two writes that read the same version', async () => {
    const { tokens, table, item } = await seedFloor();
    const order = (await openOrder(tokens.WAITER, { tableId: table.id })).body.data;

    const body = { version: order.version, lines: [{ menuItemId: item.id, quantity: 1 }] };

    const first = await addLines(tokens.WAITER, order.id, body);
    assert.equal(first.status, 200);
    assert.equal(first.body.data.version, order.version + 1);

    // The same version again, as a second waiter holding a stale copy would.
    const second = await addLines(tokens.CASHIER, order.id, body);

    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'VERSION_CONFLICT');
    assert.equal(second.body.error.currentVersion, order.version + 1);

    // The loser's line was not written. One line on the order, not two.
    const reread = await readOrder(tokens.WAITER, order.id);
    assert.equal(reread.body.data.lines.length, 1);
  });

  it('lets exactly one of two truly concurrent writes land', async () => {
    const { tokens, table, item } = await seedFloor();
    const order = (await openOrder(tokens.WAITER, { tableId: table.id })).body.data;

    const body = { version: order.version, lines: [{ menuItemId: item.id, quantity: 1 }] };

    const [first, second] = await Promise.all([
      addLines(tokens.WAITER, order.id, body),
      addLines(tokens.CASHIER, order.id, body),
    ]);

    assert.deepEqual([first.status, second.status].sort(), [200, 409]);

    const reread = await readOrder(tokens.WAITER, order.id);
    assert.equal(reread.body.data.lines.length, 1);
    assert.equal(reread.body.data.version, 2);
  });

  it('answers 404 rather than 409 when the order does not exist', async () => {
    const { tokens, item } = await seedFloor();

    const response = await addLines(tokens.WAITER, '000000000000000000000000', {
      version: 1,
      lines: [{ menuItemId: item.id, quantity: 1 }],
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'NOT_FOUND');
  });

  it('requires a version on every write', async () => {
    const { tokens, table, item } = await seedFloor();
    const order = (await openOrder(tokens.WAITER, { tableId: table.id })).body.data;

    const response = await addLines(tokens.WAITER, order.id, {
      lines: [{ menuItemId: item.id, quantity: 1 }],
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error.fields.version, /version/i);
  });
});

describe('reading orders', () => {
  it('filters by a comma-separated status list', async () => {
    const { tokens, table } = await seedFloor();
    const second = (await createTable(tokens.OWNER, { name: 'T2' })).body.data;

    const open = (await openOrder(tokens.WAITER, { tableId: table.id })).body.data;
    const cancelled = (await openOrder(tokens.WAITER, { tableId: second.id })).body.data;

    await request('POST', `/api/v1/orders/${cancelled.id}/cancel`, {
      token: tokens.OWNER,
      body: { version: 1, reasonCode: 'OTHER', note: 'Customer left' },
    });

    const onlyOpen = await request('GET', '/api/v1/orders?status=OPEN', { token: tokens.WAITER });
    assert.deepEqual(onlyOpen.body.data.map((order) => order.id), [open.id]);

    const both = await request('GET', '/api/v1/orders?status=OPEN,CANCELLED', {
      token: tokens.WAITER,
    });
    assert.equal(both.body.meta.total, 2);
  });

  it('refuses a status that is not one of the four', async () => {
    const { tokens } = await seedFloor();

    const response = await request('GET', '/api/v1/orders?status=OPEN,NONSENSE', {
      token: tokens.WAITER,
    });

    assert.equal(response.status, 400);
  });

  it('answers 404, not 403, for an order in another restaurant', async () => {
    const a = await seedFloor({ name: 'A' });
    const b = await seedFloor({ name: 'B' });

    const order = (await openOrder(a.tokens.WAITER, { tableId: a.table.id })).body.data;

    const response = await readOrder(b.tokens.OWNER, order.id);

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'NOT_FOUND');
    assert.equal(JSON.stringify(response.body).includes(order.id), false);
  });

  it('shows restaurant B none of restaurant A orders', async () => {
    const a = await seedFloor({ name: 'A' });
    const b = await seedFloor({ name: 'B' });

    await openOrder(a.tokens.WAITER, { tableId: a.table.id });

    const response = await request('GET', '/api/v1/orders', { token: b.tokens.OWNER });
    assert.deepEqual(response.body.data, []);
    assert.equal(response.body.meta.total, 0);
  });
});

describe('order permissions', () => {
  it('lets the four floor roles open an order and refuses the kitchen', async () => {
    const { tokens, table } = await seedFloor();
    const tables = { OWNER: table };
    for (const role of [ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER]) {
      tables[role] = (await createTable(tokens.OWNER, { name: `T-${role}` })).body.data;
    }

    for (const role of [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER]) {
      const response = await openOrder(tokens[role], { tableId: tables[role].id });
      assert.equal(response.status, 201, `${role} should open an order`);
    }

    for (const role of [ROLES.KITCHEN, ROLES.STOREKEEPER]) {
      const blocked = await createTable(tokens.OWNER, { name: `X-${role}` });
      const response = await openOrder(tokens[role], { tableId: blocked.body.data.id });
      assert.equal(response.status, 403, `${role} should not open an order`);
      assert.equal(response.body.error.code, 'FORBIDDEN');
    }
  });

  it('lets the kitchen read orders but not add a line to one', async () => {
    const { tokens, table, item } = await seedFloor();
    const order = (await openOrder(tokens.WAITER, { tableId: table.id })).body.data;

    const read = await readOrder(tokens.KITCHEN, order.id);
    assert.equal(read.status, 200);

    const write = await addLines(tokens.KITCHEN, order.id, {
      version: order.version,
      lines: [{ menuItemId: item.id, quantity: 1 }],
    });
    assert.equal(write.status, 403);
  });

  it('refuses an unauthenticated caller', async () => {
    const response = await request('GET', '/api/v1/orders');
    assert.equal(response.status, 401);
  });
});

describe('editing a line', () => {
  it('changes quantity and notes, and nothing else', async () => {
    const { tokens, table, item } = await seedFloor();
    const order = (
      await openOrder(tokens.WAITER, {
        tableId: table.id,
        lines: [{ menuItemId: item.id, quantity: 1 }],
      })
    ).body.data;

    const response = await request(
      'PATCH',
      `/api/v1/orders/${order.id}/lines/${order.lines[0].id}`,
      { token: tokens.WAITER, body: { version: order.version, quantity: 3, notes: 'no onion' } },
    );

    assert.equal(response.status, 200);
    const [line] = response.body.data.lines;
    assert.equal(line.quantity, 3);
    assert.equal(line.notes, 'no onion');
    // The snapshot is untouched by an edit.
    assert.equal(line.unitPriceInPaise, 24000);
    assert.equal(response.body.data.totals.subtotalInPaise, 72000);
  });

  it('refuses a body that tries to reprice the line', async () => {
    const { tokens, table, item } = await seedFloor();
    const order = (
      await openOrder(tokens.WAITER, {
        tableId: table.id,
        lines: [{ menuItemId: item.id, quantity: 1 }],
      })
    ).body.data;

    const response = await request(
      'PATCH',
      `/api/v1/orders/${order.id}/lines/${order.lines[0].id}`,
      { token: tokens.WAITER, body: { version: order.version, unitPriceInPaise: 1 } },
    );

    assert.equal(response.status, 400);
  });

  it('answers 404 for a line that is not on this order', async () => {
    const { tokens, table } = await seedFloor();
    const order = (await openOrder(tokens.WAITER, { tableId: table.id })).body.data;

    const response = await request(
      'PATCH',
      `/api/v1/orders/${order.id}/lines/000000000000000000000000`,
      { token: tokens.WAITER, body: { version: order.version, quantity: 2 } },
    );

    assert.equal(response.status, 404);
  });
});

describe('cancelling a line', () => {
  const cancelLine = (token, orderId, lineId, body) =>
    request('POST', `/api/v1/orders/${orderId}/lines/${lineId}/cancel`, { token, body });

  async function orderWithOneLine() {
    const floor = await seedFloor();
    const order = (
      await openOrder(floor.tokens.WAITER, {
        tableId: floor.table.id,
        lines: [{ menuItemId: floor.item.id, quantity: 2 }],
      })
    ).body.data;
    return { ...floor, order };
  }

  it('keeps the line in the array, with who cancelled it and why', async () => {
    const { tokens, order } = await orderWithOneLine();

    const response = await cancelLine(tokens.WAITER, order.id, order.lines[0].id, {
      version: order.version,
      reasonCode: 'OTHER', note: 'Customer changed their mind',
    });

    assert.equal(response.status, 200);
    const [line] = response.body.data.lines;

    // Never removed. A cancelled line is evidence.
    assert.equal(response.body.data.lines.length, 1);
    assert.equal(line.status, 'CANCELLED');
    assert.equal(line.cancelReason, 'Customer changed their mind');
    assert.notEqual(line.cancelledAt, null);
    // The snapshot survives cancellation too.
    assert.equal(line.unitPriceInPaise, 24000);

    // It stops counting towards the total.
    assert.deepEqual(response.body.data.totals, { subtotalInPaise: 0, lineCount: 0 });
  });

  it('refuses wasPrepared on a line that never went to the kitchen', async () => {
    const { tokens, order } = await orderWithOneLine();

    const response = await cancelLine(tokens.WAITER, order.id, order.lines[0].id, {
      version: order.version,
      reasonCode: 'OTHER', note: 'Changed their mind',
      wasPrepared: false,
    });

    // 400, not 422: the question does not apply, so answering it is malformed.
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_FAILED');
  });

  it('requires a reason', async () => {
    const { tokens, order } = await orderWithOneLine();

    const response = await cancelLine(tokens.WAITER, order.id, order.lines[0].id, {
      version: order.version,
    });

    assert.equal(response.status, 400);
  });

  it('leaves an order whose lines were all cancelled OPEN, not ready to bill', async () => {
    const { tokens, order } = await orderWithOneLine();

    const response = await cancelLine(tokens.WAITER, order.id, order.lines[0].id, {
      version: order.version,
      reasonCode: 'OTHER', note: 'Changed their mind',
    });

    // A zero-value order must not drift into the cashier's queue by itself.
    // Someone cancels it deliberately.
    assert.equal(response.body.data.status, 'OPEN');
  });

  it('refuses to serve a line the kitchen has not marked ready', async () => {
    const { tokens, order } = await orderWithOneLine();

    const response = await request(
      'PATCH',
      `/api/v1/orders/${order.id}/lines/${order.lines[0].id}/served`,
      { token: tokens.WAITER, body: { version: order.version } },
    );

    assert.equal(response.status, 422);
  });
});

describe('cancelling a whole order', () => {
  it('is refused for a waiter and a cashier, and allowed for a manager', async () => {
    const { tokens, table } = await seedFloor();

    for (const role of [ROLES.WAITER, ROLES.CASHIER, ROLES.KITCHEN, ROLES.STOREKEEPER]) {
      const order = (await openOrder(tokens.WAITER, { tableId: table.id })).body.data;

      const response = await request(`POST`, `/api/v1/orders/${order.id}/cancel`, {
        token: tokens[role],
        body: { version: order.version, reasonCode: 'OTHER', note: 'Customer left' },
      });

      assert.equal(response.status, 403, `${role} must not cancel a whole order`);
      assert.equal(response.body.error.code, 'FORBIDDEN');

      // Clear the table for the next role.
      await request('POST', `/api/v1/orders/${order.id}/cancel`, {
        token: tokens.OWNER,
        body: { version: order.version, reasonCode: 'OTHER', note: 'cleanup' },
      });
    }
  });

  it('cancels every live line with it and frees the table', async () => {
    const { tokens, table, item } = await seedFloor();
    const order = (
      await openOrder(tokens.WAITER, {
        tableId: table.id,
        lines: [
          { menuItemId: item.id, quantity: 1 },
          { menuItemId: item.id, quantity: 2 },
        ],
      })
    ).body.data;

    const response = await request('POST', `/api/v1/orders/${order.id}/cancel`, {
      token: tokens.MANAGER,
      body: { version: order.version, reasonCode: 'OTHER', note: 'Customer left' },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, 'CANCELLED');
    assert.equal(response.body.data.isCancelled, true);
    assert.equal(response.body.data.cancelReason, 'Customer left');
    assert.equal(response.body.data.lines.length, 2);
    assert.equal(
      response.body.data.lines.every((line) => line.status === 'CANCELLED'),
      true,
    );

    const floor = await request('GET', '/api/v1/tables', { token: tokens.OWNER });
    assert.equal(floor.body.data[0].occupancy.isOccupied, false);
  });

  it('refuses to cancel an order twice', async () => {
    const { tokens, table } = await seedFloor();
    const order = (await openOrder(tokens.WAITER, { tableId: table.id })).body.data;

    const first = await request('POST', `/api/v1/orders/${order.id}/cancel`, {
      token: tokens.OWNER,
      body: { version: order.version, reasonCode: 'OTHER', note: 'Customer left' },
    });
    assert.equal(first.status, 200);

    const second = await request('POST', `/api/v1/orders/${order.id}/cancel`, {
      token: tokens.OWNER,
      body: { version: first.body.data.version, reasonCode: 'OTHER', note: 'again' },
    });
    assert.equal(second.status, 422);
  });

  it('refuses to add a line to a cancelled order', async () => {
    const { tokens, table, item } = await seedFloor();
    const order = (await openOrder(tokens.WAITER, { tableId: table.id })).body.data;

    const cancelled = await request('POST', `/api/v1/orders/${order.id}/cancel`, {
      token: tokens.OWNER,
      body: { version: order.version, reasonCode: 'OTHER', note: 'Customer left' },
    });

    const response = await addLines(tokens.WAITER, order.id, {
      version: cancelled.body.data.version,
      lines: [{ menuItemId: item.id, quantity: 1 }],
    });

    assert.equal(response.status, 422);
  });
});

describe('moving an order to another table', () => {
  it('moves it and re-snapshots the table name', async () => {
    const { tokens, table } = await seedFloor();
    const destination = (await createTable(tokens.OWNER, { name: 'T9' })).body.data;
    const order = (await openOrder(tokens.WAITER, { tableId: table.id })).body.data;

    const response = await request('PATCH', `/api/v1/orders/${order.id}/table`, {
      token: tokens.WAITER,
      body: { version: order.version, tableId: destination.id },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.tableId, destination.id);
    assert.equal(response.body.data.tableName, 'T9');

    // The original table is free again.
    const floor = await request('GET', '/api/v1/tables', { token: tokens.OWNER });
    const byName = Object.fromEntries(floor.body.data.map((row) => [row.name, row.occupancy]));
    assert.equal(byName.T1.isOccupied, false);
    assert.equal(byName.T9.isOccupied, true);
  });

  it('refuses a destination that already has an order open on it', async () => {
    const { tokens, table } = await seedFloor();
    const destination = (await createTable(tokens.OWNER, { name: 'T9' })).body.data;

    const order = (await openOrder(tokens.WAITER, { tableId: table.id })).body.data;
    await openOrder(tokens.WAITER, { tableId: destination.id });

    const response = await request('PATCH', `/api/v1/orders/${order.id}/table`, {
      token: tokens.WAITER,
      body: { version: order.version, tableId: destination.id },
    });

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'TABLE_OCCUPIED');
  });

  it('refuses to move a takeaway order', async () => {
    const { tokens, table } = await seedFloor();
    const order = (await openOrder(tokens.CASHIER, { orderType: 'TAKEAWAY' })).body.data;

    const response = await request('PATCH', `/api/v1/orders/${order.id}/table`, {
      token: tokens.CASHIER,
      body: { version: order.version, tableId: table.id },
    });

    assert.equal(response.status, 422);
  });
});

describe('the tenant guard', () => {
  it('strips a restaurantId sent in the body, silently', async () => {
    const a = await seedFloor({ name: 'A' });
    const b = await seedTeam({ name: 'B' });

    const response = await openOrder(a.tokens.WAITER, {
      tableId: a.table.id,
      restaurantId: String(b.restaurant._id),
    });

    // Stripped, not errored on: a 400 would confirm restaurantId is the lever.
    assert.equal(response.status, 201);
    assert.equal(response.body.data.restaurantId, String(a.restaurant._id));
  });
});

describe('the category is frozen onto the line (P03)', () => {
  it('stores the item category id and name when a line is added', async () => {
    const { tokens, table } = await seedFloor();
    const category = (
      await request('POST', '/api/v1/categories', { token: tokens.OWNER, body: { name: 'Pizzas' } })
    ).body.data;
    const pizza = (await createMenuItem(tokens.OWNER, { name: 'Margherita', categoryId: category.id }))
      .body.data;

    const opened = (await openOrder(tokens.WAITER, { tableId: table.id })).body.data;
    const added = await addLines(tokens.WAITER, opened.id, {
      version: opened.version,
      lines: [{ menuItemId: pizza.id, quantity: 1 }],
    });

    assert.equal(added.status, 200);
    assert.equal(added.body.data.lines[0].categoryId, category.id);
    assert.equal(added.body.data.lines[0].categoryName, 'Pizzas');
  });

  it('refuses a client sending a category on a line', async () => {
    const { tokens, table, item } = await seedFloor();
    const opened = (await openOrder(tokens.WAITER, { tableId: table.id })).body.data;

    const response = await addLines(tokens.WAITER, opened.id, {
      version: opened.version,
      lines: [{ menuItemId: item.id, quantity: 1, categoryName: 'Free food' }],
    });
    assert.equal(response.status, 400);
  });
});
