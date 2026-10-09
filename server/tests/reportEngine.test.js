/**
 * The M19 report engine, the completed checks, R19 Bill List and the Excel
 * export. P14.
 *
 * Two golden day restaurants are built once, through the API. The checks are
 * each broken on purpose, on a stored document, and restored straight after:
 * the second half of every check's test, and the half that matters.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, afterEach, before, describe, it } from 'node:test';

import ExcelJS from 'exceljs';
import { z } from 'zod';

import * as clientLabels from '../../client/src/features/reports/labels.js';
import { AccountEntry } from '../models/AccountEntry.js';
import { Bill } from '../models/Bill.js';
import { ALL_MODELS } from '../models/index.js';
import { computeDayFigures } from '../services/dayFiguresService.js';
import {
  checkC5,
  checkC9,
  runDayChecks,
  runRangeChecks,
} from '../services/reconciliationService.js';
import { runReport } from '../services/reports/engine.js';
import { LABELS, LABEL_VALUES } from '../services/reports/labels.js';
import { reportQuery } from '../services/reports/params.js';
import { REPORTS } from '../services/reports/registry.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { addNextDay, buildGoldenDay, GOLDEN_DATE, ist } from './helpers/goldenDay.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLOSSARY = readFileSync(path.resolve(SERVER_DIR, '..', 'docs', 'GLOSSARY.md'), 'utf8');

let golden;
let other;
let baseUrl;

const asReq = (day = golden) => ({
  restaurantId: String(day.restaurant._id),
  branchId: String(day.branch._id),
  user: { id: 'test', role: 'OWNER' },
  currentRestaurant: day.restaurant,
});

before(async () => {
  await startTestDatabase();
  baseUrl = await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  golden = await buildGoldenDay({ name: 'Cafezza' });
  other = await buildGoldenDay({ name: 'Other Cafe' });
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

afterEach(() => resetClockForTests());

const bills = (query, token = golden.tokens.OWNER) =>
  request('GET', `/api/v1/reports/v2/bills?from=${GOLDEN_DATE}&to=${GOLDEN_DATE}&limit=200${query ? `&${query}` : ''}`, { token });

const billByNumber = (number, day = golden) => Bill.findOne({ restaurantId: day.restaurant._id, billNumber: number });

async function withBroken(number, change, run) {
  const original = (await billByNumber(number)).toObject();
  await Bill.collection.updateOne({ _id: original._id }, change);
  try {
    return await run();
  } finally {
    await Bill.collection.replaceOne({ _id: original._id }, original);
  }
}

async function dayChecks() {
  const figures = await computeDayFigures(asReq(), GOLDEN_DATE);
  return runDayChecks(asReq(), GOLDEN_DATE, figures, { countedCashInPaise: 340000 });
}

const failing = (checks) => checks.filter((check) => !check.passed).map((check) => check.id);
const failingErrors = (checks) => failing(checks).filter((id) => id !== 'C9');

/** A small definition used only here, shaped like R3, so the engine can be tested on its own. */
const testDefinition = {
  id: 'RT',
  name: 'test',
  title: 'Test report',
  roles: ['OWNER'],
  schema: reportQuery(['orderType']),
  filters: ['orderType'],
  dimensions: ['orderType'],
  columns: [
    { key: 'businessDate', label: LABELS.BUSINESS_DATE, type: 'date' },
    { key: 'billTotalInPaise', label: LABELS.BILL_TOTAL, type: 'money' },
  ],
  async query(req, baseMatch, params) {
    const match = { ...baseMatch, ...(params.orderType ? { orderType: params.orderType } : {}) };
    const rows = await Bill.aggregate([
      { $match: match },
      { $group: { _id: '$businessDate', billTotalInPaise: { $sum: '$grandTotalInPaise' } } },
      { $project: { _id: 0, businessDate: '$_id', billTotalInPaise: 1 } },
    ]);
    return { rows, totals: { billTotalInPaise: rows.reduce((total, row) => total + row.billTotalInPaise, 0) } };
  },
};

