/**
 * P25 Part J: closed days as Tally vouchers. docs/API-CONTRACT.md M21 section 9,
 * the prompt's J9 list.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import { AuditLog } from '../models/AuditLog.js';
import { IntegrationConnection } from '../models/IntegrationConnection.js';
import { ALL_MODELS } from '../models/index.js';
import { TallyExport } from '../models/TallyExport.js';
import { buildDay, ledgersOf, redoConfirmationFor } from '../services/integrations/tally/exportService.js';
import { PROFILES } from '../services/integrations/tally/profiles.js';
import { SIDES, sideTotal, unbalanced, vouchersFromRecords } from '../services/integrations/tally/vouchers.js';
import { escapeXml, parseTallyResponse, toTallyXml } from '../services/integrations/tally/xml.js';
import { paiseToDecimalText } from '../utils/money.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { addNextDay, buildGoldenDay, GOLDEN_DATE, ist } from './helpers/goldenDay.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const FIXTURES = new URL('./fixtures/tally/', import.meta.url);
let golden;

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  golden = await buildGoldenDay({ name: 'Tally Cafe' });
  await connectTally(golden);
  await closeDay(golden, GOLDEN_DATE, ist('09:00', '2026-09-27'));
});

after(async () => {
  resetClockForTests();
  await stopTestServer();
  await stopTestDatabase();
});

function mappingFor(world, overrides = {}) {
  return {
    salesByRate: { 500: 'Sales @ 5%' },
    platformSales: 'Sales, aggregator, section 9(5)',
    cgst: 'Output CGST',
    sgst: 'Output SGST',
    roundOff: 'Round Off',
    paymentMethods: { CASH: 'Cash', CARD: 'Card', UPI: 'UPI', ZOMATO_GOLD: 'Zomato Gold', DINEOUT: 'Dineout', EAZYDINER: 'EazyDiner', ZOMATO: 'Zomato', SWIGGY: 'Swiggy' },
    onHold: { mode: 'PER_ACCOUNT', byAccount: { [world.ids.accounts['E-210 Office']]: 'E-210 Office', [world.ids.accounts['W-330 Office']]: 'W-330 Office' } },
    paidOut: 'Petty Expenses',
    paidIn: 'Petty Cash Received',
    ...overrides,
  };
}

async function connectTally(world, { ledgers = mappingFor(world), granularity = 'DAILY_SUMMARY' } = {}) {
  const saved = await request('PUT', '/api/v1/integrations/TALLY', {
    token: world.tokens.OWNER,
    body: { environment: 'PRODUCTION', config: { version: 'TALLY_PRIME', companyName: 'Tally Cafe & Co', granularity, ledgers } },
  });
  assert.ok([200, 201].includes(saved.status), JSON.stringify(saved.body));
  const tested = await request('POST', '/api/v1/integrations/TALLY/test', { token: world.tokens.OWNER });
  assert.equal(tested.status, 200, JSON.stringify(tested.body));
}

async function closeDay(world, businessDate, at) {
  setClockForTests(at);
  try {
    const close = await request('POST', '/api/v1/day-close', {
      token: world.tokens.OWNER,
      body: { businessDate, countedCashInPaise: 340000, note: 'Counted for the Tally test' },
    });
    assert.equal(close.status, 201, JSON.stringify(close.body));
  } finally {
    resetClockForTests();
  }
}

const reqOf = (world) => ({ restaurantId: String(world.restaurant._id), branchId: String(world.branch._id), user: { id: null } });
const connectionOf = (world) => IntegrationConnection.findOne({ restaurantId: world.restaurant._id, provider: 'TALLY' }).lean();

/** `{ ledger: paise }` for one side of a voucher. */
const sideOf = (voucher, side) => Object.fromEntries(voucher.entries.filter((entry) => entry.side === side).map((entry) => [entry.ledger, entry.amountInPaise]));

