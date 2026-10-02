/**
 * A complete, realistic demo environment: two restaurants, all six roles,
 * a real Ahmedabad menu, both GST slabs plus a zero-rated item, ingredients
 * across all three base units, and orders and bills carried the whole way
 * through billing, cancellation and inventory deduction.
 *
 *   npm run seed:demo
 *
 * Every write goes through the real HTTP API -- this script boots the same
 * `createApp()` the server itself listens with and drives it exactly the way
 * server/tests/helpers/testServer.js drives it for tests, over a real socket.
 * Hand-writing documents to the collections directly would risk quietly
 * reimplementing a business rule (a snapshot, a counter, an audit row) wrong;
 * calling the real endpoints cannot.
 *
 * REFUSES TO RUN:
 *   - unless NODE_ENV is "development" or "test". A seed script that can run
 *     in production is a seed script that will eventually run in production.
 *   - against a MONGO_URI whose host is not localhost/127.0.0.1 and not in
 *     SEED_DEMO_ALLOWED_HOSTS (comma-separated, .env.example). Writing demo
 *     data anywhere but localhost is an explicit opt-in, never an accident.
 *
 * IDEMPOTENT: every collection this script touches is scoped to the two
 * demo restaurantIds it creates or finds by a fixed name, and running it
 * twice deletes and rebuilds those two restaurants' data rather than piling
 * up duplicates. Nothing outside those two restaurantIds is ever touched.
 */
import { pathToFileURL } from 'node:url';

import mongoose from 'mongoose';

import { config } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { createApp } from '../server.js';
import { runProvisioning } from './provisionRestaurant.js';
import { assertSafeToSeed, wipeRestaurantNamed } from './lib/localSeed.js';

const DEMO_A_NAME = 'Demo Restaurant A';
const DEMO_B_NAME = 'Demo Restaurant B';
// Read from the environment, never hardcoded: this repo is public. There is
// deliberately no default, so a missing value stops the script in main().
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

/* ---------------------------------------------------------------------- *
 * Safety
 * ---------------------------------------------------------------------- */

// assertSafeToSeed lives in scripts/lib/localSeed.js, shared with loadGoldenDay.js (P18).

/* ---------------------------------------------------------------------- *
 * HTTP driver -- the same shape as tests/helpers/testServer.js
 * ---------------------------------------------------------------------- */

let baseUrl;

async function request(method, path, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `${method} ${path} -> ${response.status} ${parsed?.error?.code ?? ''} ${parsed?.error?.message ?? ''}`,
    );
  }
  return parsed.data;
}

/* ---------------------------------------------------------------------- *
 * Idempotency: wipe any prior demo restaurant by name before rebuilding.
 * ---------------------------------------------------------------------- */

/**
 * Every collection scoped to a restaurant, from the model registry, so a model
 * added later is wiped too. The fixed list this replaced stopped at M4 and left
 * stations, payment methods, accounts and Day Close records behind (fixed in P11).
 */
async function wipeExistingDemoRestaurant(name) {
  if (await wipeRestaurantNamed(name)) console.log(`  Wiped previous "${name}" and every record scoped to it.`);
}

/* ---------------------------------------------------------------------- *
 * Phase: provisioning and staff
 * ---------------------------------------------------------------------- */

async function provisionDemoRestaurant(name, ownerPhone) {
  const result = await runProvisioning({
    restaurantName: name,
    ownerName: 'Demo Owner',
    ownerPhone,
    ownerEmail: null,
    password: DEMO_PASSWORD,
  });
  return result; // { restaurantId, branchId, userId, password, phone }
}

async function loginAs(phone) {
  const data = await request('POST', '/api/v1/auth/login', { body: { phone, password: DEMO_PASSWORD } });
  return data.accessToken;
}

/** All six roles, phone numbers deterministic so re-running is stable. */
const STAFF = [
  { role: 'MANAGER', name: 'Demo Manager', phoneSuffix: '1' },
  { role: 'CASHIER', name: 'Demo Cashier', phoneSuffix: '2' },
  { role: 'WAITER', name: 'Demo Waiter', phoneSuffix: '3' },
  { role: 'KITCHEN', name: 'Demo Kitchen', phoneSuffix: '4' },
  { role: 'STOREKEEPER', name: 'Demo Storekeeper', phoneSuffix: '5' },
];

