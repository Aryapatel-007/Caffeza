/**
 * The golden day, docs/TEST-DATA.md, built through the real API. P10.
 *
 * One fixed business day, 26 September 2026, at Caffeza. Every bill is opened
 * by its captain, fired, served, billed, discounted and paid at the times in
 * TEST-DATA section 2, with the test clock set to each moment, so every rule
 * runs exactly as it does in production: snapshots, line shares, invoice
 * numbers, business dates, frozen payment fields and the account ledger.
 *
 * The staff are seeded with the test helpers, as every test file does. Nothing
 * after that touches a model: it is all HTTP.
 *
 * Build it once per test file, in a `before`, not once per test. The expected
 * figures from TEST-DATA section 4 are exported as plain constants, so every
 * report test can reuse both the data and the answers.
 */
import assert from 'node:assert/strict';

import { ROLES } from '../../config/roles.js';
import { resetClockForTests, setClockForTests } from '../../utils/time.js';
import { DEFAULT_PASSWORD, seedFullRestaurant, seedUser } from './seed.js';
import { request } from './testServer.js';

export const GOLDEN_DATE = '2026-09-26';

/** India time on a date, as a UTC instant. */
export const ist = (time, date = GOLDEN_DATE) => new Date(`${date}T${time}:00+05:30`);

const STATIONS = ['Live Kitchen', 'Beverages'];

/** Category, its station. */
const CATEGORIES = {
  'Bhel 2.0': 'Live Kitchen',
  Dessert: 'Live Kitchen',
  Extras: 'Live Kitchen',
  'Cafezza Mains': 'Live Kitchen',
  'Deconstructed Bowls': 'Live Kitchen',
  'Italian Coffees': 'Beverages',
  Accompaniments: 'Live Kitchen',
  Pasta: 'Live Kitchen',
  Pizza: 'Live Kitchen',
  'Cafezza Shakes': 'Beverages',
  'Cold Beverages': 'Beverages',
  'Sandwiches & Wraps': 'Live Kitchen',
  'Assorted Teas': 'Beverages',
};

/** Item, price in paise before tax, category. Every item is at 5% GST. */
const MENU = [
  ['Sev Poori', 18000, 'Bhel 2.0'],
  ['Tiramisu Brownie', 32000, 'Dessert'],
  ['Extra Charges', 3000, 'Extras'],
  ['Indian Platters', 45000, 'Cafezza Mains'],
  ['Chilli Garlic Noodle Bowl', 40000, 'Deconstructed Bowls'],
  ['Mocha Flower', 28000, 'Italian Coffees'],
  ['Roasted Papad', 8000, 'Accompaniments'],
  ['Laccha Tawa Paratha', 8000, 'Accompaniments'],
  ['Creamy Pesto Pasta', 43000, 'Pasta'],
  ['Cheesy Tornado', 36000, 'Pizza'],
  ['Caffe Latte', 22000, 'Italian Coffees'],
  ['Chole Kulcha Platter', 35000, 'Cafezza Mains'],
  ['Half & Half Pizza', 38000, 'Pizza'],
  ['Ferrero Hazelnut Shake', 33000, 'Cafezza Shakes'],
  ['Water Bottle', 4761, 'Cold Beverages'],
  ['Masala Pav Sandwich', 17500, 'Sandwiches & Wraps'],
  ['Masala Tea', 9000, 'Assorted Teas'],
  ['Mexican Bowl', 40000, 'Deconstructed Bowls'],
  ['College Sandwich', 23000, 'Sandwiches & Wraps'],
  ['Piri Piri Paneer Pizza', 33000, 'Pizza'],
  ['Thecha Paneer Chilli', 39000, 'Cafezza Mains'],
  ['Mumbaiya Pav Bhaji Platter', 45000, 'Cafezza Mains'],
];

const PLATFORM_METHODS = [
  { code: 'ZOMATO_GOLD', name: 'Zomato Gold', orderTypes: ['DINE_IN', 'TAKEAWAY'], tallyLedgerCode: '869' },
  { code: 'DINEOUT', name: 'Dineout', orderTypes: ['DINE_IN', 'TAKEAWAY'], tallyLedgerCode: '870' },
  { code: 'EAZYDINER', name: 'EazyDiner', orderTypes: ['DINE_IN', 'TAKEAWAY'], tallyLedgerCode: '871' },
  { code: 'ZOMATO', name: 'Zomato', orderTypes: ['DELIVERY'], platformCode: 'ZOMATO', tallyLedgerCode: '867' },
  { code: 'SWIGGY', name: 'Swiggy', orderTypes: ['DELIVERY'], platformCode: 'SWIGGY', tallyLedgerCode: '868' },
];

