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
  { id: 'B08', delivery: { code: 'ZOMATO', orderId: '6912345001' }, captain: 'Counter', opened: '18:05', billed: '18:06', paid: '18:06',
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

async function login(phone) {
  return ok(
    await request('POST', '/api/v1/auth/login', { body: { phone, password: DEFAULT_PASSWORD } }),
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

/**
 * Builds the whole golden day. Returns the tokens by role and by captain name,
 * the restaurant, and the ids of everything created, keyed by TEST-DATA's
 * names (B01 to B16, N01, the accounts, the tables).
 */
export async function buildGoldenDay({ name = 'Caffeza' } = {}) {
  setClockForTests(ist('09:00'));
  try {
    const base = await seedFullRestaurant({ name, ownerName: 'Owner' });
    const { restaurant, branch } = base;
    const tokens = { OWNER: await login(base.phone) };
    const people = { Owner: tokens.OWNER };
    for (const [personName, role] of [
      ['Manager', ROLES.MANAGER],
      ['Counter', ROLES.CASHIER],
      ['Khuman Singh', ROLES.WAITER],
      ['Budha Singh', ROLES.WAITER],
      ['Devendra Singh', ROLES.WAITER],
      ['Ranjeet Paswan', ROLES.WAITER],
    ]) {
      const seeded = await seedUser({ restaurant, branch, name: personName, role });
      people[personName] = await login(seeded.phone);
    }
    tokens.MANAGER = people.Manager;
    tokens.CASHIER = people.Counter;
    tokens.WAITER = people['Khuman Singh'];
    const owner = tokens.OWNER;
    const manager = tokens.MANAGER;
    const counter = tokens.CASHIER;

    ok(
      await request('PATCH', '/api/v1/settings', {
        token: owner,
        body: {
          reason: 'Caffeza setup',
          business: { businessDayStartsAtMinutes: 300 },
          invoice: { mode: 'PREFIX', prefix: 'CFA/C/', startingNumber: 22442 },
          features: { inventory: false, attendance: false },
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
          body: { ...method, kind: 'PLATFORM', displayOrder: 3 + index },
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

    setClockForTests(ist('11:00'));
    ok(
      await request('POST', '/api/v1/cash-movements', {
        token: counter,
        body: { type: 'OPENING_FLOAT', amountInPaise: 200000 },
      }),
      'opening float',
    );

    const lineFor = (entry) => {
      const [itemName, quantity] = Array.isArray(entry) ? entry : [entry, 1];
      return { menuItemId: items[itemName], quantity };
    };

    const bills = {};
    const orders = {};

    for (const spec of GOLDEN_BILLS) {
      let order;

      if (spec.sameOrderAs) {
        order = ok(await request('GET', `/api/v1/orders/${orders[spec.sameOrderAs]}`, { token: counter }), 'reread');
      } else {
        const captain = people[spec.captain];
        setClockForTests(ist(spec.opened));
        const body = spec.delivery
          ? { orderType: 'DELIVERY', platform: spec.delivery }
          : spec.takeaway
            ? { orderType: 'TAKEAWAY' }
            : { orderType: 'DINE_IN', tableId: tables[spec.table], guestCount: spec.covers };
        const opened = ok(
          await request('POST', '/api/v1/orders', {
            token: captain,
            body: {
              ...body,
              lines: [...spec.items, ...(spec.cancelled ? ['Thecha Paneer Chilli'] : [])].map(lineFor),
            },
          }),
          `open ${spec.id}`,
        );
        const fired = await fireReadyServe(captain, opened.id, opened.version);
        let current = fired.order;

        if (spec.cancelled) {
          // B13: Thecha Paneer Chilli made and sent back; Cheesy Tornado entered by mistake, never fired.
          setClockForTests(ist('20:50'));
          current = ok(
            await request('POST', `/api/v1/orders/${opened.id}/lines`, {
              token: captain,
              body: { version: current.version, lines: [lineFor('Cheesy Tornado')] },
            }),
            'add Cheesy Tornado',
          );
          const thecha = current.lines.find((line) => line.itemName === 'Thecha Paneer Chilli');
          current = ok(
            await request('POST', `/api/v1/orders/${opened.id}/lines/${thecha.id}/cancel`, {
              token: captain,
              body: { version: current.version, reasonCode: 'MODIFICATION', wasPrepared: true },
            }),
            'cancel Thecha',
          );
          const tornado = current.lines.find((line) => line.itemName === 'Cheesy Tornado');
          current = ok(
            await request('POST', `/api/v1/orders/${opened.id}/lines/${tornado.id}/cancel`, {
              token: captain,
              body: { version: current.version, reasonCode: 'WRONG_ITEM' },
            }),
            'cancel Cheesy Tornado',
          );
        }

        setClockForTests(ist(spec.billed));
        order = await readyAndServe(captain, opened.id, fired.kots);
        orders[spec.id] = order.id;
      }

      setClockForTests(ist(spec.billed));
      const bill = ok(
        await request('POST', '/api/v1/bills', {
          token: counter,
          body: { orderId: order.id, version: order.version },
        }),
        `bill ${spec.id}`,
      );
      bills[spec.id] = bill.id;
      orders[spec.id] = order.id;

      if (spec.discount) {
        ok(
          await request('POST', `/api/v1/bills/${bill.id}/discount`, { token: manager, body: spec.discount }),
          `discount ${spec.id}`,
        );
      }

      if (spec.voidAt) {
        setClockForTests(ist(spec.voidAt));
        ok(
          await request('POST', `/api/v1/bills/${bill.id}/void`, {
            token: manager,
            body: { reasonCode: 'WRONG_TABLE' },
          }),
          `void ${spec.id}`,
        );
        continue;
      }

      setClockForTests(ist(spec.paid, spec.paidNextDay ? '2026-09-27' : GOLDEN_DATE));
      if (spec.onHold) {
        ok(
          await request('POST', `/api/v1/bills/${bill.id}/charge-to-account`, {
            token: manager,
            body: { accountId: accounts[spec.onHold] },
          }),
          `charge ${spec.id}`,
        );
      }
      for (const [method, amountInPaise] of spec.payments ?? []) {
        ok(
          await request('POST', `/api/v1/bills/${bill.id}/payments`, {
            token: counter,
            body: { method, amountInPaise },
          }),
          `pay ${spec.id}`,
        );
      }
    }

    // N01: College Sandwich on Table 29, Corporate office order, approved by the Manager.
    setClockForTests(ist('19:30'));
    const n01 = ok(
      await request('POST', '/api/v1/orders', {
        token: people['Ranjeet Paswan'],
        body: {
          orderType: 'DINE_IN',
          tableId: tables['Table 29'],
          guestCount: 2,
          lines: [lineFor('College Sandwich')],
        },
      }),
      'open N01',
    );
    const n01Fired = await fireReadyServe(people['Ranjeet Paswan'], n01.id, n01.version);
    setClockForTests(ist('19:45'));
    ok(
      await request('POST', `/api/v1/orders/${n01.id}/no-charge`, {
        token: manager,
        body: { version: n01Fired.order.version, reasonCode: 'CORPORATE_OFFICE' },
      }),
      'No Charge N01',
    );
    orders.N01 = n01.id;

    setClockForTests(ist('21:30'));
    const paidOut = ok(
      await request('POST', '/api/v1/cash-movements', {
        token: manager,
        body: { type: 'PAID_OUT', amountInPaise: 35000, reason: 'Milk from the dairy' },
      }),
      'paid out',
    );

    return {
      restaurant,
      branch,
      tokens,
      people,
      ids: { bills, orders, accounts, tables, items, paidOut: paidOut.id },
    };
  } finally {
    resetClockForTests();
  }
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