async function createStaff(ownerToken, phonePrefix) {
  const tokens = {};
  for (const member of STAFF) {
    const phone = `${phonePrefix}${member.phoneSuffix}`;
    await request('POST', '/api/v1/users', {
      token: ownerToken,
      body: { name: member.name, phone, role: member.role, password: DEMO_PASSWORD },
    });
    tokens[member.role] = await loginAs(phone);
  }
  return tokens;
}

/* ---------------------------------------------------------------------- *
 * Phase: the menu -- a real Ahmedabad menu, both GST slabs, one exempt item,
 * a 60+ character name, variants and add-ons on two items.
 * ---------------------------------------------------------------------- */

async function seedMenu(ownerToken) {
  const starters = await request('POST', '/api/v1/categories', {
    token: ownerToken,
    body: { name: 'Starters', displayOrder: 10 },
  });
  const mains = await request('POST', '/api/v1/categories', {
    token: ownerToken,
    body: { name: 'Main Course', displayOrder: 20 },
  });
  const beverages = await request('POST', '/api/v1/categories', {
    token: ownerToken,
    body: { name: 'Beverages', displayOrder: 30 },
  });
  const desserts = await request('POST', '/api/v1/categories', {
    token: ownerToken,
    body: { name: 'Desserts', displayOrder: 40 },
  });

  const paneerTikka = await request('POST', '/api/v1/menu-items', {
    token: ownerToken,
    body: {
      categoryId: starters.id,
      name: 'Paneer Tikka',
      description: 'Char-grilled cottage cheese, skewered with peppers and onion.',
      priceInPaise: 24000,
      taxRateBps: 500, // 5% -- food
      variants: [
        { name: 'Half', priceInPaise: 14000 },
        { name: 'Full', priceInPaise: 24000 },
      ],
      addOns: [{ name: 'Extra Cheese', priceInPaise: 4000 }],
    },
  });

  const dalFry = await request('POST', '/api/v1/menu-items', {
    token: ownerToken,
    body: {
      categoryId: mains.id,
      name: 'Dal Fry',
      priceInPaise: 14900,
      taxRateBps: 500,
    },
  });

  const butterRoti = await request('POST', '/api/v1/menu-items', {
    token: ownerToken,
    body: { categoryId: mains.id, name: 'Butter Roti', priceInPaise: 3500, taxRateBps: 500 },
  });

  // THE 60+ CHARACTER NAME, so the receipt formatter's wrap gets exercised by
  // real seed data, not only by a unit test. Also priced so its 5% tax lands
  // on a fraction of a paisa (see the order below, at quantity 3).
  const longNamedThali = await request('POST', '/api/v1/menu-items', {
    token: ownerToken,
    body: {
      categoryId: mains.id,
      name: 'Grand Ahmedabad Special Mixed Vegetable Thali With Papad And Chaas',
      priceInPaise: 8899,
      taxRateBps: 500,
    },
  });

  const masalaChaas = await request('POST', '/api/v1/menu-items', {
    token: ownerToken,
    body: { categoryId: beverages.id, name: 'Masala Chaas', priceInPaise: 4900, taxRateBps: 0 }, // exempt
  });

  const coldCoffee = await request('POST', '/api/v1/menu-items', {
    token: ownerToken,
    body: {
      categoryId: beverages.id,
      name: 'Cold Coffee',
      priceInPaise: 8000,
      taxRateBps: 500,
      variants: [
        { name: 'Regular', priceInPaise: 8000 },
        { name: 'Large', priceInPaise: 11000 },
      ],
      addOns: [{ name: 'Extra Shot', priceInPaise: 3000 }],
    },
  });

  const packagedSoftDrink = await request('POST', '/api/v1/menu-items', {
    token: ownerToken,
    body: {
      categoryId: beverages.id,
      name: 'Packaged Soft Drink 300ml',
      priceInPaise: 6000,
      taxRateBps: 1800, // 18% -- packaged/aerated
    },
  });

  const gulabJamun = await request('POST', '/api/v1/menu-items', {
    token: ownerToken,
    body: { categoryId: desserts.id, name: 'Gulab Jamun', priceInPaise: 8900, taxRateBps: 500 },
    // Deliberately given no recipe below: the one dish with none, for
    // GET /inventory/unmapped.
  });

  return {
    categories: { starters, mains, beverages, desserts },
    paneerTikka,
    dalFry,
    butterRoti,
    longNamedThali,
    masalaChaas,
    coldCoffee,
    packagedSoftDrink,
    gulabJamun,
  };
}