const TABLES = ['Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 7', 'Table 11', 'Table 12', 'Table 14', 'Table 16', 'Table 18', 'Table 29', 'Table 30', 'Table 35'];

/**
 * TEST-DATA section 2, in invoice order. Times are India time on 26 September
 * unless `paidNextDay`. Items are names, or [name, quantity].
 */
export const GOLDEN_BILLS = [
  { id: 'B01', table: 'Table 5', covers: 2, captain: 'Khuman Singh', opened: '11:40', billed: '12:30', paid: '12:36',
    items: ['Sev Poori', 'Tiramisu Brownie', 'Extra Charges'],
    discount: { kind: 'PERCENT', rateBps: 1000, reasonCode: 'REGULAR_GUEST' },
    payments: [['CASH', 50100]] },
  { id: 'B02', table: 'Table 7', covers: 3, captain: 'Budha Singh', opened: '13:01', billed: '13:52', paid: '13:58',
    items: ['Indian Platters', 'Chilli Garlic Noodle Bowl', 'Mocha Flower', 'Roasted Papad', 'Laccha Tawa Paratha', 'Roasted Papad', 'Roasted Papad'],
    discount: { kind: 'FLAT', valueInPaise: 7307, reasonCode: 'ZOMATO_GOLD' },
    payments: [['ZOMATO_GOLD', 144600]] },
  { id: 'B03', table: 'Table 12', covers: 4, captain: 'Khuman Singh', opened: '13:10', billed: '14:02', paid: '14:09',
    items: ['Creamy Pesto Pasta', 'Cheesy Tornado', 'Caffe Latte'], payments: [['CARD', 106100]] },
  { id: 'B04', table: 'Table 2', covers: 1, captain: 'Devendra Singh', opened: '14:20', billed: '14:55', paid: '14:58',
    items: ['Chole Kulcha Platter'], payments: [['UPI', 36800]] },
  { id: 'B05', table: 'Table 3', covers: 2, captain: 'Budha Singh', opened: '15:05', billed: '15:50', paid: '15:54',
    items: ['Half & Half Pizza', 'Ferrero Hazelnut Shake', 'Water Bottle'], payments: [['CASH', 50000], ['UPI', 29500]] },
  { id: 'B06', table: 'Table 14', covers: 2, captain: 'Khuman Singh', opened: '16:10', billed: '16:58', paid: '17:03',
    items: ['Indian Platters', 'Caffe Latte', 'Water Bottle'], payments: [['CASH', 75300]] },
  { id: 'B07', delivery: { code: 'SWIGGY', orderId: '249377796192385' }, captain: 'Counter', opened: '17:20', billed: '17:21', paid: '17:21',
    items: ['Half & Half Pizza', 'Ferrero Hazelnut Shake', 'Caffe Latte'], payments: [['SWIGGY', 93000]] },
  { id: 'B08', delivery: { code: 'ZOMATO', orderId: '8645938999' }, captain: 'Counter', opened: '18:05', billed: '18:06', paid: '18:06',
    items: ['Ferrero Hazelnut Shake', 'Masala Pav Sandwich'],
    discount: { kind: 'FLAT', valueInPaise: 20000, reasonCode: 'MERCHANT_PROMO', note: 'TAKE200', fundedBy: 'RESTAURANT' },
    payments: [['ZOMATO', 30500]] },
  { id: 'B09', table: 'Table 35', covers: 1, captain: 'Ranjeet Paswan', opened: '18:05', billed: '18:30', paid: '18:31',
    items: ['Masala Tea'], discount: { kind: 'PERCENT', rateBps: 5000, reasonCode: 'STAFF_OFFICE' }, onHold: 'E-210 Office' },
  { id: 'B10', table: 'Table 30', covers: 2, captain: 'Ranjeet Paswan', opened: '18:18', billed: '19:10', paid: '19:11',
    items: ['Mexican Bowl', 'Roasted Papad'], onHold: 'W-330 Office' },
  { id: 'B11', table: 'Table 16', covers: 2, captain: 'Devendra Singh', opened: '19:20', billed: '20:05',
    items: ['Piri Piri Paneer Pizza'], voidAt: '20:09' },
  { id: 'B12', sameOrderAs: 'B11', billed: '20:11', paid: '20:15', payments: [['UPI', 34700]] },
  { id: 'B13', table: 'Table 11', covers: 3, captain: 'Khuman Singh', opened: '20:30', billed: '21:40', paid: '21:44',
    items: ['Mexican Bowl'], cancelled: true, payments: [['CARD', 42000]] },
  { id: 'B14', table: 'Table 4', covers: 2, captain: 'Budha Singh', opened: '22:51', billed: '23:55', paid: '00:02', paidNextDay: true,
    items: ['Cheesy Tornado', 'Sev Poori'],
    discount: { kind: 'FLAT', valueInPaise: 1383, reasonCode: 'ZOMATO_GOLD' },
    payments: [['ZOMATO_GOLD', 55200]] },
  { id: 'B15', takeaway: true, captain: 'Counter', opened: '21:10', billed: '21:12', paid: '21:13',
    items: [['Caffe Latte', 2]], payments: [['UPI', 46200]] },
  { id: 'B16', table: 'Table 18', covers: 3, captain: 'Devendra Singh', opened: '19:40', billed: '20:40', paid: '20:46',
    items: ['Mumbaiya Pav Bhaji Platter', 'Ferrero Hazelnut Shake'],
    discount: { kind: 'FLAT', valueInPaise: 3900, reasonCode: 'DINEOUT' },
    payments: [['DINEOUT', 77800]] },
];

