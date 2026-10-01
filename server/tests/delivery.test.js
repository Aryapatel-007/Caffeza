/**
 * Delivery and platform orders. M17, built in P06.
 *
 * A Zomato or Swiggy order is typed in by hand, carries its platform and the
 * platform's own order number, and is billed at 0% because the platform pays
 * the GST under section 9(5). B07 and B08 are the golden day's two.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import * as clientPlatforms from '../../client/src/features/orders/platforms.js';
import { PLATFORMS } from '../config/platforms.js';
import { Bill } from '../models/Bill.js';
import { Counter } from '../models/Counter.js';
import { Order } from '../models/Order.js';
import { createMenuItem, readOrder, seedFloor } from './helpers/m2Fixtures.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

before(async () => {
  await startTestDatabase();
  await startTestServer();
  await Order.init();
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

const openDelivery = (token, body) =>
  request('POST', '/api/v1/orders', { token, body: { orderType: 'DELIVERY', ...body } });

const swiggy = (orderId = '249377796192385') => ({ code: 'SWIGGY', orderId });

/** Fires, marks ready and serves every line, so the order is billable. */
async function serveEverything(tokens, opened) {
  const fired = (
    await request('POST', `/api/v1/orders/${opened.id}/fire`, {
      token: tokens.CASHIER,
      body: { version: opened.version },
    })
  ).body.data;
  for (const kot of fired.kots) {
    await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: tokens.KITCHEN });
  }
  let current = (await readOrder(tokens.CASHIER, opened.id)).body.data;
  for (const line of current.lines) {
    current = (
      await request('PATCH', `/api/v1/orders/${opened.id}/lines/${line.id}/served`, {
        token: tokens.CASHIER,
        body: { version: current.version },
      })
    ).body.data;
  }
  return { order: current, kots: fired.kots };
}