describe('the golden day, 26 September, as one daily summary', () => {
  it('credits sales, GST and round-off, debits each method and each account, both ₹9,269.00', async () => {
    const { vouchers, missing } = await buildDay(reqOf(golden), await connectionOf(golden), GOLDEN_DATE, { batchId: 'T1' });
    assert.deepEqual(missing, []);
    const sales = vouchers.filter((voucher) => voucher.kind === 'SALES');
    assert.equal(sales.length, 1);
    assert.deepEqual(sideOf(sales[0], SIDES.CREDIT), {
      'Sales @ 5%': 765132,
      'Sales, aggregator, section 9(5)': 123500,
      'Output CGST': 19131,
      'Output SGST': 19126,
      'Round Off': 11,
    });
    assert.deepEqual(sideOf(sales[0], SIDES.DEBIT), {
      Cash: 175400,
      Card: 148100,
      UPI: 147200,
      'Zomato Gold': 199800,
      Dineout: 77800,
      Zomato: 30500,
      Swiggy: 93000,
      'E-210 Office': 4700,
      'W-330 Office': 50400,
    });
    assert.equal(sideTotal(sales[0], SIDES.DEBIT), 926900);
    assert.equal(sideTotal(sales[0], SIDES.CREDIT), 926900);
    assert.match(sales[0].narration, /ERP export 26 Sep 2026, batch T1$/);
  });

  it('writes the paid out as a payment voucher: Petty Expenses ₹350.00 against Cash', async () => {
    const { vouchers } = await buildDay(reqOf(golden), await connectionOf(golden), GOLDEN_DATE);
    const payments = vouchers.filter((voucher) => voucher.kind === 'PAYMENT');
    assert.equal(payments.length, 1);
    assert.deepEqual(sideOf(payments[0], SIDES.DEBIT), { 'Petty Expenses': 35000 });
    assert.deepEqual(sideOf(payments[0], SIDES.CREDIT), { Cash: 35000 });
    assert.equal(vouchers.filter((voucher) => voucher.kind === 'RECEIPT').length, 0);
  });

  it('per bill: 15 sales vouchers numbered by invoice, B11 left out, together equal to the summary', async () => {
    const connection = await connectionOf(golden);
    const perBill = await buildDay(reqOf(golden), { ...connection, config: { ...connection.config, granularity: 'PER_BILL' } }, GOLDEN_DATE);
    const summary = await buildDay(reqOf(golden), connection, GOLDEN_DATE);
    const sales = perBill.vouchers.filter((voucher) => voucher.kind === 'SALES');
    assert.equal(sales.length, 15);
    assert.ok(sales.every((voucher) => /^CFA\/C\/\d+$/.test(voucher.number)));
    assert.equal(sales.some((voucher) => voucher.number === 'CFA/C/22452'), false, 'B11, voided, is not exported');
    assert.equal(unbalanced(sales), null);

    const added = {};
    for (const voucher of sales) {
      for (const entry of voucher.entries) added[`${entry.side}:${entry.ledger}`] = (added[`${entry.side}:${entry.ledger}`] ?? 0) + entry.amountInPaise;
    }
    const whole = Object.fromEntries(summary.vouchers[0].entries.map((entry) => [`${entry.side}:${entry.ledger}`, entry.amountInPaise]));
    // Round-off can fall on both sides bill by bill; its net is the summary's.
    const net = (map, ledger) => (map[`CREDIT:${ledger}`] ?? 0) - (map[`DEBIT:${ledger}`] ?? 0);
    assert.equal(net(added, 'Round Off'), net(whole, 'Round Off'));
    for (const key of Object.keys(whole).filter((key) => !key.endsWith(':Round Off'))) assert.equal(added[key], whole[key], key);
  });

  it('matches the stored XML for each version profile', async () => {
    const connection = await connectionOf(golden);
    const { vouchers } = await buildDay(reqOf(golden), connection, GOLDEN_DATE, { batchId: 'SNAPSHOT' });
    for (const [version, profile] of Object.entries(PROFILES)) {
      const xml = toTallyXml(vouchers, profile, connection.config.companyName);
      const file = new URL(`golden-${version}.xml`, FIXTURES);
      if (process.env.UPDATE_TALLY_SNAPSHOTS === '1') writeFileSync(file, xml);
      assert.equal(xml, readFileSync(file, 'utf8'), `${version} XML changed`);
      assert.match(xml, /<SVCURRENTCOMPANY>Tally Cafe &amp; Co<\/SVCURRENTCOMPANY>/);
      assert.match(xml, /<LEDGERNAME>Cash<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>-1754\.00<\/AMOUNT>/);
      assert.match(xml, /<LEDGERNAME>Round Off<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>0\.11<\/AMOUNT>/);
    }
  });
});