/** TEST-DATA section 4, every figure in paise. */
export const GOLDEN_EXPECTED = Object.freeze({
  sales: {
    billCount: 15,
    covers: 27,
    itemTotalInPaise: 931022,
    discountInPaise: 42390,
    netSalesInPaise: 888632,
    cgstInPaise: 19131,
    sgstInPaise: 19126,
    gstInPaise: 38257,
    roundOffInPaise: 11,
    billTotalInPaise: 926900,
    averageBillInPaise: 59242,
    dineInNetSalesInPaise: 721132,
    averagePerCoverInPaise: 26709,
  },
  methods: {
    CASH: 175400,
    CARD: 148100,
    UPI: 147200,
    ZOMATO_GOLD: 199800,
    DINEOUT: 77800,
    EAZYDINER: 0,
    ZOMATO: 30500,
    SWIGGY: 93000,
  },
  money: {
    inHandInPaise: 470700,
    platformInPaise: 401100,
    onHold: { 'E-210 Office': 4700, 'W-330 Office': 50400 },
    onHoldInPaise: 55100,
    unpaidInPaise: 0,
    totalInPaise: 926900,
  },
  cash: {
    openingFloatInPaise: 200000,
    cashFromBillsInPaise: 175400,
    cashCollectionsInPaise: 0,
    paidInInPaise: 0,
    paidOutInPaise: 35000,
    expectedCashInPaise: 340400,
    countedCashInPaise: 340000,
    differenceInPaise: -400,
  },
  orderTypes: [
    { orderType: 'DINE_IN', platformCode: null, billCount: 12, covers: 27, netSalesInPaise: 721132, billTotalInPaise: 757200 },
    { orderType: 'TAKEAWAY', platformCode: null, billCount: 1, covers: 0, netSalesInPaise: 44000, billTotalInPaise: 46200 },
    { orderType: 'DELIVERY', platformCode: 'SWIGGY', billCount: 1, covers: 0, netSalesInPaise: 93000, billTotalInPaise: 93000 },
    { orderType: 'DELIVERY', platformCode: 'ZOMATO', billCount: 1, covers: 0, netSalesInPaise: 30500, billTotalInPaise: 30500 },
  ],
  gst: [
    { taxRateBps: 500, platformCollects: false, netSalesInPaise: 765132, cgstInPaise: 19131, sgstInPaise: 19126, gstInPaise: 38257 },
    { taxRateBps: 0, platformCollects: true, netSalesInPaise: 123500, cgstInPaise: 0, sgstInPaise: 0, gstInPaise: 0 },
  ],
  controls: {
    discounts: { count: 6, totalInPaise: 42390, largest: [['CFA/C/22449', 20000], ['CFA/C/22443', 7307], ['CFA/C/22442', 5300]] },
    noCharge: { count: 1, valueInPaise: 23000 },
    cancelledItems: { count: 2, valueInPaise: 75000, wastedValueInPaise: 39000 },
    cancelledOrders: { count: 0, valueInPaise: 0 },
    voidedBills: { count: 1, valueInPaise: 34700, billNumber: 'CFA/C/22452', reason: 'Billed to the wrong table' },
  },
  invoices: { series: 'CFA/C/', first: 'CFA/C/22442', last: 'CFA/C/22457', issued: 16, voided: 1, gaps: [] },
});

