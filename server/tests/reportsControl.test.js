/**
 * The control reports, R14 to R17, against the golden day. P17 part B.
 *
 * R18 is M8's own read, tested in auditTrail.test.js. Every expected number
 * comes from docs/TEST-DATA.md; none is adjusted to fit.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import ExcelJS from 'exceljs';

import { ALL_MODELS } from '../models/index.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { addNextDay, buildGoldenDay, GOLDEN_DATE, ist } from './helpers/goldenDay.js';
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
  return response.body;
}

const section = (data, key) => data.sections.find((entry) => entry.key === key);
const row = (rows, name, key = 'name') => rows.find((entry) => entry[key] === name);

// ---------------------------------------------------------------------------

describe('R14 Discounts', () => {
  it('by reason matches TEST-DATA, and the total equals R2\'s discount', async () => {
    const { data } = await report('discounts');
    const byReason = section(data, 'byReason');
    const expected = [
      ['Zomato Gold', 2, 8690],
      ['Dineout', 1, 3900],
      ['Regular guest', 1, 5300],
      ['Staff or office', 1, 4500],
      ['Merchant promo', 1, 20000],
    ];
    assert.deepEqual(byReason.rows.map((entry) => entry.name), expected.map(([name]) => name));
    for (const [name, bills, discount] of expected) {
      assert.deepEqual([row(byReason.rows, name).billCount, row(byReason.rows, name).discountInPaise], [bills, discount], name);
    }
    assert.deepEqual([byReason.totals.billCount, byReason.totals.discountInPaise], [6, 42390]);

    const r2 = (await report('day-close', `date=${GOLDEN_DATE}`)).data;
    const discountLine = section(r2, 'sales').rows.find((entry) => entry.line === 'Discount');
    assert.equal(byReason.totals.discountInPaise, discountLine.amountInPaise);

    const byPerson = section(data, 'byPerson');
    assert.deepEqual(byPerson.rows.map((entry) => [entry.name, entry.billCount, entry.discountInPaise]), [['Manager', 6, 42390]]);
    assert.deepEqual(data.checks.map((check) => [check.id, check.passed]), [['C1', true], ['C2', true]]);
  });

  it('percent off per bill: B01 10.00%, B02 5.04%, B08 39.60%, B09 50.00%, B14 2.56%, B16 5.00%', async () => {
    const { data, meta } = await report('discounts');
    const bills = section(data, 'bills');
    const expected = {
      'CFA/C/22442': 1000, 'CFA/C/22443': 504, 'CFA/C/22449': 3960,
      'CFA/C/22450': 5000, 'CFA/C/22457': 256, 'CFA/C/22454': 500,
    };
    assert.equal(bills.rows.length, 6);
    assert.equal(meta.total, 6);
    for (const [billNumber, bps] of Object.entries(expected)) assert.equal(row(bills.rows, billNumber, 'billNumber').percentOffBps, bps, billNumber);
    assert.deepEqual(bills.columns.map((column) => column.label).filter((text) => /total/i.test(text)), ['Item total before discount', 'Bill total after discount']);
    const b08 = row(bills.rows, 'CFA/C/22449', 'billNumber');
    assert.equal(b08.reason, 'Merchant promo: TAKE200');
    assert.equal(b08.fundedBy, 'Restaurant');
  });

  it('filters by reason, and its filter sentence says so', async () => {
    const { data } = await report('discounts', `${day}&discountReason=ZOMATO_GOLD`);
    assert.equal(section(data, 'bills').rows.length, 2);
    assert.match(data.filterSentence, /Discount reason: Zomato Gold\./);
  });
});

describe('R15 Cancellations and Voids', () => {
  it('items: Thecha Paneer Chilli after preparation and Cheesy Tornado before, both by Khuman Singh; wasted ₹390.00', async () => {
    const { data } = await report('cancellations');
    const items = section(data, 'items');
    assert.equal(items.rows.length, 2);
    const thecha = row(items.rows, 'Thecha Paneer Chilli', 'itemName');
    assert.deepEqual(
      [thecha.lineTotalInPaise, thecha.stage, thecha.stageLabel, thecha.reason, thecha.cancelledByName, thecha.tableName, thecha.captainName],
      [39000, 'AFTER_PREPARATION', 'Cancelled after preparation', 'Guest changed the order', 'Khuman Singh', 'Table 11', 'Khuman Singh'],
    );
    const tornado = row(items.rows, 'Cheesy Tornado', 'itemName');
    assert.deepEqual(
      [tornado.lineTotalInPaise, tornado.stage, tornado.reason, tornado.cancelledByName],
      [36000, 'BEFORE_PREPARATION', 'Wrong item entered', 'Khuman Singh'],
    );
    assert.deepEqual(items.totals, { quantity: 2, lineTotalInPaise: 75000 });
    assert.equal(data.headline.wastedValueInPaise, 39000);
    assert.deepEqual(section(data, 'orders').rows, []);
    // P29 added C13.
    assert.deepEqual(data.checks.map((check) => [check.id, check.passed]), [['C6', true], ['C7', true], ['C13', true]]);
  });

  it('voids: CFA/C/22452, ₹347.00, Billed to the wrong table, by Manager', async () => {
    const { data } = await report('cancellations');
    const voids = section(data, 'voids');
    assert.deepEqual(
      voids.rows.map((entry) => [entry.billNumber, entry.billTotalInPaise, entry.reason, entry.voidedByName]),
      [['CFA/C/22452', 34700, 'Billed to the wrong table', 'Manager']],
    );
    assert.deepEqual(voids.totals, { count: 1, billTotalInPaise: 34700 });
  });

  it('a whole order cancelled gives its lines the order\'s reason, not a blank', async () => {
    setClockForTests(ist('11:00', '2026-09-28'));
    const captain = golden.people['Budha Singh'];
    const opened = await request('POST', '/api/v1/orders', {
      token: captain,
      body: { orderType: 'DINE_IN', tableId: golden.ids.tables['Table 2'], guestCount: 2, lines: [{ menuItemId: golden.ids.items['Masala Tea'], quantity: 2 }] },
    });
    assert.equal(opened.status, 201, JSON.stringify(opened.body));
    setClockForTests(ist('11:10', '2026-09-28'));
    const cancelled = await request('POST', `/api/v1/orders/${opened.body.data.id}/cancel`, {
      token: golden.tokens.MANAGER,
      body: { version: opened.body.data.version, reasonCode: 'GUEST_LEFT' },
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    resetClockForTests();

    const { data } = await report('cancellations', 'from=2026-09-28&to=2026-09-28');
    assert.deepEqual(section(data, 'items').rows, []);
    const orders = section(data, 'orders');
    assert.deepEqual(orders.rows.map((entry) => [entry.tableName, entry.lineTotalInPaise, entry.reason, entry.cancelledByName]), [['Table 2', 18000, 'Guest left', 'Manager']]);
    const byReason = section(data, 'byReason');
    assert.deepEqual(byReason.rows.map((entry) => [entry.name, entry.quantity, entry.lineTotalInPaise]), [['Guest left', 2, 18000]]);
  });
});

describe('R16 No Charge', () => {
  it('Table 29, College Sandwich, ₹230.00 before GST, Corporate office order, opened by Ranjeet Paswan, approved by Manager', async () => {
    const { data, meta } = await report('no-charge');
    assert.deepEqual(
      data.rows.map((entry) => [entry.tableName, entry.items, entry.valueInPaise, entry.reason, entry.requestedByName, entry.approvedByName]),
      [['Table 29', 'College Sandwich', 23000, 'Corporate office order', 'Ranjeet Paswan', 'Manager']],
    );
    assert.deepEqual(data.totals, { count: 1, valueInPaise: 23000 });
    assert.equal(meta.total, 1);
    assert.equal(data.columns.find((column) => column.key === 'valueInPaise').label, 'No Charge value, before GST');
    assert.deepEqual(data.checks.map((check) => [check.id, check.passed]), [['C7', true]]);
  });
});

describe('R17 On Hold Accounts', () => {
  it('as of 26 September: E-210 Office ₹47.00, W-330 Office ₹504.00; as of 27 September after the collection, W-330 ₹0.00', async () => {
    const before = (await report('accounts', `asOf=${GOLDEN_DATE}`)).data;
    const accounts = section(before, 'accounts');
    assert.equal(row(accounts.rows, 'E-210 Office').outstandingInPaise, 4700);
    assert.equal(row(accounts.rows, 'W-330 Office').outstandingInPaise, 50400);
    assert.equal(row(accounts.rows, 'W-330 Office').chargedInPaise, 50400);
    assert.deepEqual(before.checks.map((check) => [check.id, check.passed]), [['C10', true]]);

    await addNextDay(golden);
    const afterCollection = (await report('accounts', 'asOf=2026-09-27')).data;
    const next = section(afterCollection, 'accounts');
    assert.equal(row(next.rows, 'W-330 Office').outstandingInPaise, 0);
    assert.equal(row(next.rows, 'W-330 Office').collectedInPaise, 50400);
    const e210 = row(next.rows, 'E-210 Office');
    assert.deepEqual([e210.outstandingInPaise, e210.oldestUnpaidDate, e210.oldestUnpaidAgeDays], [4700, GOLDEN_DATE, 1]);

    // As of 26 September still reads the day as it stood then.
    assert.equal(row(section((await report('accounts', `asOf=${GOLDEN_DATE}`)).data, 'accounts').rows, 'W-330 Office').outstandingInPaise, 50400);
  });

  it('with an account, adds its statement, exactly as P09 built it', async () => {
    const accountId = golden.ids.accounts['W-330 Office'];
    const { data } = await report('accounts', `asOf=2026-09-27&accountId=${accountId}&from=${GOLDEN_DATE}&to=2026-09-27`);
    const statement = section(data, 'statement');
    assert.deepEqual(statement.rows.map((entry) => [entry.entry, entry.amountInPaise, entry.balanceInPaise]), [['Charged', 50400, 50400], ['Collected', -50400, 0]]);
  });
});

// ---------------------------------------------------------------------------

describe('Export and roles', () => {
  it('each report\'s workbook opens with its sections and totals', async () => {
    for (const [name, query] of [['discounts', day], ['cancellations', day], ['no-charge', day], ['accounts', `asOf=${GOLDEN_DATE}`]]) {
      const response = await fetch(`${baseUrl}/api/v1/reports/v2/${name}?${query}&format=xlsx`, { headers: { Authorization: `Bearer ${golden.tokens.OWNER}` } });
      assert.equal(response.status, 200, name);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
      const cells = [];
      book.getWorksheet('Report').eachRow((sheetRow) => cells.push(sheetRow.values.slice(1)));
      assert.ok(cells.some((line) => line[0] === 'Total'), name);
    }
    const noCharge = [];
    const response = await fetch(`${baseUrl}/api/v1/reports/v2/no-charge?${day}&format=xlsx`, { headers: { Authorization: `Bearer ${golden.tokens.OWNER}` } });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
    book.getWorksheet('Report').eachRow((sheetRow) => noCharge.push(sheetRow.values.slice(1)));
    assert.equal(noCharge.find((line) => line[0] === 'Total')[3], 230);
  });

  it('only OWNER and MANAGER may read them', async () => {
    for (const [name, query] of [['discounts', day], ['cancellations', day], ['no-charge', day], ['accounts', `asOf=${GOLDEN_DATE}`]]) {
      for (const [role, status] of [['OWNER', 200], ['MANAGER', 200], ['CASHIER', 403], ['WAITER', 403]]) {
        const response = await request('GET', `/api/v1/reports/v2/${name}?${query}`, { token: golden.tokens[role] });
        assert.equal(response.status, status, `${role} ${name}`);
      }
    }
  });
});