describe('the builder on its own', () => {
  const VOUCHER_TYPES = { sales: 'Sales', receipt: 'Receipt', payment: 'Payment', journal: 'Journal' };
  const LEDGERS = {
    salesByRate: { 500: 'Sales @ 5%', 1800: 'Sales @ 18%' },
    platformSales: 'Platform sales',
    cgst: 'CGST',
    sgst: 'SGST',
    roundOff: 'Round Off',
    paymentMethods: { CASH: 'Cash', UPI: 'UPI', CARD: 'Card' },
    onHold: { mode: 'ONE', ledger: 'On Hold' },
    paidOut: 'Petty Expenses',
    paidIn: 'Petty Cash Received',
  };
  const build = (records, extra = {}) => vouchersFromRecords(records, { businessDate: '2026-09-26', ledgers: LEDGERS, voucherTypes: VOUCHER_TYPES, batchId: 'B', ...extra });

  it('puts a negative round-off on the debit side', () => {
    const bill = {
      billNumber: 'X/1',
      grandTotalInPaise: 10500,
      roundOffInPaise: -42,
      taxBreakdown: [{ taxRateBps: 500, taxableInPaise: 10040, cgstInPaise: 251, sgstInPaise: 251 }],
      payments: [{ method: 'CASH', methodName: 'Cash', amountInPaise: 10500 }],
    };
    const { vouchers } = build({ bills: [bill] });
    assert.deepEqual(sideOf(vouchers[0], SIDES.DEBIT), { Cash: 10500, 'Round Off': 42 });
    assert.equal(sideOf(vouchers[0], SIDES.CREDIT)['Round Off'], undefined);
    assert.equal(unbalanced(vouchers), null);
  });

  it('escapes & and < in ledger names, narrations and the company', () => {
    const vouchers = [{ kind: 'SALES', voucherTypeName: 'Sales', date: '2026-09-26', number: 'A<1>', narration: 'Tom & Jerry <cafe>', entries: [
      { ledger: 'Sales & Service <5%>', side: SIDES.CREDIT, amountInPaise: 100 },
      { ledger: 'Cash', side: SIDES.DEBIT, amountInPaise: 100 },
    ] }];
    const xml = toTallyXml(vouchers, PROFILES.TALLY_PRIME, 'R&D <Cafe>');
    assert.match(xml, /<LEDGERNAME>Sales &amp; Service &lt;5%&gt;<\/LEDGERNAME>/);
    assert.match(xml, /<NARRATION>Tom &amp; Jerry &lt;cafe&gt;<\/NARRATION>/);
    assert.match(xml, /<SVCURRENTCOMPANY>R&amp;D &lt;Cafe&gt;<\/SVCURRENTCOMPANY>/);
    assert.match(xml, /<VOUCHERNUMBER>A&lt;1&gt;<\/VOUCHERNUMBER>/);
    assert.equal(xml.includes('Sales & Service'), false);
    assert.equal(escapeXml(`a"b'c`), 'a&quot;b&apos;c');
  });

  it('writes rupees with two decimals by integer arithmetic', () => {
    assert.equal(paiseToDecimalText(175400), '1754.00');
    assert.equal(paiseToDecimalText(-11), '-0.11');
    assert.equal(paiseToDecimalText(5), '0.05');
    assert.equal(paiseToDecimalText(0), '0.00');
    assert.throws(() => paiseToDecimalText(1.5));
  });

  it('names every head with an amount and no ledger', () => {
    const bill = {
      billNumber: 'X/2',
      grandTotalInPaise: 11800,
      roundOffInPaise: 0,
      taxBreakdown: [{ taxRateBps: 1200, taxableInPaise: 10536, cgstInPaise: 632, sgstInPaise: 632 }],
      payments: [{ method: 'SWIGGY', methodName: 'Swiggy', amountInPaise: 11800 }],
    };
    const { missing } = build({ bills: [bill] });
    assert.deepEqual(missing.sort(), ['Payment method Swiggy', 'Sales at 12%']);
  });

  it('balances every voucher on 1,000 seeded random days', () => {
    let seed = 20260926;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = (list) => list[Math.floor(random() * list.length)];
    const methods = [['CASH', 'Cash'], ['UPI', 'UPI'], ['CARD', 'Card']];
    for (let day = 0; day < 1000; day += 1) {
      const bills = [];
      for (let index = 0; index < 1 + Math.floor(random() * 25); index += 1) {
        const platform = random() < 0.15;
        const slabs = (platform ? [0] : [...new Set([pick([500, 1800]), pick([500, 1800])])]).map((rate) => {
          const taxable = 1 + Math.floor(random() * 300000);
          const tax = Math.round((taxable * rate) / 10000);
          return { taxRateBps: rate, taxableInPaise: taxable, cgstInPaise: Math.ceil(tax / 2), sgstInPaise: tax - Math.ceil(tax / 2) };
        });
        const exact = slabs.reduce((total, slab) => total + slab.taxableInPaise + slab.cgstInPaise + slab.sgstInPaise, 0);
        const grand = Math.max(100, Math.round(exact / 100) * 100);
        const charged = random() < 0.1 ? Math.floor(random() * grand) : 0;
        let left = grand - charged;
        const payments = [];
        while (left > 0) {
          const amount = random() < 0.6 ? left : 1 + Math.floor(random() * left);
          const [method, methodName] = pick(methods);
          payments.push({ method, methodName, amountInPaise: amount });
          left -= amount;
        }
        bills.push({
          billNumber: `R/${day}/${index}`,
          taxTreatment: platform ? 'PLATFORM_COLLECTS' : 'STANDARD',
          grandTotalInPaise: grand,
          roundOffInPaise: grand - exact,
          taxBreakdown: slabs,
          payments,
          chargedToAccountInPaise: charged || null,
        });
      }
      const ledgers = { ...LEDGERS, salesByRate: { 0: 'Sales @ 0%', 500: 'Sales @ 5%', 1800: 'Sales @ 18%' } };
      const records = {
        bills,
        collections: [{ method: 'CASH', methodName: 'Cash', amountInPaise: 1 + Math.floor(random() * 50000), accountName: 'Office' }],
        cashMovements: [{ type: pick(['PAID_OUT', 'PAID_IN']), amountInPaise: 1 + Math.floor(random() * 50000), reason: 'Milk' }],
      };
      for (const granularity of ['DAILY_SUMMARY', 'PER_BILL']) {
        const { vouchers, missing } = vouchersFromRecords(records, { businessDate: '2026-09-26', ledgers, voucherTypes: VOUCHER_TYPES, granularity });
        assert.deepEqual(missing, [], `day ${day}`);
        assert.equal(unbalanced(vouchers), null, `day ${day} ${granularity}`);
      }
    }
  });

  it('reads Tally answers defensively: line errors fail, counts compared, anything else unknown', () => {
    assert.deepEqual(parseTallyResponse('<RESPONSE><CREATED>3</CREATED><ALTERED>0</ALTERED><ERRORS>0</ERRORS></RESPONSE>', 3).status, 'POSTED');
    assert.equal(parseTallyResponse('<RESPONSE><CREATED>2</CREATED><ERRORS>1</ERRORS><LINEERROR>Ledger &apos;X&apos; does not exist!</LINEERROR></RESPONSE>', 3).status, 'PARTIAL');
    assert.equal(parseTallyResponse('<RESPONSE><CREATED>0</CREATED><ERRORS>1</ERRORS></RESPONSE>', 1).status, 'FAILED');
    assert.equal(parseTallyResponse('<RESPONSE><CREATED>2</CREATED><ERRORS>0</ERRORS></RESPONSE>', 3).status, 'UNKNOWN');
    assert.equal(parseTallyResponse('<HTML>Hello</HTML>', 3).status, 'UNKNOWN');
    assert.equal(parseTallyResponse('', 3).status, 'UNKNOWN');
  });

  it('lists each mapped ledger once, under its parent group', () => {
    const ledgers = ledgersOf({ ...LEDGERS, paymentMethods: { CASH: 'Cash', OTHER: 'Cash' }, parentGroups: { payment: 'Cash-in-Hand' } });
    assert.equal(ledgers.filter((ledger) => ledger.name === 'Cash').length, 1);
    assert.equal(ledgers.find((ledger) => ledger.name === 'Cash').parent, 'Cash-in-Hand');
    assert.equal(ledgers.find((ledger) => ledger.name === 'CGST').parent, 'Duties & Taxes');
  });
});