const ok = (response, what) => {
  assert.ok(
    response.status >= 200 && response.status < 300,
    `${what}: ${response.status} ${JSON.stringify(response.body)}`,
  );
  return response.body.data;
};

async function login(phone, password = DEFAULT_PASSWORD) {
  return ok(
    await request('POST', '/api/v1/auth/login', { body: { phone, password } }),
    'login',
  ).accessToken;
}

/** Fires every pending line, marks the tickets ready, and serves every live line. */
async function fireReadyServe(token, orderId, version) {
  const fired = ok(await request('POST', `/api/v1/orders/${orderId}/fire`, { token, body: { version } }), 'fire');
  return fired;
}

async function readyAndServe(token, orderId, kots) {
  for (const kot of kots) ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token }), 'ready');
  let order = ok(await request('GET', `/api/v1/orders/${orderId}`, { token }), 'read order');
  for (const line of order.lines) {
    if (line.status !== 'READY') continue;
    order = ok(
      await request('PATCH', `/api/v1/orders/${orderId}/lines/${line.id}/served`, {
        token,
        body: { version: order.version },
      }),
      'serve',
    );
  }
  return order;
}

/** The staff, in TEST-DATA section 1's order. */
const STAFF = [
  ['Manager', ROLES.MANAGER],
  ['Counter', ROLES.CASHIER],
  ['Khuman Singh', ROLES.WAITER],
  ['Budha Singh', ROLES.WAITER],
  ['Devendra Singh', ROLES.WAITER],
  ['Ranjeet Paswan', ROLES.WAITER],
];

/**
 * The golden restaurant, ready for the day and with nothing played: staff,
 * settings, stations, menu, payment methods, accounts and tables, all through
 * the API. P21 split it out so a browser test can play the day on screen.
 *
 * `invoiceSeries: false` leaves the invoice series at its default, for the
 * browser test, where the owner sets it on the Invoice numbers screen.
 * `phoneBase`, nine digits, fixes everyone's phone at that base plus 1 to 7.
 * `password` is everyone's password, the test password by default.
 *
 * Returns the tokens by role and by person, every person's phone and the one
 * password they share, and the ids of everything created.
 */