/* ---------------------------------------------------------------------- *
 * Phase: ingredients across all three base units, and recipes -- including
 * one variant-level recipe, and the factor-of-1000 case (bought in kg, used
 * in grams).
 * ---------------------------------------------------------------------- */

async function seedInventory(ownerToken, menu) {
  const paneer = await request('POST', '/api/v1/ingredients', {
    token: ownerToken,
    body: {
      name: 'Paneer',
      baseUnit: 'G',
      purchaseUnitName: 'kg',
      unitsPerBase: 1000,
      lowStockThresholdInBase: 1000,
      openingQtyInBase: 5000,
    },
  });

  const oil = await request('POST', '/api/v1/ingredients', {
    token: ownerToken,
    body: {
      name: 'Cooking Oil',
      baseUnit: 'ML',
      purchaseUnitName: 'litre',
      unitsPerBase: 1000,
      lowStockThresholdInBase: 500,
      openingQtyInBase: 3000,
    },
  });

  // THE FACTOR-OF-1000 CASE from BUILD-PLAN section 8: bought in kilograms,
  // used in grams. Already below its own threshold at seed time, so the
  // low-stock read has something real to show on the first screen anyone
  // opens.
  const butter = await request('POST', '/api/v1/ingredients', {
    token: ownerToken,
    body: {
      name: 'Butter',
      baseUnit: 'G',
      purchaseUnitName: 'kg',
      unitsPerBase: 1000,
      lowStockThresholdInBase: 2500,
      openingQtyInBase: 2000, // already <= threshold: LOW at seed time
    },
  });

  const papad = await request('POST', '/api/v1/ingredients', {
    token: ownerToken,
    body: {
      name: 'Papad',
      baseUnit: 'PIECE',
      lowStockThresholdInBase: 10,
      openingQtyInBase: 50,
    },
  });

  const bottledDrink = await request('POST', '/api/v1/ingredients', {
    token: ownerToken,
    body: {
      name: 'Packaged Soft Drink Bottle',
      baseUnit: 'PIECE',
      lowStockThresholdInBase: 6,
      openingQtyInBase: 24,
    },
  });

  // Item-level recipe for Paneer Tikka (the full plate).
  await request('PUT', '/api/v1/recipes', {
    token: ownerToken,
    body: {
      menuItemId: menu.paneerTikka.id,
      variantId: null,
      items: [
        { ingredientId: paneer.id, qtyInBase: 300 },
        { ingredientId: oil.id, qtyInBase: 20 },
      ],
    },
  });
  // THE VARIANT-LEVEL RECIPE: the half plate gets its own, smaller recipe,
  // so it does not over-deduct against the full plate's.
  const half = menu.paneerTikka.variants.find((v) => v.name === 'Half');
  await request('PUT', '/api/v1/recipes', {
    token: ownerToken,
    body: {
      menuItemId: menu.paneerTikka.id,
      variantId: half.id,
      items: [
        { ingredientId: paneer.id, qtyInBase: 150 },
        { ingredientId: oil.id, qtyInBase: 10 },
      ],
    },
  });

  await request('PUT', '/api/v1/recipes', {
    token: ownerToken,
    body: {
      menuItemId: menu.longNamedThali.id,
      items: [
        { ingredientId: paneer.id, qtyInBase: 100 },
        { ingredientId: butter.id, qtyInBase: 30 },
        { ingredientId: papad.id, qtyInBase: 2 },
      ],
    },
  });

  await request('PUT', '/api/v1/recipes', {
    token: ownerToken,
    body: { menuItemId: menu.dalFry.id, items: [{ ingredientId: butter.id, qtyInBase: 20 }] },
  });

  await request('PUT', '/api/v1/recipes', {
    token: ownerToken,
    body: {
      menuItemId: menu.packagedSoftDrink.id,
      items: [{ ingredientId: bottledDrink.id, qtyInBase: 1 }],
    },
  });

  // Gulab Jamun gets no recipe at all -- the honest, deliberate gap for
  // GET /inventory/unmapped, exercised once it is fired below.

  return { paneer, oil, butter, papad, bottledDrink };
}