describe('exports through the API', () => {
  const exportsOf = (token, body) => request('POST', '/api/v1/integrations/tally/exports', { token, body });
  const day = { from: GOLDEN_DATE, to: GOLDEN_DATE };

  it('refuses an open day, a cashier, and an unmapped head', async () => {
    const open = await exportsOf(golden.tokens.OWNER, { from: GOLDEN_DATE, to: '2026-09-28' });
    assert.equal(open.status, 422);
    assert.equal(open.body.error.code, 'DAY_NOT_CLOSED');
    assert.deepEqual(open.body.error.businessDates, ['2026-09-27', '2026-09-28']);

    assert.equal((await exportsOf(golden.tokens.CASHIER, day)).status, 403);

    const mapping = mappingFor(golden);
    const { SWIGGY: _swiggy, ...withoutSwiggy } = mapping.paymentMethods;
    await connectTally(golden, { ledgers: { ...mapping, paymentMethods: withoutSwiggy } });
    const unmapped = await exportsOf(golden.tokens.MANAGER, day);
    assert.equal(unmapped.status, 422);
    assert.equal(unmapped.body.error.code, 'TALLY_MAPPING_INCOMPLETE');
    assert.deepEqual(unmapped.body.error.missing, ['Payment method Swiggy']);
    assert.equal(await TallyExport.countDocuments({ restaurantId: golden.restaurant._id }), 0);
    await connectTally(golden);
  });

  it('builds, downloads, refuses a second export, and redoes only for the owner with the sentence', async () => {
    const built = await exportsOf(golden.tokens.MANAGER, day);
    assert.equal(built.status, 201, JSON.stringify(built.body));
    const [row] = built.body.data;
    assert.equal(row.status, 'BUILT');
    assert.equal(row.voucherCount, 2);
    assert.equal(row.debitInPaise, row.creditInPaise);
    assert.equal(row.debitInPaise, 926900 + 35000);
    assert.equal(row.xml, undefined);

    const download = await request('GET', `/api/v1/integrations/tally/exports/${row.id}/file`, { token: golden.tokens.MANAGER });
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-type'), /application\/xml/);
    assert.match(download.headers.get('content-disposition'), /attachment; filename="tally-2026-09-26-/);
    assert.match(download.body.raw, /<TALLYREQUEST>Import Data<\/TALLYREQUEST>/);
    assert.equal((await TallyExport.findOne({ restaurantId: golden.restaurant._id, _id: row.id }).lean()).status, 'DOWNLOADED');

    const again = await exportsOf(golden.tokens.OWNER, day);
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'TALLY_ALREADY_EXPORTED');

    const redo = (token, confirmation) => request('POST', `/api/v1/integrations/tally/exports/${row.id}/redo`, { token, body: { confirmation } });
    const sentence = redoConfirmationFor(GOLDEN_DATE);
    assert.equal(sentence, 'I have deleted the vouchers for 26 Sep 2026 from Tally.');
    assert.equal((await redo(golden.tokens.MANAGER, sentence)).status, 403);
    assert.equal((await redo(golden.tokens.OWNER, 'I have deleted them')).status, 400);
    const redone = await redo(golden.tokens.OWNER, sentence);
    assert.equal(redone.status, 201, JSON.stringify(redone.body));
    assert.equal(redone.body.data.redoneFromId, row.id);
    assert.equal((await TallyExport.findOne({ restaurantId: golden.restaurant._id, _id: row.id }).lean()).status, 'STALE');
    const audit = await AuditLog.findOne({ restaurantId: golden.restaurant._id, action: 'TALLY_EXPORT_REDONE' }).lean();
    assert.equal(audit.entityLabel, GOLDEN_DATE);

    const days = await request('GET', `/api/v1/integrations/tally/days?from=${GOLDEN_DATE}&to=2026-09-27`, { token: golden.tokens.MANAGER });
    assert.equal(days.status, 200);
    assert.deepEqual(days.body.data.map((entry) => [entry.businessDate, entry.closed, entry.export?.status ?? null]), [[GOLDEN_DATE, true, 'BUILT'], ['2026-09-27', false, null]]);
  });

  it('gives the owner the ledger masters, and not the manager', async () => {
    assert.equal((await request('GET', '/api/v1/integrations/tally/ledger-masters/file', { token: golden.tokens.MANAGER })).status, 403);
    const masters = await request('GET', '/api/v1/integrations/tally/ledger-masters/file', { token: golden.tokens.OWNER });
    assert.equal(masters.status, 200);
    assert.match(masters.body.raw, /<LEDGER NAME="Output CGST" ACTION="Create">\s*<NAME>Output CGST<\/NAME>\s*<PARENT>Duties &amp; Taxes<\/PARENT>/);
  });

  it('27 September, after the collection: a receipt voucher, Cash ₹504.00 against W-330 Office', async () => {
    const next = await addNextDay(golden);
    setClockForTests(ist('17:05', '2026-09-27'));
    const paid = await request('POST', `/api/v1/bills/${next.id}/payments`, { token: golden.tokens.CASHIER, body: { method: 'CASH', amountInPaise: next.grandTotalInPaise } });
    resetClockForTests();
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    await closeDay(golden, '2026-09-27', ist('09:00', '2026-09-28'));

    const { vouchers } = await buildDay(reqOf(golden), await connectionOf(golden), '2026-09-27');
    const receipts = vouchers.filter((voucher) => voucher.kind === 'RECEIPT');
    assert.equal(receipts.length, 1);
    assert.deepEqual(sideOf(receipts[0], SIDES.DEBIT), { Cash: 50400 });
    assert.deepEqual(sideOf(receipts[0], SIDES.CREDIT), { 'W-330 Office': 50400 });
    assert.equal(unbalanced(vouchers), null);
  });

  it('marks a reopened day\'s exports STALE', async () => {
    const reopened = await request('POST', `/api/v1/day-close/${GOLDEN_DATE}/reopen`, { token: golden.tokens.OWNER, body: { reason: 'A bill was wrong' } });
    assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
    const rows = await TallyExport.find({ restaurantId: golden.restaurant._id, businessDate: GOLDEN_DATE }).lean();
    assert.ok(rows.length >= 2);
    assert.ok(rows.every((row) => row.status === 'STALE'));
  });
});