export async function setupGoldenRestaurant({ name = 'Caffeza', commissions = {}, invoiceSeries = true, phoneBase = null, password = DEFAULT_PASSWORD } = {}) {
  setClockForTests(ist('09:00'));
  try {
    // `phoneBase` gives every person a fixed phone (base, then 1 to 7), for a shared database where
    // the test counter's numbers could already belong to someone. Phones are unique platform-wide.
    const phoneFor = (index) => (phoneBase ? `${phoneBase}${index}` : undefined);
    const base = await seedFullRestaurant({ name, ownerName: 'Owner', ownerPhone: phoneFor(1), password });
    const { restaurant, branch } = base;
    const tokens = { OWNER: await login(base.phone, password) };
    const people = { Owner: tokens.OWNER };
    const phones = { Owner: base.phone };
    for (const [index, [personName, role]] of STAFF.entries()) {
      const seeded = await seedUser({ restaurant, branch, name: personName, role, phone: phoneFor(index + 2), password });
      people[personName] = await login(seeded.phone, password);
      phones[personName] = seeded.phone;
    }
    tokens.MANAGER = people.Manager;
    tokens.CASHIER = people.Counter;
    tokens.WAITER = people['Khuman Singh'];
    const owner = tokens.OWNER;
    const manager = tokens.MANAGER;

    // Caffeza's GSTIN, from setup/caffeza.json, so a printed bill reads as a tax invoice.
    ok(await request('PATCH', '/api/v1/restaurant', { token: owner, body: { gstin: '24AARFT4546K1ZM' } }), 'gstin');

    ok(
      await request('PATCH', '/api/v1/settings', {
        token: owner,
        body: {
          reason: 'Caffeza setup',
          business: { businessDayStartsAtMinutes: 300 },
          ...(invoiceSeries ? { invoice: { mode: 'PREFIX', prefix: 'CFA/C/', startingNumber: 22442 } } : {}),
          features: { inventory: false, attendance: false },
          // P19: Caffeza records guests on every table; every golden dine-in order already does.
          floor: { requireGuestCount: true, longOpenMinutes: 90 },
        },
      }),
      'settings',
    );

    const stationIds = {};
    for (const [index, stationName] of STATIONS.entries()) {
      stationIds[stationName] = ok(
        await request('POST', '/api/v1/stations', { token: owner, body: { name: stationName, displayOrder: index } }),
        'station',
      ).id;
    }

    const categoryIds = {};
    for (const [index, [categoryName, stationName]] of Object.entries(CATEGORIES).entries()) {
      const categoryId = ok(
        await request('POST', '/api/v1/categories', {
          token: owner,
          body: { name: categoryName, displayOrder: index },
        }),
        'category',
      ).id;
      // A category is routed to its station by an update, as in the menu builder (P05).
      ok(
        await request('PATCH', `/api/v1/categories/${categoryId}`, {
          token: owner,
          body: { stationId: stationIds[stationName] },
        }),
        'category station',
      );
      categoryIds[categoryName] = categoryId;
    }

    const items = {};
    for (const [itemName, priceInPaise, categoryName] of MENU) {
      items[itemName] = ok(
        await request('POST', '/api/v1/menu-items', {
          token: owner,
          body: { name: itemName, priceInPaise, taxRateBps: 500, categoryId: categoryIds[categoryName] },
        }),
        'menu item',
      ).id;
    }

    for (const [index, method] of PLATFORM_METHODS.entries()) {
      ok(
        await request('POST', '/api/v1/payment-methods', {
          token: owner,
          body: {
            ...method,
            kind: 'PLATFORM',
            displayOrder: 3 + index,
            // A commission is frozen onto each payment, so it is set before the day starts.
            ...(commissions[method.code] !== undefined ? { commissionBps: commissions[method.code] } : {}),
          },
        }),
        'payment method',
      );
    }

    const accounts = {};
    for (const accountName of ['E-210 Office', 'W-330 Office']) {
      accounts[accountName] = ok(
        await request('POST', '/api/v1/accounts', { token: manager, body: { name: accountName } }),
        'account',
      ).id;
    }

    const tables = {};
    for (const [index, tableName] of TABLES.entries()) {
      tables[tableName] = ok(
        await request('POST', '/api/v1/tables', { token: owner, body: { name: tableName, displayOrder: index } }),
        'table',
      ).id;
    }

    return {
      restaurant,
      branch,
      tokens,
      people,
      phones,
      password,
      ids: { bills: {}, orders: {}, accounts, tables, items, stations: stationIds, categories: categoryIds },
    };
  } finally {
    resetClockForTests();
  }
}

/**
 * Plays TEST-DATA section 2b through the API, in its order, with the clock at
 * each row's time, so invoice numbers run in the order bills are created.
 * Where an order must be made, marked ready or served before it is billed, that
 * happens at its billing time. Fills in `golden.ids` and returns `golden`.
 */