/* ---------------------------------------------------------------------- *
 * Phase: tables
 * ---------------------------------------------------------------------- */

async function seedTables(ownerToken) {
  const t1 = await request('POST', '/api/v1/tables', { token: ownerToken, body: { name: 'T1', seats: 4 } });
  const t2 = await request('POST', '/api/v1/tables', { token: ownerToken, body: { name: 'T2', seats: 2 } });
  const t3 = await request('POST', '/api/v1/tables', {
    token: ownerToken,
    body: { name: 'Garden 1', section: 'Garden', seats: 6 },
  });
  // Three more, one per scenario below that deliberately leaves a table
  // occupied afterward (a void re-occupies it; a single-line cancel that
  // empties an order leaves it OPEN with nothing live on it) -- reusing T1 to
  // T3 for those would collide with the next order this script tries to open
  // on the same table.
  const t4 = await request('POST', '/api/v1/tables', { token: ownerToken, body: { name: 'T4', seats: 4 } });
  const t5 = await request('POST', '/api/v1/tables', { token: ownerToken, body: { name: 'T5', seats: 2 } });
  const t6 = await request('POST', '/api/v1/tables', { token: ownerToken, body: { name: 'T6', seats: 2 } });
  return { t1, t2, t3, t4, t5, t6 };
}

/* ---------------------------------------------------------------------- *
 * Phase: orders and bills. Runs one order the whole way through billing and
 * payment; one line cancelled after firing with wasPrepared:false (returns
 * stock); one with wasPrepared:true (deduction stands); one voided bill; the
 * long-named, awkward-tax dish at quantity 3; the no-recipe dish fired once.
 * ---------------------------------------------------------------------- */

async function runOrderToPaidBill(tokens, table, lines) {
  const order = await request('POST', '/api/v1/orders', {
    token: tokens.WAITER,
    body: { orderType: 'DINE_IN', tableId: table.id, lines },
  });
  const fired = await request('POST', `/api/v1/orders/${order.id}/fire`, {
    token: tokens.WAITER,
    body: { version: order.version },
  });
  await request('PATCH', `/api/v1/kots/${fired.kot.id}/ready`, { token: tokens.KITCHEN });

  let current = await request('GET', `/api/v1/orders/${order.id}`, { token: tokens.WAITER });
  for (const line of current.lines) {
    current = await request(
      'PATCH',
      `/api/v1/orders/${order.id}/lines/${line.id}/served`,
      { token: tokens.WAITER, body: { version: current.version } },
    );
  }

  const bill = await request('POST', '/api/v1/bills', {
    token: tokens.CASHIER,
    body: { orderId: order.id, version: current.version },
  });
  const paid = await request('POST', `/api/v1/bills/${bill.id}/payments`, {
    token: tokens.CASHIER,
    body: { method: 'CASH', amountInPaise: bill.grandTotalInPaise },
  });
  return { order, bill: paid };
}