async function bill(tokens, order) {
  const response = await request('POST', '/api/v1/bills', {
    token: tokens.CASHIER,
    body: { orderId: order.id, version: order.version },
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}

/** The golden day's delivery dishes, at their exact prices and 5% GST. */
async function deliveryMenu(tokens) {
  const make = async (name, priceInPaise) =>
    (await createMenuItem(tokens.OWNER, { name, priceInPaise, taxRateBps: 500 })).body.data.id;
  return {
    pizza: await make('Half & Half Pizza', 38000),
    shake: await make('Ferrero Hazelnut Shake', 33000),
    latte: await make('Caffe Latte', 22000),
    pav: await make('Masala Pav Sandwich', 17500),
  };
}

// ---------------------------------------------------------------------------

describe('creating a delivery order', () => {
  it('creates a Swiggy order with its platform, no table, and the platform collecting GST', async () => {
    const { tokens, item } = await seedFloor();
    const response = await openDelivery(tokens.CASHIER, {
      platform: swiggy(),
      customerName: 'Rishi',
      lines: [{ menuItemId: item.id, quantity: 1 }],
    });

    assert.equal(response.status, 201, JSON.stringify(response.body));
    const order = response.body.data;
    assert.deepEqual(order.platform, { code: 'SWIGGY', name: 'Swiggy', orderId: '249377796192385' });
    assert.equal(order.tableId, null);
    assert.equal(order.taxTreatment, 'PLATFORM_COLLECTS');

    const stored = await Order.findOne({ restaurantId: order.restaurantId, _id: order.id });
    assert.equal(stored.occupiesTable, false);
  });

  it('freezes each line at 0% and keeps the item rate in menuTaxRateBps', async () => {
    const { tokens, item } = await seedFloor();
    const order = (
      await openDelivery(tokens.CASHIER, { platform: swiggy(), lines: [{ menuItemId: item.id, quantity: 1 }] })
    ).body.data;

    assert.equal(order.lines[0].taxRateBps, 0);
    assert.equal(order.lines[0].menuTaxRateBps, 500);
  });

  const refusals = [
    ['no platform', {}],
    ['an unknown platform', { platform: { code: 'UBER', orderId: '12345' } }],
    ['a missing platform order number', { platform: { code: 'SWIGGY' } }],
    ['a malformed platform order number', { platform: { code: 'SWIGGY', orderId: 'ab-12' } }],
    ['a two-character platform order number', { platform: { code: 'SWIGGY', orderId: '12' } }],
    ['a table', { platform: swiggy(), tableId: '0'.repeat(24) }],
    ['a guest count', { platform: swiggy(), guestCount: 2 }],
  ];
  for (const [label, body] of refusals) {
    it(`refuses ${label} with 400`, async () => {
      const { tokens } = await seedFloor();
      const response = await openDelivery(tokens.CASHIER, body);
      assert.equal(response.status, 400, JSON.stringify(response.body));
    });
  }

  it('lists the allowed platform codes when one is wrong', async () => {
    const { tokens } = await seedFloor();
    const response = await openDelivery(tokens.CASHIER, { platform: { code: 'UBER', orderId: '12345' } });
    assert.match(JSON.stringify(response.body.error.fields), /ZOMATO, SWIGGY/);
  });

  it('refuses a platform on a dine-in or a takeaway order', async () => {
    const { tokens, table } = await seedFloor();
    const dineIn = await request('POST', '/api/v1/orders', {
      token: tokens.WAITER,
      body: { orderType: 'DINE_IN', tableId: table.id, platform: swiggy() },
    });
    assert.equal(dineIn.status, 400);
    const takeaway = await request('POST', '/api/v1/orders', {
      token: tokens.WAITER,
      body: { orderType: 'TAKEAWAY', platform: swiggy() },
    });
    assert.equal(takeaway.status, 400);
  });

  it('refuses the kitchen and the storekeeper, like any order', async () => {
    const { tokens } = await seedFloor();
    for (const role of ['KITCHEN', 'STOREKEEPER']) {
      assert.equal((await openDelivery(tokens[role], { platform: swiggy() })).status, 403, role);
    }
  });
});

describe('a platform order number entered twice', () => {
  it('is refused on the same platform, naming the existing order, and allowed on the other', async () => {
    const { tokens } = await seedFloor();
    const first = (await openDelivery(tokens.CASHIER, { platform: swiggy() })).body.data;

    const again = await openDelivery(tokens.CASHIER, { platform: swiggy() });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'DUPLICATE');
    assert.equal(
      again.body.error.message,
      `Swiggy order 249377796192385 is already entered as order ${first.orderNumber}.`,
    );
    assert.equal(again.body.error.existingOrderId, first.id);

    const onZomato = await openDelivery(tokens.CASHIER, {
      platform: { code: 'ZOMATO', orderId: '249377796192385' },
    });
    assert.equal(onZomato.status, 201);
  });

  it('frees the number once the first order is cancelled', async () => {
    const { tokens } = await seedFloor();
    const first = (await openDelivery(tokens.CASHIER, { platform: swiggy() })).body.data;
    const cancelled = await request('POST', `/api/v1/orders/${first.id}/cancel`, {
      token: tokens.MANAGER,
      body: { version: first.version, reasonCode: 'DUPLICATE' },
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));

    const again = await openDelivery(tokens.CASHIER, { platform: swiggy() });
    assert.equal(again.status, 201);
  });

  it('lets two delivery orders, and two takeaways, be open at the same time', async () => {
    const { tokens } = await seedFloor();
    assert.equal((await openDelivery(tokens.CASHIER, { platform: swiggy('1001') })).status, 201);
    assert.equal((await openDelivery(tokens.CASHIER, { platform: swiggy('1002') })).status, 201);
    for (let i = 0; i < 2; i += 1) {
      const takeaway = await request('POST', '/api/v1/orders', {
        token: tokens.CASHIER,
        body: { orderType: 'TAKEAWAY' },
      });
      assert.equal(takeaway.status, 201, JSON.stringify(takeaway.body));
    }
  });
});

describe('the platformCollectsGst setting', () => {
  it('makes new delivery orders NORMAL when off, and leaves earlier orders as they were', async () => {
    const { tokens, item } = await seedFloor();
    const earlier = (await openDelivery(tokens.CASHIER, { platform: swiggy('5001') })).body.data;

    const turnedOff = await request('PATCH', '/api/v1/settings', {
      token: tokens.OWNER,
      body: { reason: 'CA wants GST on our bills', delivery: { platformCollectsGst: false } },
    });
    assert.equal(turnedOff.status, 200);
    assert.deepEqual(turnedOff.body.data.delivery, { platformCollectsGst: false });

    const later = (
      await openDelivery(tokens.CASHIER, { platform: swiggy('5002'), lines: [{ menuItemId: item.id, quantity: 1 }] })
    ).body.data;
    assert.equal(later.taxTreatment, 'NORMAL');
    assert.equal(later.lines[0].taxRateBps, 500);

    // A line added to the earlier order still follows that order's treatment.
    const added = await request('POST', `/api/v1/orders/${earlier.id}/lines`, {
      token: tokens.CASHIER,
      body: { version: earlier.version, lines: [{ menuItemId: item.id, quantity: 1 }] },
    });
    assert.equal(added.body.data.taxTreatment, 'PLATFORM_COLLECTS');
    assert.equal(added.body.data.lines[0].taxRateBps, 0);
  });
});

describe('billing delivery orders, golden day', () => {
  it('B07: Swiggy, item total 93000, GST 0, round-off 0, total 93000', async () => {
    const floor = await seedFloor();
    const menu = await deliveryMenu(floor.tokens);
    const opened = (
      await openDelivery(floor.tokens.CASHIER, {
        platform: swiggy(),
        lines: [menu.pizza, menu.shake, menu.latte].map((menuItemId) => ({ menuItemId, quantity: 1 })),
      })
    ).body.data;
    const { order } = await serveEverything(floor.tokens, opened);
    const b07 = await bill(floor.tokens, order);

    assert.equal(b07.subtotalInPaise, 93000);
    assert.equal(b07.totalTaxInPaise, 0);
    assert.equal(b07.roundOffInPaise, 0);
    assert.equal(b07.grandTotalInPaise, 93000);
    assert.equal(b07.taxBreakdown.length, 1);
    assert.equal(b07.taxBreakdown[0].taxRateBps, 0);
    assert.deepEqual(b07.platform, { code: 'SWIGGY', name: 'Swiggy', orderId: '249377796192385' });
    assert.equal(b07.taxTreatment, 'PLATFORM_COLLECTS');
  });

  it('B08: Zomato, flat 20000 off, total 30500, shares 13069 and 6931, GST shares 0', async () => {
    const floor = await seedFloor();
    const menu = await deliveryMenu(floor.tokens);
    const opened = (
      await openDelivery(floor.tokens.CASHIER, {
        platform: { code: 'ZOMATO', orderId: '7712345' },
        lines: [menu.shake, menu.pav].map((menuItemId) => ({ menuItemId, quantity: 1 })),
      })
    ).body.data;
    const { order } = await serveEverything(floor.tokens, opened);
    const b08 = await bill(floor.tokens, order);

    const discounted = await request('POST', `/api/v1/bills/${b08.id}/discount`, {
      token: floor.tokens.MANAGER,
      body: { kind: 'FLAT', valueInPaise: 20000, reason: 'Merchant promo TAKE200' },
    });
    assert.equal(discounted.status, 200, JSON.stringify(discounted.body));
    const data = discounted.body.data;
    assert.equal(data.grandTotalInPaise, 30500);
    assert.deepEqual(
      data.lines.map((line) => [line.discountShareInPaise, line.taxInPaise]),
      [
        [13069, 0],
        [6931, 0],
      ],
    );
  });

  it('leaves a dine-in bill on the same day at 5%', async () => {
    const floor = await seedFloor();
    await openDelivery(floor.tokens.CASHIER, { platform: swiggy() });
    const opened = (
      await request('POST', '/api/v1/orders', {
        token: floor.tokens.WAITER,
        body: { orderType: 'DINE_IN', tableId: floor.table.id, lines: [{ menuItemId: floor.item.id, quantity: 1 }] },
      })
    ).body.data;
    const { order } = await serveEverything(floor.tokens, opened);
    const dineIn = await bill(floor.tokens, order);
    assert.equal(dineIn.taxBreakdown[0].taxRateBps, 500);
    assert.equal(dineIn.taxTreatment, 'NORMAL');
    assert.equal(dineIn.platform, null);
  });
});

describe('the KOT ticket for a delivery order', () => {
  it('shows the platform and its number, and no table', async () => {
    const floor = await seedFloor();
    const opened = (
      await openDelivery(floor.tokens.CASHIER, {
        platform: swiggy(),
        customerName: 'Rishi',
        lines: [{ menuItemId: floor.item.id, quantity: 1 }],
      })
    ).body.data;
    const fired = (
      await request('POST', `/api/v1/orders/${opened.id}/fire`, {
        token: floor.tokens.CASHIER,
        body: { version: opened.version },
      })
    ).body.data;

    const ticket = await request('GET', `/api/v1/kots/${fired.kot.id}/ticket?width=48`, {
      token: floor.tokens.KITCHEN,
    });
    assert.match(ticket.body.data.text, /\nDELIVERY {2}SWIGGY 249377796192385\nRishi\n/);
    assert.doesNotMatch(ticket.body.data.text, /TAKEAWAY|guests/);
  });
});

describe('the platform list mirror', () => {
  it('holds the same codes and names on client and server', () => {
    assert.deepEqual(
      clientPlatforms.PLATFORMS,
      PLATFORMS.map(({ code, name }) => ({ code, name })),
    );
  });
});