export async function playGoldenDay(golden) {
  const { tokens, people, ids } = golden;
  const { items, tables, accounts, bills, orders } = ids;
  const manager = tokens.MANAGER;
  const counter = tokens.CASHIER;
  const spec = Object.fromEntries(GOLDEN_BILLS.map((bill) => [bill.id, bill]));
  const kotsOf = {};
  const at = (time, date = GOLDEN_DATE) => setClockForTests(ist(time, date));

  const lineFor = (entry) => {
    const [itemName, quantity] = Array.isArray(entry) ? entry : [entry, 1];
    return { menuItemId: items[itemName], quantity };
  };

  /** Opens an order and sends it to the kitchen. */
  const open = async (id, body, entries, captain) => {
    const opened = ok(
      await request('POST', '/api/v1/orders', { token: captain, body: { ...body, lines: entries.map(lineFor) } }),
      `open ${id}`,
    );
    const fired = await fireReadyServe(captain, opened.id, opened.version);
    orders[id] = opened.id;
    kotsOf[id] = fired.kots;
    return fired.order;
  };
  const openTable = (id) => {
    const bill = spec[id];
    return open(id, { orderType: 'DINE_IN', tableId: tables[bill.table], guestCount: bill.covers }, bill.items, people[bill.captain]);
  };

  /** Readies and serves whatever is left, then bills it, then the manager's discount. */
  const billOrder = async (id, orderOf = id) => {
    const order = spec[orderOf].delivery || spec[orderOf].takeaway
      ? await readyAndServe(counter, orders[orderOf], kotsOf[orderOf])
      : await readyAndServe(people[spec[orderOf].captain], orders[orderOf], kotsOf[orderOf]);
    kotsOf[orderOf] = [];
    const bill = ok(
      await request('POST', '/api/v1/bills', { token: counter, body: { orderId: order.id, version: order.version } }),
      `bill ${id}`,
    );
    bills[id] = bill.id;
    orders[id] = order.id;
    if (spec[id].discount) {
      ok(await request('POST', `/api/v1/bills/${bill.id}/discount`, { token: manager, body: spec[id].discount }), `discount ${id}`);
    }
    return bill;
  };
  const pay = async (id) => {
    for (const [method, amountInPaise] of spec[id].payments) {
      ok(
        await request('POST', `/api/v1/bills/${bills[id]}/payments`, { token: counter, body: { method, amountInPaise } }),
        `pay ${id}`,
      );
    }
  };
  const charge = async (id) =>
    ok(
      await request('POST', `/api/v1/bills/${bills[id]}/charge-to-account`, {
        token: manager,
        body: { accountId: accounts[spec[id].onHold] },
      }),
      `charge ${id}`,
    );

  try {
    at('11:00');
    ok(
      await request('POST', '/api/v1/cash-movements', { token: manager, body: { type: 'OPENING_FLOAT', amountInPaise: 200000 } }),
      'opening float',
    );

    at('11:40'); await openTable('B01');
    at('12:30'); await billOrder('B01');
    at('12:36'); await pay('B01');
    at('13:01'); await openTable('B02');
    at('13:10'); await openTable('B03');
    at('13:52'); await billOrder('B02');
    at('13:58'); await pay('B02');
    at('14:02'); await billOrder('B03');
    at('14:09'); await pay('B03');
    at('14:20'); await openTable('B04');
    at('14:55'); await billOrder('B04');
    at('14:58'); await pay('B04');
    at('15:05'); await openTable('B05');
    at('15:50'); await billOrder('B05');
    at('15:54'); await pay('B05');
    at('16:10'); await openTable('B06');
    at('16:58'); await billOrder('B06');
    at('17:03'); await pay('B06');

    at('17:20'); await open('B07', { orderType: 'DELIVERY', platform: spec.B07.delivery }, spec.B07.items, counter);
    at('17:21'); await billOrder('B07'); await pay('B07');

    // N01: College Sandwich on Table 29, Corporate office order, approved by the Manager.
    at('17:30');
    const n01 = await open('N01', { orderType: 'DINE_IN', tableId: tables['Table 29'], guestCount: 1 }, ['College Sandwich'], people['Ranjeet Paswan']);
    at('17:55');
    ok(
      await request('POST', `/api/v1/orders/${n01.id}/no-charge`, {
        token: manager,
        body: { version: n01.version, reasonCode: 'CORPORATE_OFFICE' },
      }),
      'No Charge N01',
    );

    at('18:05');
    await open('B08', { orderType: 'DELIVERY', platform: spec.B08.delivery }, spec.B08.items, counter);
    await openTable('B09');
    at('18:06'); await billOrder('B08'); await pay('B08');
    at('18:18'); await openTable('B10');
    at('18:30'); await billOrder('B09'); await charge('B09');
    at('19:10'); await billOrder('B10'); await charge('B10');
    at('19:20'); await openTable('B11');
    at('19:40'); await openTable('B16');
    at('20:05'); await billOrder('B11');
    at('20:09');
    ok(await request('POST', `/api/v1/bills/${bills.B11}/void`, { token: manager, body: { reasonCode: 'WRONG_TABLE' } }), 'void B11');
    at('20:11'); await billOrder('B12', 'B11');
    at('20:15'); await pay('B12');

    at('20:30');
    let b13 = await open('B13', { orderType: 'DINE_IN', tableId: tables['Table 11'], guestCount: 3 }, ['Thecha Paneer Chilli', ...spec.B13.items], people['Khuman Singh']);
    at('20:40'); await billOrder('B16');
    at('20:46'); await pay('B16');

    // B13: Cheesy Tornado entered by mistake and never sent; Thecha Paneer Chilli made and sent back.
    const khuman = people['Khuman Singh'];
    at('20:50');
    b13 = ok(
      await request('POST', `/api/v1/orders/${orders.B13}/lines`, { token: khuman, body: { version: b13.version, lines: [lineFor('Cheesy Tornado')] } }),
      'add Cheesy Tornado',
    );
    const tornado = b13.lines.find((line) => line.itemName === 'Cheesy Tornado');
    b13 = ok(
      await request('POST', `/api/v1/orders/${orders.B13}/lines/${tornado.id}/cancel`, {
        token: khuman,
        body: { version: b13.version, reasonCode: 'WRONG_ITEM' },
      }),
      'cancel Cheesy Tornado',
    );
    at('21:00');
    const thecha = b13.lines.find((line) => line.itemName === 'Thecha Paneer Chilli');
    ok(
      await request('POST', `/api/v1/orders/${orders.B13}/lines/${thecha.id}/cancel`, {
        token: khuman,
        body: { version: b13.version, reasonCode: 'MODIFICATION', wasPrepared: true },
      }),
      'cancel Thecha',
    );

    at('21:10'); await open('B15', { orderType: 'TAKEAWAY' }, spec.B15.items, counter);
    at('21:12'); await billOrder('B15');
    at('21:13'); await pay('B15');

    at('21:30');
    const paidOut = ok(
      await request('POST', '/api/v1/cash-movements', {
        token: manager,
        body: { type: 'PAID_OUT', amountInPaise: 35000, reason: 'Milk from the dairy' },
      }),
      'paid out',
    );
    ids.paidOut = paidOut.id;

    at('21:40'); await billOrder('B13');
    at('21:44'); await pay('B13');
    at('22:51'); await openTable('B14');
    at('23:55'); await billOrder('B14');
    at('00:02', '2026-09-27'); await pay('B14');

    return golden;
  } finally {
    resetClockForTests();
  }
}