async function seedOrdersAndBills(tokens, menu, tables) {
  const bills = [];

  // A straightforward paid bill: the long-named, awkward-tax dish at qty 3.
  const { bill: awkwardBill } = await runOrderToPaidBill(tokens, tables.t1, [
    { menuItemId: menu.longNamedThali.id, quantity: 3 },
    { menuItemId: menu.masalaChaas.id, quantity: 2 },
  ]);
  bills.push(awkwardBill);

  // A mixed-slab bill: 5% food, 18% packaged drink, 0% chaas, with a variant
  // and an add-on both in play.
  const half = menu.paneerTikka.variants.find((v) => v.name === 'Half');
  const extraCheese = menu.paneerTikka.addOns.find((a) => a.name === 'Extra Cheese');
  const { bill: mixedSlabBill } = await runOrderToPaidBill(tokens, tables.t2, [
    { menuItemId: menu.paneerTikka.id, variantId: half.id, quantity: 1, addOnIds: [extraCheese.id] },
    { menuItemId: menu.packagedSoftDrink.id, quantity: 1 },
    { menuItemId: menu.dalFry.id, quantity: 2 },
  ]);
  bills.push(mixedSlabBill);

  // A discounted bill, so the discount + apportionment path has real data.
  const { bill: unpaidForDiscount } = await (async () => {
    const order = await request('POST', '/api/v1/orders', {
      token: tokens.WAITER,
      body: {
        orderType: 'DINE_IN',
        tableId: tables.t3.id,
        lines: [{ menuItemId: menu.butterRoti.id, quantity: 4 }],
      },
    });
    const fired = await request('POST', `/api/v1/orders/${order.id}/fire`, {
      token: tokens.WAITER,
      body: { version: order.version },
    });
    await request('PATCH', `/api/v1/kots/${fired.kot.id}/ready`, { token: tokens.KITCHEN });
    let current = await request('GET', `/api/v1/orders/${order.id}`, { token: tokens.WAITER });
    for (const line of current.lines) {
      current = await request('PATCH', `/api/v1/orders/${order.id}/lines/${line.id}/served`, {
        token: tokens.WAITER,
        body: { version: current.version },
      });
    }
    const bill = await request('POST', '/api/v1/bills', {
      token: tokens.CASHIER,
      body: { orderId: order.id, version: current.version },
    });
    return { order, bill };
  })();
  const discounted = await request('POST', `/api/v1/bills/${unpaidForDiscount.id}/discount`, {
    token: tokens.OWNER,
    body: { kind: 'PERCENT', rateBps: 1000, reasonCode: 'REGULAR_GUEST' },
  });
  await request('POST', `/api/v1/bills/${discounted.id}/payments`, {
    token: tokens.CASHIER,
    body: { method: 'UPI', amountInPaise: discounted.grandTotalInPaise, reference: 'DEMO-UPI-001' },
  });
  bills.push(discounted);

  // THE VOIDED BILL, with a reason. Voiding re-occupies the table (M3
  // decision), so T4 is left occupied by design and is not reused below.
  const { bill: billToVoid } = await runOrderToPaidBill(tokens, tables.t4, [
    { menuItemId: menu.gulabJamun.id, quantity: 2 },
  ]);
  const voided = await request('POST', `/api/v1/bills/${billToVoid.id}/void`, {
    token: tokens.MANAGER,
    body: { reasonCode: 'OTHER', note: 'Wrong table billed' },
  });
  bills.push(voided);

  // CANCEL AFTER FIRE, wasPrepared:false -- fires, then cancels one line
  // unmade, so the stock actually returns. Cancelling the only line leaves
  // the order OPEN with nothing live on it -- an abandoned order, which is
  // real state a floor screen has to be able to show -- so T5 is left
  // occupied by design and is not reused below.
  const returnOrder = await request('POST', '/api/v1/orders', {
    token: tokens.WAITER,
    body: {
      orderType: 'DINE_IN',
      tableId: tables.t5.id,
      lines: [
        { menuItemId: menu.paneerTikka.id, variantId: menu.paneerTikka.variants.find((v) => v.name === 'Full').id, quantity: 1 },
      ],
    },
  });
  const returnFired = await request('POST', `/api/v1/orders/${returnOrder.id}/fire`, {
    token: tokens.WAITER,
    body: { version: returnOrder.version },
  });
  await request(
    'POST',
    `/api/v1/orders/${returnOrder.id}/lines/${returnFired.order.lines[0].id}/cancel`,
    {
      token: tokens.MANAGER,
      body: { version: returnFired.order.version, reasonCode: 'OTHER', note: 'Kitchen ran out mid-cook', wasPrepared: false },
    },
  );

  // CANCEL AFTER FIRE, wasPrepared:true -- the deduction stands. Same
  // abandoned-order shape as T5 above, so T6 is not reused below either.
  const madeOrder = await request('POST', '/api/v1/orders', {
    token: tokens.WAITER,
    body: { orderType: 'DINE_IN', tableId: tables.t6.id, lines: [{ menuItemId: menu.dalFry.id, quantity: 1 }] },
  });
  const madeFired = await request('POST', `/api/v1/orders/${madeOrder.id}/fire`, {
    token: tokens.WAITER,
    body: { version: madeOrder.version },
  });
  await request('POST', `/api/v1/orders/${madeOrder.id}/lines/${madeFired.order.lines[0].id}/cancel`, {
    token: tokens.MANAGER,
    body: { version: madeFired.order.version, reasonCode: 'OTHER', note: 'Walked out', wasPrepared: true },
  });

  // THE NO-RECIPE DISH, fired at least once, so GET /inventory/unmapped has
  // something real to show.
  const unmappedOrder = await request('POST', '/api/v1/orders', {
    token: tokens.WAITER,
    body: { orderType: 'TAKEAWAY', customerName: 'Walk-in', lines: [{ menuItemId: menu.gulabJamun.id, quantity: 3 }] },
  });
  await request('POST', `/api/v1/orders/${unmappedOrder.id}/fire`, {
    token: tokens.WAITER,
    body: { version: unmappedOrder.version },
  });

  return bills;
}

