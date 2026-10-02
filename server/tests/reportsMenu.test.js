/**
 * The menu, captain and table reports, R11 to R13, against the golden day. P16.
 *
 * Built once and 26 September closed, as in P15. Every expected number comes
 * from docs/TEST-DATA.md; none is adjusted to fit.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import ExcelJS from 'exceljs';
import mongoose from 'mongoose';

import { Bill } from '../models/Bill.js';
import { ALL_MODELS } from '../models/index.js';
import { menuC5 } from '../services/reports/definitions/menu.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { buildGoldenDay, GOLDEN_DATE, ist } from './helpers/goldenDay.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

let golden;
let baseUrl;

before(async () => {
  await startTestDatabase();
  baseUrl = await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  golden = await buildGoldenDay({ name: 'Cafezza' });

  setClockForTests(ist('09:00', '2026-09-27'));
  const close = await request('POST', '/api/v1/day-close', {
    token: golden.tokens.MANAGER,
    body: { businessDate: GOLDEN_DATE, countedCashInPaise: 340000, note: 'Four rupees short' },
  });
  assert.equal(close.status, 201, JSON.stringify(close.body));
  resetClockForTests();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

afterEach(() => resetClockForTests());

const day = `from=${GOLDEN_DATE}&to=${GOLDEN_DATE}`;

async function report(name, query = day, token = golden.tokens.OWNER) {
  const response = await request('GET', `/api/v1/reports/v2/${name}?${query}`, { token });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}

const row = (rows, name) => rows.find((entry) => entry.name === name);
const section = (data, key) => data.sections.find((entry) => entry.key === key);

async function workbookRows(name, query = day) {
  const response = await fetch(`${baseUrl}/api/v1/reports/v2/${name}?${query}&format=xlsx`, {
    headers: { Authorization: `Bearer ${golden.tokens.OWNER}` },
  });
  assert.equal(response.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const rows = [];
  book.getWorksheet('Report').eachRow((sheetRow) => rows.push(sheetRow.values.slice(1)));
  return rows;
}

async function userIdOf(token) {
  const me = await request('GET', '/api/v1/auth/me', { token });
  return me.body.data.user.id;
}

// ---------------------------------------------------------------------------

const CATEGORIES = [
  ['Pizza', 5, 181000, 922, 180078, 7104, 2026],
  ['Cafezza Mains', 4, 170000, 4518, 165482, 8275, 1862],
  ['Italian Coffees', 6, 138000, 1411, 136589, 5729, 1537],
  ['Deconstructed Bowls', 3, 120000, 2016, 117984, 5899, 1328],
  ['Cafezza Shakes', 4, 132000, 14719, 117281, 3217, 1320],
  ['Pasta', 1, 43000, 0, 43000, 2150, 484],
  ['Accompaniments', 5, 40000, 1612, 38388, 1920, 432],
  ['Bhel 2.0', 2, 36000, 2261, 33739, 1687, 380],
  ['Dessert', 1, 32000, 3200, 28800, 1440, 324],
  ['Sandwiches & Wraps', 1, 17500, 6931, 10569, 0, 119],
  ['Cold Beverages', 2, 9522, 0, 9522, 476, 107],
  ['Assorted Teas', 1, 9000, 4500, 4500, 225, 51],
  ['Extras', 1, 3000, 300, 2700, 135, 30],
];

describe('R11 Menu Performance', () => {
  it('matches the category table in TEST-DATA section 4 to the paisa, in rank order', async () => {
    const data = await report('menu');
    assert.equal(data.report, 'R11');
    assert.deepEqual(data.openDays, []);
    assert.equal(data.columns[0].label, 'Category');
    assert.deepEqual(data.rows.map((entry) => entry.name), CATEGORIES.map(([name]) => name));
    for (const [name, quantity, itemTotal, discount, net, gst] of CATEGORIES) {
      const entry = row(data.rows, name);
      assert.deepEqual(
        [entry.quantity, entry.itemTotalInPaise, entry.discountInPaise, entry.netSalesInPaise, entry.gstInPaise],
        [quantity, itemTotal, discount, net, gst],
        name,
      );
    }
    assert.equal(data.totals.quantity, 36);
    assert.equal(data.totals.itemTotalInPaise, 931022);
    assert.equal(data.totals.discountInPaise, 42390);
    assert.equal(data.totals.netSalesInPaise, 888632);
    assert.equal(data.totals.gstInPaise, 38257);
    assert.equal(row(data.rows, 'Pizza').rank, 1);
    assert.deepEqual(row(data.rows, 'Pizza').drill.netSalesInPaise, {
      report: 'R19', query: { from: GOLDEN_DATE, to: GOLDEN_DATE, categoryName: 'Pizza' },
    });
  });

  it('the share column adds up to exactly 100.00%, with Pizza at 20.26%', async () => {
    const data = await report('menu');
    for (const [name, , , , , , share] of CATEGORIES) assert.equal(row(data.rows, name).shareBps, share, name);
    assert.equal(data.rows.reduce((sum, entry) => sum + entry.shareBps, 0), 10000);
    assert.equal(data.totals.shareBps, 10000);
  });

  it('leaves the voided B11 out, and shows cancelled items only as cancelled quantity and wasted value', async () => {
    const pizza = await report('menu', `${day}&categoryName=Pizza`);
    assert.equal(pizza.columns[0].label, 'Item');
    assert.equal(row(pizza.rows, 'Piri Piri Paneer Pizza').quantity, 1);
    const tornado = row(pizza.rows, 'Cheesy Tornado');
    assert.equal(tornado.quantity, 2);
    assert.equal(tornado.cancelledQuantity, 1);
    assert.equal(tornado.wastedValueInPaise, 0);

    const mains = await report('menu', `${day}&categoryName=${encodeURIComponent('Cafezza Mains')}`);
    const thecha = row(mains.rows, 'Thecha Paneer Chilli');
    assert.deepEqual([thecha.quantity, thecha.itemTotalInPaise, thecha.cancelledQuantity, thecha.wastedValueInPaise], [0, 0, 1, 39000]);
    assert.equal(mains.totals.itemTotalInPaise, 170000);

    const categories = await report('menu');
    assert.equal(categories.totals.cancelledQuantity, 2);
    assert.equal(categories.totals.wastedValueInPaise, 39000);
    for (const check of [...pizza.checks, ...mains.checks, ...categories.checks]) assert.equal(check.passed, true, check.message);
  });

  it('moving Mexican Bowl to another category afterwards changes nothing for 26 September', async () => {
    const before = await report('menu');
    const category = await request('POST', '/api/v1/categories', {
      token: golden.tokens.OWNER,
      body: { name: 'Bowls Moved', displayOrder: 99 },
    });
    assert.equal(category.status, 201, JSON.stringify(category.body));
    const moved = await request('PATCH', `/api/v1/menu-items/${golden.ids.items['Mexican Bowl']}`, {
      token: golden.tokens.OWNER,
      body: { categoryId: category.body.data.id },
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    const after = await report('menu');
    assert.deepEqual(after.rows, before.rows);
    assert.equal(row(after.rows, 'Bowls Moved'), undefined);
  });

  it('a bill from before P03, with no shares and no category, is its own Not recorded row and C5 still passes', async () => {
    const source = await Bill.findOne({ restaurantId: golden.restaurant._id, billNumber: 'CFA/C/22444' }).lean();
    const oldBill = {
      ...source,
      _id: new mongoose.Types.ObjectId(),
      orderId: new mongoose.Types.ObjectId(),
      billNumber: 'OLD/1',
      billSequence: 999999,
      invoiceSeries: 'OLD/',
      lines: source.lines.map((line) => ({ ...line, categoryId: null, categoryName: null, discountShareInPaise: null, taxableInPaise: null, taxInPaise: null })),
    };
    await Bill.collection.insertOne(oldBill);
    try {
      const data = await report('menu');
      const notRecorded = row(data.rows, 'Not recorded');
      assert.deepEqual(
        [notRecorded.quantity, notRecorded.itemTotalInPaise, notRecorded.netSalesInPaise, notRecorded.shareBps],
        [3, 101000, null, null],
      );
      assert.equal(data.totals.itemTotalInPaise, 931022 + 101000);
      assert.equal(data.totals.netSalesInPaise, 888632);
      assert.equal(data.rows.reduce((sum, entry) => sum + (entry.shareBps ?? 0), 0), 10000);
      for (const id of ['C5.1', 'C5.2']) assert.equal(data.checks.find((check) => check.id === id).passed, true, id);
    } finally {
      await Bill.collection.deleteOne({ _id: oldBill._id });
    }
  });
});

// ---------------------------------------------------------------------------

describe('R12 Captains', () => {
  it('matches the captain table in TEST-DATA section 4, and its totals equal R3', async () => {
    const data = await report('captains');
    const expected = [
      ['Khuman Singh', 4, 11, 260461, 273500],
      ['Budha Singh', 3, 7, 266071, 279300],
      ['Devendra Singh', 3, 6, 142100, 149300],
      ['Ranjeet Paswan', 2, 3, 52500, 55100],
      ['Counter', 3, 0, 167500, 169700],
    ];
    for (const [name, bills, covers, net, total] of expected) {
      const entry = row(data.rows, name);
      assert.deepEqual([entry.billCount, entry.covers, entry.netSalesInPaise, entry.billTotalInPaise], [bills, covers, net, total], name);
    }
    const r3 = await report('sales-by-day');
    assert.equal(data.totals.billCount, r3.totals.billCount);
    assert.equal(data.totals.covers, r3.totals.covers);
    assert.equal(data.totals.netSalesInPaise, r3.totals.netSalesInPaise);
    assert.equal(data.totals.billTotalInPaise, 926900);
    assert.equal(data.totals.billTotalInPaise, r3.totals.billTotalInPaise);
    assert.deepEqual(data.checks.map((check) => [check.id, check.passed]), [['C5.3', true]]);
  });

  it('average table time is minutes from opened to paid on paid dine-in bills only', async () => {
    const data = await report('captains');
    assert.equal(row(data.rows, 'Khuman Singh').averageTableTime, 6050);
    assert.equal(row(data.rows, 'Budha Singh').averageTableTime, 5900);
    assert.equal(row(data.rows, 'Devendra Singh').averageTableTime, 5300);
    assert.equal(row(data.rows, 'Ranjeet Paswan').averageTableTime, null);
    assert.equal(row(data.rows, 'Counter').averageTableTime, null);
    assert.equal(data.totals.averageTableTime, 5780);
  });

  it('counts the items each person cancelled: Khuman Singh, 2 items, ₹750.00', async () => {
    const data = await report('captains');
    const khuman = row(data.rows, 'Khuman Singh');
    assert.equal(khuman.cancelledCount, 2);
    assert.equal(khuman.cancelledValueInPaise, 75000);
    assert.equal(data.totals.cancelledCount, 2);
  });

  it('renaming Khuman Singh afterwards does not change 26 September', async () => {
    const id = await userIdOf(golden.people['Khuman Singh']);
    const renamed = await request('PATCH', `/api/v1/users/${id}`, { token: golden.tokens.OWNER, body: { name: 'Khuman S. Rathore' } });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    try {
      const data = await report('captains');
      assert.ok(row(data.rows, 'Khuman Singh'));
      assert.equal(row(data.rows, 'Khuman S. Rathore'), undefined);
    } finally {
      await request('PATCH', `/api/v1/users/${id}`, { token: golden.tokens.OWNER, body: { name: 'Khuman Singh' } });
    }
  });
});

// ---------------------------------------------------------------------------

describe('R13 Tables and Table Time', () => {
  const TABLE_TIMES = {
    'Table 5': 56, 'Table 7': 57, 'Table 12': 59, 'Table 2': 38, 'Table 3': 49,
    'Table 14': 53, 'Table 16': 55, 'Table 11': 74, 'Table 4': 71, 'Table 18': 66,
  };

  it('table times for the ten paid dine-in bills, 578 minutes, average 57.8', async () => {
    const data = await report('tables');
    const tables = section(data, 'tables');
    for (const [name, minutes] of Object.entries(TABLE_TIMES)) {
      assert.equal(row(tables.rows, name).averageTableTime, minutes * 100, name);
    }
    assert.equal(Object.values(TABLE_TIMES).reduce((sum, minutes) => sum + minutes, 0), 578);
    assert.equal(tables.totals.averageTableTime, 5780);
    assert.equal(tables.totals.billCount, 12);
    assert.equal(tables.totals.turnsPerDay, 1200);
    assert.deepEqual(data.checks.map((check) => [check.id, check.passed]), [['C5.4', true]]);
  });

  it('Table 16 shows one bill, B12; the voided B11 is not counted', async () => {
    const tables = section(await report('tables'), 'tables');
    const table16 = row(tables.rows, 'Table 16');
    assert.equal(table16.billCount, 1);
    assert.equal(table16.netSalesInPaise, 33000);
    assert.equal(table16.turnsPerDay, 100);
  });

  it('Tables 30 and 35 show their On Hold bills and net sales but no table time', async () => {
    const tables = section(await report('tables'), 'tables');
    assert.deepEqual([row(tables.rows, 'Table 30').billCount, row(tables.rows, 'Table 30').netSalesInPaise, row(tables.rows, 'Table 30').averageTableTime], [1, 48000, null]);
    assert.deepEqual([row(tables.rows, 'Table 35').billCount, row(tables.rows, 'Table 35').netSalesInPaise, row(tables.rows, 'Table 35').averageTableTime], [1, 4500, null]);
  });

  it('the kitchen panel averages minutes from fired to ready, per station, with the slowest items', async () => {
    const data = await report('tables');
    const kitchen = section(data, 'kitchen');
    assert.deepEqual(kitchen.rows.map((entry) => entry.name), ['Beverages', 'Live Kitchen']);
    for (const entry of kitchen.rows) assert.ok(entry.kitchenTime > 0 && entry.itemsMade > 0, entry.name);
    const slowest = section(data, 'slowestItems');
    for (const station of ['Beverages', 'Live Kitchen']) {
      const items = slowest.rows.filter((entry) => entry.station === station);
      assert.ok(items.length > 0 && items.length <= 5, station);
      for (let index = 1; index < items.length; index += 1) assert.ok(items[index - 1].kitchenTime >= items[index].kitchenTime);
    }
  });
});

// ---------------------------------------------------------------------------

describe('Checks and export', () => {
  it('C5 fails with ₹1,800.78 missing when the Pizza group is left out', async () => {
    const data = await report('menu');
    const whole = { itemTotalInPaise: data.totals.itemTotalInPaise, netSalesInPaise: data.totals.netSalesInPaise };
    assert.equal(menuC5(1, data.rows, whole).passed, true);
    const broken = menuC5(1, data.rows.filter((entry) => entry.name !== 'Pizza'), { ...whole, itemTotalInPaise: whole.itemTotalInPaise - 181000 });
    assert.equal(broken.passed, false);
    assert.equal(broken.difference, -180078);
    assert.match(broken.message, /₹1,800\.78 is missing/);
  });

  it('each report\'s Excel export opens and its totals equal the JSON', async () => {
    const menu = await report('menu');
    const menuRows = await workbookRows('menu');
    const menuTotal = menuRows.find((cells) => cells[0] === 'Total');
    assert.equal(menuTotal[2], menu.totals.itemTotalInPaise / 100);
    assert.equal(menuTotal[4], menu.totals.netSalesInPaise / 100);

    const captains = await report('captains');
    const captainTotal = (await workbookRows('captains')).find((cells) => cells[0] === 'Total');
    assert.equal(captainTotal[1], captains.totals.billCount);
    assert.equal(captainTotal[4], captains.totals.billTotalInPaise / 100);

    const tables = await report('tables');
    const tableRows = await workbookRows('tables');
    assert.ok(tableRows.some((cells) => cells[0] === 'Total' && cells[1] === section(tables, 'tables').totals.billCount));
  });

  it('only OWNER and MANAGER may read them', async () => {
    for (const name of ['menu', 'captains', 'tables']) {
      assert.equal((await request('GET', `/api/v1/reports/v2/${name}?${day}`, { token: golden.tokens.MANAGER })).status, 200, name);
      assert.equal((await request('GET', `/api/v1/reports/v2/${name}?${day}`, { token: golden.tokens.CASHIER })).status, 403, name);
      assert.equal((await request('GET', `/api/v1/reports/v2/${name}?${day}`, { token: golden.tokens.WAITER })).status, 403, name);
    }
  });
});