/**
 * Builds the whole golden day: `setupGoldenRestaurant` then `playGoldenDay`.
 * `commissions` sets a platform method's rate before any payment, for example
 * `{ SWIGGY: 2000 }`. Returns the tokens by role and by captain name, the
 * restaurant, and the ids of everything created, keyed by TEST-DATA's names
 * (B01 to B16, N01, the accounts, the tables).
 */
export async function buildGoldenDay(options = {}) {
  return playGoldenDay(await setupGoldenRestaurant(options));
}

/**
 * TEST-DATA section 5, the next day: W-330 Office pays ₹504.00 in cash at
 * 1:15 PM on 27 September, and a dine-in bill of ₹420.00 is issued at 5:00 PM
 * and left unpaid. Returns the new bill.
 */
export async function addNextDay(golden) {
  const next = '2026-09-27';
  const { tokens, people, ids } = golden;
  try {
    setClockForTests(ist('13:15', next));
    ok(
      await request('POST', `/api/v1/accounts/${ids.accounts['W-330 Office']}/collections`, {
        token: tokens.CASHIER,
        body: { method: 'CASH', amountInPaise: 50400 },
      }),
      'W-330 collection',
    );

    setClockForTests(ist('16:20', next));
    const captain = people['Khuman Singh'];
    const opened = ok(
      await request('POST', '/api/v1/orders', {
        token: captain,
        body: {
          orderType: 'DINE_IN',
          tableId: ids.tables['Table 5'],
          guestCount: 2,
          lines: [{ menuItemId: ids.items['Mexican Bowl'], quantity: 1 }],
        },
      }),
      'open 27 Sep order',
    );
    const fired = await fireReadyServe(captain, opened.id, opened.version);
    setClockForTests(ist('17:00', next));
    const order = await readyAndServe(captain, opened.id, fired.kots);
    const bill = ok(
      await request('POST', '/api/v1/bills', { token: tokens.CASHIER, body: { orderId: order.id, version: order.version } }),
      'bill 27 Sep',
    );
    ids.bills.NEXT = bill.id;
    ids.orders.NEXT = order.id;
    return bill;
  } finally {
    resetClockForTests();
  }
}