/**
 * Backdates one paid bill (and the order and KOT it came from, and every
 * stock movement it produced) across the business-day boundary, so a report
 * grouping by businessDate has late-night data to get right or wrong.
 *
 * The order/bill/payment flow above always uses the server's own clock --
 * there is no endpoint that accepts a client-supplied timestamp for any of
 * this, by design (CLAUDE.md: timestamps are the server's clock). Real
 * 23:45/00:30 data can only exist by adjusting it after the fact, which is
 * what this does, directly against the collections, recomputing businessDate
 * consistently everywhere it is stored so the adjustment does not itself
 * introduce a disagreement.
 */
async function backdateAcrossBusinessDayBoundary(bill, order, instant, businessDate) {
  const db = mongoose.connection.db;

  await db.collection('bills').updateOne(
    { _id: new mongoose.Types.ObjectId(bill.id) },
    { $set: { billedAt: instant, paidAt: instant, businessDate, createdAt: instant, updatedAt: instant } },
  );
  await db.collection('orders').updateOne(
    { _id: new mongoose.Types.ObjectId(order.id) },
    {
      $set: {
        openedAt: instant,
        readyToBillAt: instant,
        createdAt: instant,
        updatedAt: instant,
        'lines.$[].addedAt': instant,
        'lines.$[].firedAt': instant,
        'lines.$[].readyAt': instant,
        'lines.$[].servedAt': instant,
      },
    },
  );
  await db
    .collection('kots')
    .updateMany({ orderId: new mongoose.Types.ObjectId(order.id) }, { $set: { firedAt: instant } });
  await db
    .collection('stockmovements')
    .updateMany({ orderId: new mongoose.Types.ObjectId(order.id) }, { $set: { at: instant } });
}

/* ---------------------------------------------------------------------- *
 * Restaurant B: minimal. Exists only so a cross-tenant isolation check has a
 * second tenant to fail against.
 * ---------------------------------------------------------------------- */

async function seedRestaurantB() {
  const provisioned = await provisionDemoRestaurant(DEMO_B_NAME, '9000000090');
  const ownerToken = await loginAs(provisioned.phone);

  const category = await request('POST', '/api/v1/categories', {
    token: ownerToken,
    body: { name: 'Snacks' },
  });
  const item = await request('POST', '/api/v1/menu-items', {
    token: ownerToken,
    body: { categoryId: category.id, name: 'Khaman', priceInPaise: 6000, taxRateBps: 500 },
  });
  const table = await request('POST', '/api/v1/tables', { token: ownerToken, body: { name: 'B1' } });
  await request('POST', '/api/v1/orders', {
    token: ownerToken,
    body: { orderType: 'DINE_IN', tableId: table.id, lines: [{ menuItemId: item.id, quantity: 1 }] },
  });

  return provisioned;
}