// ---------------------------------------------------------------------------

describe('the engine', () => {
  it('no definition imports the MenuItem, Category, User or PaymentMethod model', () => {
    const folder = path.join(SERVER_DIR, 'services', 'reports', 'definitions');
    const offenders = [];
    for (const file of readdirSync(folder).filter((name) => name.endsWith('.js'))) {
      const text = readFileSync(path.join(folder, file), 'utf8');
      for (const model of ['MenuItem', 'Category', 'User', 'PaymentMethod']) {
        if (new RegExp(`models/${model}\\.js`).test(text)) offenders.push(`${file}: ${model}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('never includes another restaurant\'s bills', async () => {
    const mine = (await bills('')).body.data.rows;
    const theirs = (await bills('', other.tokens.OWNER)).body.data.rows;
    assert.equal(mine.length, 15);
    assert.equal(theirs.length, 15);
    const myIds = new Set(Object.values(golden.ids.bills));
    for (const row of mine) assert.ok(myIds.has(row.billId), row.billNumber);
    for (const row of theirs) assert.ok(!myIds.has(row.billId), row.billNumber);
  });

  it('writes the filter sentence exactly as the contract\'s golden day example', async () => {
    const { envelope } = await runReport(asReq(), testDefinition, { from: GOLDEN_DATE, to: GOLDEN_DATE });
    assert.equal(
      envelope.filterSentence,
      '26 Sep 2026. Business day starts 5:00 AM. All order types. Voided bills left out.',
    );
    assert.equal(envelope.totals.billTotalInPaise, 926900);

    const filtered = await runReport(asReq(), testDefinition, { from: GOLDEN_DATE, to: '2026-09-27', orderType: 'DINE_IN' });
    assert.equal(
      filtered.envelope.filterSentence,
      '26 Sep 2026 to 27 Sep 2026. Business day starts 5:00 AM. Order type: Dine-in. Voided bills left out.',
    );
  });

  it('refuses a range over 366 days, and an unknown parameter', async () => {
    const tooLong = await request('GET', '/api/v1/reports/v2/bills?from=2025-01-01&to=2026-09-26', { token: golden.tokens.OWNER });
    assert.equal(tooLong.status, 422);
    assert.equal(tooLong.body.error.code, 'RANGE_TOO_LARGE');
    const unknown = await bills('colour=red');
    assert.equal(unknown.status, 400);
  });

  it('every registered definition has a title, roles, a schema, glossary labels and checks', () => {
    for (const definition of REPORTS) {
      assert.ok(definition.id && definition.name && definition.title, definition.id);
      assert.ok(Array.isArray(definition.roles) && definition.roles.length > 0, definition.id);
      assert.ok(definition.schema instanceof z.ZodType, definition.id);
      assert.equal(typeof definition.query, 'function', definition.id);
      assert.equal(typeof definition.checks, 'function', definition.id);
      for (const column of definition.columns) assert.ok(LABEL_VALUES.includes(column.label), `${definition.id} ${column.label}`);
    }
  });

  it('every label is a glossary term, and the client mirror matches', () => {
    for (const label of LABEL_VALUES) assert.ok(GLOSSARY.includes(`**${label}**`), label);
    assert.deepEqual({ ...clientLabels.LABELS }, { ...LABELS });
  });

  it('lists 26 September as open before Day Close', async () => {
    const response = await bills('');
    assert.deepEqual(response.body.data.openDays, ['2026-09-26']);
  });
});

describe('the checks, each broken on purpose (TEST-DATA section 6)', () => {
  it('all pass on the golden day except the C9 warning', async () => {
    const checks = await dayChecks();
    assert.deepEqual(failing(checks), ['C9'], JSON.stringify(checks.filter((check) => !check.passed)));
    // P29 added C13.
    assert.equal(checks.length, 13);
  });

  it('C1 on B03 when its round-off is +60 paise', async () => {
    const checks = await withBroken('CFA/C/22444', { $set: { roundOffInPaise: 60 } }, dayChecks);
    assert.deepEqual(failingErrors(checks), ['C1']);
  });

  it('C2 on B02 when a paisa of Indian Platters\' discount share goes nowhere', async () => {
    const b02 = (await billByNumber('CFA/C/22443')).toObject();
    const lines = structuredClone(b02.lines);
    lines[0].discountShareInPaise -= 1;
    const checks = await withBroken('CFA/C/22443', { $set: { lines } }, dayChecks);
    assert.deepEqual(failingErrors(checks), ['C2']);
    const c2 = checks.find((check) => check.id === 'C2');
    assert.deepEqual(c2.refs, ['CFA/C/22443']);
    assert.match(c2.message, /^C2 Line shares: bill CFA\/C\/22443, the line shares do not add up to the bill\./);
  });

  it('C3 on 26 September and C4 on B04 when B04\'s payment is deleted but it stays PAID', async () => {
    const checks = await withBroken('CFA/C/22445', { $set: { payments: [] } }, dayChecks);
    assert.deepEqual(failingErrors(checks), ['C3', 'C4']);
  });

  it('C4 on B09 when it is marked PAID with no payment', async () => {
    const checks = await withBroken('CFA/C/22450', { $set: { status: 'PAID' } }, dayChecks);
    assert.deepEqual(failingErrors(checks), ['C4']);
  });

  it('C5 on categories, ₹1,800.78 missing, when the Pizza group is left out', async () => {
    const dayBills = await Bill.find({ restaurantId: golden.restaurant._id, businessDate: GOLDEN_DATE, isVoided: false }).lean();
    const byCategory = new Map();
    for (const line of dayBills.flatMap((bill) => bill.lines)) {
      byCategory.set(line.categoryName, (byCategory.get(line.categoryName) ?? 0) + line.taxableInPaise);
    }
    const rows = [...byCategory].map(([name, netSalesInPaise]) => ({ name, netSalesInPaise }));
    assert.equal(checkC5(1, rows, 'netSalesInPaise', 888632).passed, true);
    const broken = checkC5(1, rows.filter((row) => row.name !== 'Pizza'), 'netSalesInPaise', 888632);
    assert.equal(broken.passed, false);
    assert.equal(
      broken.message,
      'C5 Totals: the categories totals add up to ₹7,085.54, but the whole is ₹8,886.32. ₹1,800.78 is missing from one of the groups.',
    );
  });

  it('C6, number CFA/C/22452 missing, when B11 is deleted instead of voided', async () => {
    const b11 = (await billByNumber('CFA/C/22452')).toObject();
    await Bill.collection.deleteOne({ _id: b11._id });
    try {
      const checks = await dayChecks();
      assert.deepEqual(failingErrors(checks), ['C6']);
      assert.deepEqual(checks.find((check) => check.id === 'C6').refs, ['CFA/C/22452']);
    } finally {
      await Bill.collection.insertOne(b11);
    }
  });

  it('C7 on B13 when one of its lines points at the cancelled Thecha Paneer Chilli', async () => {
    const order = (await request('GET', `/api/v1/orders/${golden.ids.orders.B13}`, { token: golden.tokens.OWNER })).body.data;
    const thecha = order.lines.find((line) => line.itemName === 'Thecha Paneer Chilli');
    const b13 = (await billByNumber('CFA/C/22456')).toObject();
    const lines = structuredClone(b13.lines);
    lines[0].orderLineId = new Bill.base.Types.ObjectId(thecha.id);
    const checks = await withBroken('CFA/C/22456', { $set: { lines } }, dayChecks);
    assert.deepEqual(failingErrors(checks), ['C7']);
    assert.equal(
      checks.find((check) => check.id === 'C7').message,
      `C7 Cancelled: item Thecha Paneer Chilli on order ${order.orderNumber} was cancelled but appears on bill CFA/C/22456.`,
    );
  });

  it('C8 on B14 when its business date is stored as 2026-09-27', async () => {
    const checks = await withBroken('CFA/C/22457', { $set: { businessDate: '2026-09-27' } }, dayChecks);
    assert.deepEqual(failingErrors(checks), ['C8']);
  });

  it('C9 as an ERROR when the expected cash leaves out the paid out', async () => {
    const figures = await computeDayFigures(asReq(), GOLDEN_DATE);
    const c9 = checkC9({ ...figures.cash, expectedCashInPaise: figures.cash.expectedCashInPaise + 35000 }, 340000);
    assert.equal(c9.severity, 'ERROR');
    assert.equal(c9.passed, false);
  });

  it('C10 warns of a negative balance when W-330 Office is credited ₹600.00 more than it owes', async () => {
    const entry = await AccountEntry.create({
      restaurantId: golden.restaurant._id,
      branchId: golden.branch._id,
      accountId: golden.ids.accounts['W-330 Office'],
      type: 'COLLECTION',
      direction: 'DOWN',
      amountInPaise: 60000,
      method: 'CASH',
      businessDate: GOLDEN_DATE,
      at: ist('22:00'),
      by: golden.restaurant._id,
    });
    try {
      const [c10] = await runRangeChecks(asReq(), { from: GOLDEN_DATE, to: GOLDEN_DATE }, ['C10']);
      assert.equal(c10.passed, false);
      assert.equal(c10.severity, 'WARNING');
      assert.match(c10.message, /^C10 Account: W-330 Office shows -₹96\.00 outstanding/);

      await AccountEntry.collection.updateOne({ _id: entry._id }, { $set: { direction: 'UP' } });
      const [broken] = await runRangeChecks(asReq(), { from: GOLDEN_DATE, to: GOLDEN_DATE }, ['C10']);
      assert.equal(broken.severity, 'ERROR');
      assert.match(broken.message, /^C10 Account: W-330 Office shows ₹1,104\.00 outstanding, but its entries add up to -₹96\.00\./);
    } finally {
      await AccountEntry.collection.deleteOne({ _id: entry._id });
    }
  });

  it('C11 warns when a payout differs from what was expected', async () => {
    setClockForTests(ist('12:00', '2026-09-28'));
    const payout = await request('POST', '/api/v1/platform-payouts', {
      token: golden.tokens.MANAGER,
      body: { method: 'SWIGGY', periodFrom: GOLDEN_DATE, periodTo: GOLDEN_DATE, amountReceivedInPaise: 70000, receivedOn: '2026-09-28' },
    });
    assert.equal(payout.status, 201, JSON.stringify(payout.body));
    try {
      const [c11] = await runRangeChecks(asReq(), { from: GOLDEN_DATE, to: GOLDEN_DATE }, ['C11']);
      assert.equal(c11.passed, false);
      assert.equal(c11.severity, 'WARNING');
      assert.match(c11.message, /^C11 Platform: Swiggy paid ₹700\.00 for 0 bills against ₹0\.00 expected\. Difference ₹700\.00\. 1 payment with no commission rate set\./);
    } finally {
      await request('POST', `/api/v1/platform-payouts/${payout.body.data.id}/void`, { token: golden.tokens.OWNER, body: { reason: 'Test' } });
    }
  });

  it('C1 over 26 and 27 September reports a broken bill from each day in one result', async () => {
    await addNextDay(golden);
    const next = await Bill.findOne({ restaurantId: golden.restaurant._id, _id: golden.ids.bills.NEXT });
    const [c1] = await withBroken('CFA/C/22444', { $set: { roundOffInPaise: 60 } }, async () => {
      await Bill.collection.updateOne({ _id: next._id }, { $set: { roundOffInPaise: 60 } });
      try {
        return await runRangeChecks(asReq(), { from: GOLDEN_DATE, to: '2026-09-27' }, ['C1']);
      } finally {
        await Bill.collection.updateOne({ _id: next._id }, { $set: { roundOffInPaise: next.roundOffInPaise } });
      }
    });
    assert.equal(c1.passed, false);
    assert.deepEqual(c1.refs, ['CFA/C/22444', next.billNumber]);
  });
});

describe('R19 Bill List', () => {
  const numbers = (response) => response.body.data.rows.map((row) => row.billNumber).sort();
  const count = async (query) => (await bills(query)).body.data.rows.length;

  it('each filter on its own returns exactly the right golden day bills', async () => {
    const khuman = (await Bill.findOne({ restaurantId: golden.restaurant._id, captainName: 'Khuman Singh' })).captainId;
    const expected = {
      'orderType=DELIVERY': 2,
      'platform=SWIGGY': 1,
      [`captainId=${khuman}`]: 4,
      'table=Table%207': 1,
      'method=CASH': 3,
      'status=ON_ACCOUNT': 2,
      'status=VOIDED': 1,
      'status=PAID': 13,
      'categoryName=Pizza': 5,
      'itemName=Caffe%20Latte': 4,
      'taxRateBps=0': 2,
      'discountReason=ZOMATO_GOLD': 2,
      [`accountId=${golden.ids.accounts['E-210 Office']}`]: 1,
      'hour=20': 2,
      'weekday=6': 15,
      'weekday=1': 0,
      'hasDiscount=true': 6,
      'hasDiscount=false': 9,
      'hasCancellations=true': 1,
      'billNumber=CFA%2FC%2F22442': 1,
    };
    for (const [query, want] of Object.entries(expected)) assert.equal(await count(query), want, query);
    assert.deepEqual(numbers(await bills('status=VOIDED')), ['CFA/C/22452']);
    assert.deepEqual(numbers(await bills('hasCancellations=true')), ['CFA/C/22456']);
  });

  it('combined filters intersect', async () => {
    assert.deepEqual(numbers(await bills('method=UPI&orderType=TAKEAWAY')), ['CFA/C/22455']);
    assert.deepEqual(numbers(await bills('categoryName=Pizza&discountReason=ZOMATO_GOLD')), ['CFA/C/22457']);
  });

  it('the totals row covers every matching bill, across pages', async () => {
    const response = await request('GET', `/api/v1/reports/v2/bills?from=${GOLDEN_DATE}&to=${GOLDEN_DATE}&limit=5&page=2`, { token: golden.tokens.OWNER });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.rows.length, 5);
    assert.deepEqual(response.body.meta, { page: 2, limit: 5, total: 15 });
    assert.equal(response.body.data.totals.billCount, 15);
    assert.equal(response.body.data.totals.billTotalInPaise, 926900);
    assert.equal(response.body.data.totals.netSalesInPaise, 888632);
    assert.equal(response.body.data.totals.covers, 27);
    assert.deepEqual(response.body.data.checks.map((check) => [check.id, check.passed]), [['C1', true], ['C2', true], ['C4', true]]);
  });

  it('the bill detail shows B13\'s two cancelled items, and B14\'s payment at 12:02 AM on 26 September\'s business date', async () => {
    const b13 = (await request('GET', `/api/v1/reports/v2/bills/${golden.ids.bills.B13}`, { token: golden.tokens.OWNER })).body.data;
    const cancelled = b13.timeline.filter((event) => event.event === 'Item cancelled');
    assert.equal(cancelled.length, 2);
    assert.match(cancelled.find((event) => event.detail.includes('Thecha')).detail, /after preparation: Guest changed the order/);
    assert.match(cancelled.find((event) => event.detail.includes('Cheesy')).detail, /before preparation: Wrong item entered/);
    assert.equal(cancelled[0].by, 'Khuman Singh');

    const b14 = (await request('GET', `/api/v1/reports/v2/bills/${golden.ids.bills.B14}`, { token: golden.tokens.OWNER })).body.data;
    const payment = b14.timeline.find((event) => event.event === 'Payment');
    assert.equal(new Date(payment.at).toISOString(), '2026-09-26T18:32:00.000Z');
    assert.match(payment.detail, /business date 2026-09-26/);
    assert.equal(b14.bill.payments[0].businessDate, '2026-09-26');

    const missing = await request('GET', `/api/v1/reports/v2/bills/${other.ids.bills.B01}`, { token: golden.tokens.OWNER });
    assert.equal(missing.status, 404, 'another restaurant\'s bill is a 404');
  });

  it('is for the owner and the manager only', async () => {
    assert.equal((await bills('', golden.tokens.MANAGER)).status, 200);
    assert.equal((await bills('', golden.tokens.CASHIER)).status, 403);
    assert.equal((await bills('', golden.tokens.WAITER)).status, 403);
    assert.equal((await request('GET', `/api/v1/reports/v2/bills?from=${GOLDEN_DATE}&to=${GOLDEN_DATE}`)).status, 401);
  });
});

describe('the Excel export', () => {
  it('has the four sheets, money in rupees, and totals equal to the JSON', async () => {
    const json = (await bills('')).body.data;
    const response = await fetch(`${baseUrl}/api/v1/reports/v2/bills?from=${GOLDEN_DATE}&to=${GOLDEN_DATE}&limit=200&format=xlsx`, {
      headers: { Authorization: `Bearer ${golden.tokens.OWNER}` },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="Cafezza-R19-2026-09-26-2026-09-26.xlsx"');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
    assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Report', 'Filter', 'Definitions', 'Checks']);

    const report = workbook.getWorksheet('Report');
    const values = [];
    report.eachRow((row) => values.push(row.values.slice(1)));
    assert.equal(values[0][0], 'Bill List');
    assert.equal(values[1][0], json.filterSentence);
    const header = values.find((row) => row[0] === 'Invoice number');
    const billTotalColumn = header.indexOf('Bill total');
    const dataRows = values.slice(values.indexOf(header) + 1, -1);
    assert.equal(dataRows.length, 15);
    assert.equal(dataRows[0][billTotalColumn], json.rows[0].billTotalInPaise / 100);
    const totalRow = values.at(-1);
    assert.equal(totalRow[0], 'Total');
    assert.equal(totalRow[billTotalColumn], 9269);
    assert.equal(totalRow[billTotalColumn], json.totals.billTotalInPaise / 100);
    assert.match(report.getColumn(billTotalColumn + 1).numFmt, /##,##0\.00/);

    const checks = [];
    workbook.getWorksheet('Checks').eachRow((row) => checks.push(row.values.slice(1)));
    assert.deepEqual(checks.slice(1).map((row) => [row[0], row[2]]), [['C1', 'Passed'], ['C2', 'Passed'], ['C4', 'Passed']]);
    const definitions = [];
    workbook.getWorksheet('Definitions').eachRow((row) => definitions.push(row.values[1]));
    assert.ok(definitions.includes('Bill total'));
  });
});

describe('after Day Close', () => {
  it('lists no open day once 26 September is closed, and C12 catches a changed bill afterwards', async () => {
    setClockForTests(ist('09:00', '2026-09-27'));
    const close = await request('POST', '/api/v1/day-close', {
      token: golden.tokens.OWNER,
      body: { businessDate: GOLDEN_DATE, countedCashInPaise: 340400 },
    });
    assert.equal(close.status, 201, JSON.stringify(close.body));
    assert.deepEqual((await bills('')).body.data.openDays, []);

    const [passing] = await runRangeChecks(asReq(), { from: GOLDEN_DATE, to: GOLDEN_DATE }, ['C12']);
    assert.equal(passing.passed, true);

    const [c12] = await withBroken('CFA/C/22447', { $inc: { grandTotalInPaise: 100 } }, () =>
      runRangeChecks(asReq(), { from: GOLDEN_DATE, to: GOLDEN_DATE }, ['C12']),
    );
    assert.equal(c12.passed, false);
    assert.deepEqual(c12.refs, ['2026-09-26']);
    assert.match(c12.message, /^C12 Closed day: 2026-09-26 was closed at 2026-09-27 09:00:00 IST with bill total ₹9,269\.00\. The records now add up to ₹9,270\.00\.$/);
  });
});