describe('a day with an item cancelled after billing (Part E)', () => {
  it('leaves the voided bill out, exports the new one, and balances', async () => {
    const world = await buildGoldenDay({ name: 'Tally Cancel Cafe' });
    const b05 = (await request('GET', `/api/v1/bills/${world.ids.bills.B05}`, { token: world.tokens.OWNER })).body.data;
    const shake = b05.lines.find((line) => line.itemName.includes('Ferrero'));
    setClockForTests(ist('23:30'));
    const cancelled = await request('POST', `/api/v1/bills/${b05.id}/cancel-lines`, {
      token: world.tokens.MANAGER,
      body: { lines: [{ lineId: shake.orderLineId, wasPrepared: true }], reasonCode: 'MODIFICATION' },
    });
    resetClockForTests();
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    const newNumber = cancelled.body.data.bill.billNumber;
    await connectTally(world);
    await closeDay(world, GOLDEN_DATE, ist('09:00', '2026-09-27'));

    const connection = await connectionOf(world);
    const perBill = await buildDay(reqOf(world), { ...connection, config: { ...connection.config, granularity: 'PER_BILL' } }, GOLDEN_DATE);
    const numbers = perBill.vouchers.filter((voucher) => voucher.kind === 'SALES').map((voucher) => voucher.number);
    assert.equal(numbers.includes(b05.billNumber), false);
    assert.ok(numbers.includes(newNumber));
    assert.equal(unbalanced(perBill.vouchers), null);

    const summary = await buildDay(reqOf(world), connection, GOLDEN_DATE);
    assert.equal(unbalanced(summary.vouchers), null);
    assert.equal(sideOf(summary.vouchers[0], SIDES.DEBIT).Cash, 175400 - 34600);
    assert.equal(sideTotal(summary.vouchers[0], SIDES.DEBIT), 926900 - 34600);
  });
});