/* ---------------------------------------------------------------------- *
 * Main
 * ---------------------------------------------------------------------- */

function assertDemoPasswordSet() {
  if (!DEMO_PASSWORD || !DEMO_PASSWORD.trim()) {
    throw new Error(
      'Refusing to run: DEMO_PASSWORD is not set. Add it to .env (see .env.example); there is no default.',
    );
  }
}

async function main() {
  assertDemoPasswordSet();
  assertSafeToSeed();

  await connectDatabase();
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    console.log(`Seeding against ${new URL(config.MONGO_URI.replace('mongodb+srv://', 'https://').replace('mongodb://', 'http://')).hostname}, NODE_ENV=${config.NODE_ENV}`);
    console.log('');

    await wipeExistingDemoRestaurant(DEMO_A_NAME);
    await wipeExistingDemoRestaurant(DEMO_B_NAME);

    console.log(`Provisioning "${DEMO_A_NAME}"…`);
    const provisioned = await provisionDemoRestaurant(DEMO_A_NAME, '9000000010');
    const ownerToken = await loginAs(provisioned.phone);

    console.log('Creating staff, all six roles…');
    const staffTokens = await createStaff(ownerToken, '900000001');
    const tokens = { OWNER: ownerToken, ...staffTokens };

    console.log('Building the menu…');
    const menu = await seedMenu(ownerToken);

    console.log('Adding ingredients and recipes…');
    await seedInventory(ownerToken, menu);

    console.log('Setting up tables…');
    const tables = await seedTables(ownerToken);

    console.log('Running orders through billing, payment, void and cancellation…');
    const bills = await seedOrdersAndBills(tokens, menu, tables);

    console.log('Backdating one bill either side of the business-day boundary…');
    const lateNight = await runOrderToPaidBill(tokens, tables.t1, [
      { menuItemId: menu.masalaChaas.id, quantity: 1 },
    ]);
    // 23:45 IST the "previous" evening -> still counts as that business day
    // under the default 05:00 boundary.
    await backdateAcrossBusinessDayBoundary(
      lateNight.bill,
      lateNight.order,
      new Date('2026-08-29T18:15:00.000Z'), // 23:45 IST
      '2026-08-29',
    );

    const pastMidnight = await runOrderToPaidBill(tokens, tables.t2, [
      { menuItemId: menu.dalFry.id, quantity: 1 },
    ]);
    // 00:30 IST the same "night" -> still the PREVIOUS business day, not the
    // new calendar day, under the 05:00 boundary. This is the case that is
    // wrong if the boundary logic is wrong.
    await backdateAcrossBusinessDayBoundary(
      pastMidnight.bill,
      pastMidnight.order,
      new Date('2026-08-29T19:00:00.000Z'), // 00:30 IST the 30th
      '2026-08-29',
    );

    console.log(`Provisioning "${DEMO_B_NAME}" (minimal, for tenant isolation checks)…`);
    const provisionedB = await seedRestaurantB();

    console.log('');
    console.log('Done.');
    console.log('');
    console.log(`  ${DEMO_A_NAME}`);
    console.log(`    Owner:        ${provisioned.phone} / ${DEMO_PASSWORD}`);
    for (const member of STAFF) {
      console.log(`    ${member.role.padEnd(12)}: 900000001${member.phoneSuffix} / ${DEMO_PASSWORD}`);
    }
    console.log(`    ${bills.length + 2} bills created, one voided, one discounted, two backdated.`);
    console.log('');
    console.log(`  ${DEMO_B_NAME}`);
    console.log(`    Owner:        ${provisionedB.phone} / ${DEMO_PASSWORD}`);
    console.log('');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await disconnectDatabase();
  }
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error('');
    console.error(`Seeding failed: ${error.message}`);
    console.error('');
    process.exitCode = 1;
  });
}

export { assertSafeToSeed, main };
