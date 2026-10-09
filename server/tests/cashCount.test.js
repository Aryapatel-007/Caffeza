/**
 * P25 Part F: cash counted by notes and coins.
 * docs/API-CONTRACT.md M16 section 8 and M10 section 5.1.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ALL_MODELS } from '../models/index.js';
import { DEFAULT_DENOMINATIONS } from '../models/Restaurant.js';
import { CashCountError, sumCashCount } from '../utils/money.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { buildGoldenDay, ist } from './helpers/goldenDay.js';
import { readyToBillOrder, seedFloor } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const GOLDEN_DATE = '2026-09-26';
let golden;

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  golden = await buildGoldenDay({ name: 'Cafezza' });
});

after(async () => {
  resetClockForTests();
  await stopTestServer();
  await stopTestDatabase();
});

describe('sumCashCount', () => {
  it('totals a count on the server, largest first, dropping zeros', () => {
    const { totalInPaise, cashCount } = sumCashCount(
      [
        { valueInPaise: 20000, count: 2 },
        { valueInPaise: 50000, count: 6 },
        { valueInPaise: 100, kind: 'COIN', count: 0 },
      ],
      DEFAULT_DENOMINATIONS,
    );
    assert.equal(totalInPaise, 340000);
    assert.deepEqual(cashCount, [
      { valueInPaise: 50000, kind: 'NOTE', count: 6 },
      { valueInPaise: 20000, kind: 'NOTE', count: 2 },
    ]);
  });

  it('refuses an inactive or unknown value, a negative count, a fraction, and a ₹20 that is not said to be a note or a coin', () => {
    const refuses = (count, pattern) => assert.throws(() => sumCashCount(count, DEFAULT_DENOMINATIONS), (error) => error instanceof CashCountError && pattern.test(error.message));
    refuses([{ valueInPaise: 200000, count: 1 }], /not a note or coin/);
    refuses([{ valueInPaise: 30000, count: 1 }], /not a note or coin/);
    refuses([{ valueInPaise: 50000, count: -1 }], /whole number/);
    refuses([{ valueInPaise: 50000, count: 1.5 }], /whole number/);
    refuses([{ valueInPaise: 2000, count: 3 }], /note or a coin/);
    refuses([{ valueInPaise: 50000, count: 1 }, { valueInPaise: 50000, count: 2 }], /counted twice/);
    assert.equal(sumCashCount([{ valueInPaise: 2000, kind: 'COIN', count: 3 }], DEFAULT_DENOMINATIONS).totalInPaise, 6000);
  });
});

describe('the golden day closed with a count by notes', () => {
  it('closes 26 September on 6 × ₹500 and 2 × ₹200: ₹3,400.00 counted, ₹4.00 short, the count kept, and blind for a manager', async () => {
    setClockForTests(ist('09:00', '2026-09-27'));
    try {
      const mismatch = await request('POST', '/api/v1/day-close', {
        token: golden.tokens.MANAGER,
        body: { businessDate: GOLDEN_DATE, countedCashInPaise: 345000, cashCount: [{ valueInPaise: 50000, count: 6 }, { valueInPaise: 20000, count: 2 }], note: 'x' },
      });
      assert.equal(mismatch.status, 422);
      assert.equal(mismatch.body.error.code, 'CASH_COUNT_MISMATCH');

      const close = await request('POST', '/api/v1/day-close', {
        token: golden.tokens.MANAGER,
        body: { businessDate: GOLDEN_DATE, cashCount: [{ valueInPaise: 50000, count: 6 }, { valueInPaise: 20000, count: 2 }], note: 'Four rupees short, coins' },
      });
      assert.equal(close.status, 201, JSON.stringify(close.body));
      assert.equal(close.body.data.countedCashInPaise, 340000);
      assert.deepEqual(close.body.data.cashCount, [
        { valueInPaise: 50000, kind: 'NOTE', count: 6 },
        { valueInPaise: 20000, kind: 'NOTE', count: 2 },
      ]);
      // The blind count: the manager's own count, never the expected figure.
      assert.equal('expectedCashInPaise' in close.body.data, false);
      assert.equal('differenceInPaise' in close.body.data, false);

      const owner = (await request('GET', `/api/v1/day-close/${GOLDEN_DATE}`, { token: golden.tokens.OWNER })).body.data;
      assert.equal(owner.differenceInPaise, -400);
      assert.equal(owner.history.at(-1).cashCount.length, 2);

      const print = (await request('GET', `/api/v1/day-close/${GOLDEN_DATE}/print?width=48`, { token: golden.tokens.OWNER })).body.data;
      assert.match(print.text, /500\.00 note x 6\s+3,000\.00/);
      assert.match(print.text, /200\.00 note x 2\s+400\.00/);

      const r7 = (await request('GET', `/api/v1/reports/v2/cash-till?from=${GOLDEN_DATE}&to=${GOLDEN_DATE}`, { token: golden.tokens.OWNER })).body.data;
      // P29: R7's days are its first section.
      assert.equal(r7.sections.find((section) => section.key === 'days').rows[0].cashCountText, '6 × ₹500.00 note, 2 × ₹200.00 note');
      const r2 = (await request('GET', `/api/v1/reports/v2/day-close?date=${GOLDEN_DATE}`, { token: golden.tokens.OWNER })).body.data;
      const cash = r2.sections.find((section) => section.key === 'cash');
      assert.ok(cash.rows.some((row) => row.line === '6 × ₹500.00 note' && row.amountInPaise === 300000), JSON.stringify(cash.rows));
    } finally {
      resetClockForTests();
    }
  });
});

describe('the opening float and a cash payment', () => {
  it('records a float counted by notes, and refuses a count that disagrees with its total', async () => {
    const floor = await seedFloor();
    const float = await request('POST', '/api/v1/cash-movements', {
      token: floor.tokens.CASHIER,
      body: { type: 'OPENING_FLOAT', cashCount: [{ valueInPaise: 10000, count: 15 }, { valueInPaise: 1000, kind: 'COIN', count: 5 }] },
    });
    assert.equal(float.status, 201, JSON.stringify(float.body));
    assert.equal(float.body.data.amountInPaise, 155000);
    assert.equal(float.body.data.cashCount.length, 2);

    const other = await seedFloor();
    const wrong = await request('POST', '/api/v1/cash-movements', {
      token: other.tokens.CASHIER,
      body: { type: 'OPENING_FLOAT', amountInPaise: 200000, cashCount: [{ valueInPaise: 10000, count: 15 }] },
    });
    assert.equal(wrong.status, 422);
    assert.equal(wrong.body.error.code, 'CASH_COUNT_MISMATCH');
    const paidOut = await request('POST', '/api/v1/cash-movements', {
      token: other.tokens.MANAGER,
      body: { type: 'PAID_OUT', reason: 'Milk', cashCount: [{ valueInPaise: 10000, count: 1 }] },
    });
    assert.equal(paidOut.status, 400);
  });

  it('records what went on the bill and the change, never the cash handed over', async () => {
    const floor = await seedFloor();
    const order = await readyToBillOrder(floor);
    const bill = (await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: order.id, version: order.version } })).body.data;
    const amount = bill.grandTotalInPaise;
    const notes = Math.ceil(amount / 50000);
    const tendered = notes * 50000;

    const short = await request('POST', `/api/v1/bills/${bill.id}/payments`, {
      token: floor.tokens.CASHIER,
      body: { method: 'CASH', amountInPaise: amount, tender: { tenderedInPaise: amount - 100, changeInPaise: 0 } },
    });
    assert.equal(short.status, 422);
    const wrongChange = await request('POST', `/api/v1/bills/${bill.id}/payments`, {
      token: floor.tokens.CASHIER,
      body: { method: 'CASH', amountInPaise: amount, tender: { cashCount: [{ valueInPaise: 50000, count: notes }], tenderedInPaise: tendered, changeInPaise: 1 } },
    });
    assert.equal(wrongChange.status, 422);
    const onCard = await request('POST', `/api/v1/bills/${bill.id}/payments`, {
      token: floor.tokens.CASHIER,
      body: { method: 'CARD', amountInPaise: amount, tender: { tenderedInPaise: tendered, changeInPaise: tendered - amount } },
    });
    assert.equal(onCard.status, 400);

    const paid = await request('POST', `/api/v1/bills/${bill.id}/payments`, {
      token: floor.tokens.CASHIER,
      body: { method: 'CASH', amountInPaise: amount, tender: { cashCount: [{ valueInPaise: 50000, count: notes }], tenderedInPaise: tendered, changeInPaise: tendered - amount } },
    });
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    const payment = paid.body.data.payments[0];
    assert.equal(payment.amountInPaise, amount);
    assert.deepEqual(payment.tender, { cashCount: [{ valueInPaise: 50000, kind: 'NOTE', count: notes }], tenderedInPaise: tendered, changeInPaise: tendered - amount });
    assert.equal(paid.body.data.amountPaidInPaise, amount);
  });
});

describe('the denominations setting', () => {
  it('is the owner’s, replaces the list, and refuses a duplicate or a list with nothing on', async () => {
    const floor = await seedFloor();
    const me = (await request('GET', '/api/v1/auth/me', { token: floor.tokens.CASHIER })).body.data;
    assert.ok(me.cash.denominations.some((entry) => entry.valueInPaise === 50000 && entry.kind === 'NOTE'));
    assert.equal(me.cash.denominations.some((entry) => entry.valueInPaise === 200000), false);

    const patch = (token, denominations) => request('PATCH', '/api/v1/settings', { token, body: { reason: 'Notes', cash: { denominations } } });
    assert.equal((await patch(floor.tokens.MANAGER, [{ valueInPaise: 50000, kind: 'NOTE' }])).status, 403);
    assert.equal((await patch(floor.tokens.OWNER, [{ valueInPaise: 50000, kind: 'NOTE' }, { valueInPaise: 50000, kind: 'NOTE' }])).status, 400);
    assert.equal((await patch(floor.tokens.OWNER, [{ valueInPaise: 50000, kind: 'NOTE', isActive: false }])).status, 400);
    const ok = await patch(floor.tokens.OWNER, [{ valueInPaise: 50000, kind: 'NOTE' }, { valueInPaise: 100, kind: 'COIN' }]);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.cash.denominations.length, 2);
  });
});
