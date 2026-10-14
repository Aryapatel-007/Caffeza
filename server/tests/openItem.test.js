/**
 * Open item: a dish whose name and price staff type when ordering. P46,
 * API-CONTRACT P46.
 *
 * The typed name and price are frozen on the line and reach the kitchen, the
 * bill and R11 as any dish's would, at the open item's own GST rate. A guest
 * can never order one.
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { after, before, describe, it } from 'node:test';

import { ALL_MODELS } from '../models/index.js';
import { buildLineSnapshots } from '../services/orderService.js';
import { fireOrder, openOrder, readOrder, seedFloor } from './helpers/m2Fixtures.js';
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

/** A floor with an open item at 5%, in the floor dish's category. */
async function withOpenItem() {
  const floor = await seedFloor();
  const open = ok(
    await request('POST', '/api/v1/menu-items', {
      token: floor.tokens.OWNER,
      body: { categoryId: floor.item.categoryId, name: 'Open item', priceInPaise: 0, taxRateBps: 500, isOpenItem: true },
    }),
    'open item',
  );
  assert.equal(open.isOpenItem, true);
  return { floor, open };
}

const openLine = (open, name, priceInPaise, quantity = 1) => ({ menuItemId: open.id, quantity, openItem: { name, priceInPaise } });

describe('an open item on an order', () => {
  it('freezes the typed name and price, at its own GST, and a captain adds it with no PIN', async () => {
    const { floor, open } = await withOpenItem();
    const order = ok(await openOrder(floor.tokens.WAITER, { tableId: floor.table.id, lines: [openLine(open, 'Extra chutney', 2000, 2)] }), 'captain orders');
    const [line] = order.lines;
    assert.equal(line.itemName, 'Extra chutney');
    assert.equal(line.unitPriceInPaise, 2000);
    assert.equal(line.quantity, 2);
    assert.equal(line.taxRateBps, 500);
    assert.equal(line.isOpenItem, true);
    assert.equal(line.lineTotalInPaise, 4000);
  });

  it('refuses an open item without a name and price, with sizes or extras, and a normal dish with them', async () => {
    const { floor, open } = await withOpenItem();
    const refused = (response, message) => {
      assert.equal(response.status, 422, JSON.stringify(response.body));
      assert.equal(response.body.error.message, message);
    };
    refused(await openOrder(floor.tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: open.id, quantity: 1 }] }), "Type the dish's name and price.");
    refused(
      await openOrder(floor.tokens.WAITER, { tableId: floor.table.id, lines: [{ ...openLine(open, 'Papad', 1500), addOnIds: [String(new mongoose.Types.ObjectId())] }] }),
      'An open item has no sizes or extras.',
    );
    refused(
      await openOrder(floor.tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: floor.item.id, quantity: 1, openItem: { name: 'Cheap', priceInPaise: 100 } }] }),
      'Only an open item takes a typed name and price.',
    );
    const zero = await openOrder(floor.tokens.WAITER, { tableId: floor.table.id, lines: [openLine(open, 'Free', 0)] });
    assert.equal(zero.status, 400, 'a price must be more than zero');
    const blank = await openOrder(floor.tokens.WAITER, { tableId: floor.table.id, lines: [openLine(open, '   ', 1000)] });
    assert.equal(blank.status, 400, 'a name is required');
  });

  it('is never ordered by a guest: a public quote is told it is not on the menu', async () => {
    const { floor, open } = await withOpenItem();
    const guest = { restaurantId: String(floor.restaurant._id), branchId: String(floor.branch._id), user: undefined };
    await assert.rejects(
      () => buildLineSnapshots(guest, [openLine(open, 'Anything', 100)]),
      (error) => error.message === 'One of those dishes is not on this menu any more.',
    );
  });
});

describe('an open item after it is ordered', () => {
  it('reaches the kitchen and the bill under its typed name, two typed names stay two rows, and R11 keeps them apart', async () => {
    const { floor, open } = await withOpenItem();
    const { tokens } = floor;
    let order = ok(
      await openOrder(tokens.WAITER, { tableId: floor.table.id, lines: [openLine(open, 'Extra chutney', 2000, 2), openLine(open, 'Masala papad', 1500)] }),
      'order',
    );
    const fired = ok(await fireOrder(tokens.WAITER, order.id, order.version), 'fire');
    assert.deepEqual(fired.kot.lines.map((line) => line.itemName).sort(), ['Extra chutney', 'Masala papad']);
    ok(await request('PATCH', `/api/v1/kots/${fired.kot.id}/ready`, { token: tokens.KITCHEN }), 'ready');
    order = ok(await readOrder(tokens.WAITER, order.id), 'read');
    for (const line of order.lines.filter((entry) => entry.status === 'READY')) {
      order = ok(await request('PATCH', `/api/v1/orders/${order.id}/lines/${line.id}/served`, { token: tokens.WAITER, body: { version: order.version } }), 'serve');
    }
    order = ok(await readOrder(tokens.WAITER, order.id), 'read');

    const bill = ok(await request('POST', '/api/v1/bills', { token: tokens.CASHIER, body: { orderId: order.id, version: order.version } }), 'bill');
    assert.equal(bill.subtotalInPaise, 5500);
    assert.ok(bill.lines.every((line) => line.isOpenItem === true));
    assert.deepEqual(bill.itemRows.map((row) => row.itemName).sort(), ['Extra chutney', 'Masala papad']);

    const categoryName = bill.lines[0].categoryName;
    const r11 = ok(
      await request('GET', `/api/v1/reports/v2/menu?from=${bill.businessDate}&to=${bill.businessDate}&categoryName=${encodeURIComponent(categoryName)}`, { token: tokens.OWNER }),
      'R11',
    );
    const names = r11.rows.map((row) => row.name ?? row.itemName ?? row.item).sort();
    assert.deepEqual(names, ['Extra chutney', 'Masala papad']);
  });
});
