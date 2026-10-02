/**
 * R1 Today. P18. At 6:00 PM on 26 September during the golden day.
 *
 * The fixture builds the whole day, then the clock is set back to 6:00 PM:
 * Today must show exactly what had happened by then. Every expected figure is
 * worked out from docs/TEST-DATA.md sections 2 and 3, and recorded in its
 * section 4 as "R1 at 6:00 PM".
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { ALL_MODELS } from '../models/index.js';
import { computeDayFigures } from '../services/dayFiguresService.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { buildGoldenDay, GOLDEN_DATE, ist } from './helpers/goldenDay.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

let golden;

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  golden = await buildGoldenDay({ name: 'Cafezza' });
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

afterEach(() => resetClockForTests());

async function today(token = golden.tokens.OWNER) {
  const response = await request('GET', '/api/v1/reports/v2/today', { token });
  return response;
}

const section = (data, key) => data.sections.find((entry) => entry.key === key);

describe('R1 Today at 6:00 PM on 26 September', () => {
  it('the tiles show B01 to B07 and nothing billed later', async () => {
    setClockForTests(ist('18:00'));
    const response = await today();
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const data = response.body.data;
    assert.equal(data.report, 'R1');
    assert.equal(data.date, GOLDEN_DATE);
    assert.match(data.filterSentence, /^26 Sep 2026\. Business day starts 5:00 AM\./);
    assert.deepEqual(data.openDays, [GOLDEN_DATE]);

    const [tiles] = section(data, 'tiles').rows;
    assert.deepEqual(
      {
        billTotalInPaise: tiles.billTotalInPaise,
        netSalesInPaise: tiles.netSalesInPaise,
        billCount: tiles.billCount,
        covers: tiles.covers,
        averagePerCoverInPaise: tiles.averagePerCoverInPaise,
        openTables: tiles.openTables,
        openItemTotalInPaise: tiles.openItemTotalInPaise,
        unpaidCount: tiles.unpaidCount,
        unpaidInPaise: tiles.unpaidInPaise,
        lastWeekBillTotalInPaise: tiles.lastWeekBillTotalInPaise,
      },
      {
        billTotalInPaise: 585400,
        netSalesInPaise: 561915,
        billCount: 7,
        covers: 14,
        averagePerCoverInPaise: 33494,
        openTables: 0,
        openItemTotalInPaise: 0,
        unpaidCount: 0,
        unpaidInPaise: 0,
        lastWeekBillTotalInPaise: 0,
      },
    );
    assert.deepEqual(tiles.drill.billTotalInPaise, { report: 'R19', query: { from: GOLDEN_DATE, to: GOLDEN_DATE } });
  });

  it('money so far by method, with nothing On Hold or unpaid yet', async () => {
    setClockForTests(ist('18:00'));
    const money = section((await today()).body.data, 'money');
    const amount = (line) => money.rows.find((row) => row.line === line)?.amountInPaise;
    assert.deepEqual(
      [amount('Cash'), amount('Card'), amount('UPI'), amount('Zomato Gold'), amount('Swiggy'), amount('Zomato'), amount('Dineout'), amount('Unpaid bill')],
      [175400, 106100, 66300, 144600, 93000, 0, 0, 0],
    );
    assert.equal(money.rows.filter((row) => row.line.startsWith('On Hold')).length, 0);
    assert.deepEqual([money.totals.amountInPaise, money.totals.inHandInPaise, money.totals.platformInPaise], [585400, 347800, 237600]);
  });

  it('the top five items by quantity, ties by name', async () => {
    setClockForTests(ist('18:00'));
    const top = section((await today()).body.data, 'topItems');
    assert.deepEqual(top.rows.map((row) => [row.name, row.quantity]), [
      ['Caffe Latte', 3],
      ['Roasted Papad', 3],
      ['Ferrero Hazelnut Shake', 2],
      ['Half & Half Pizza', 2],
      ['Indian Platters', 2],
    ]);
  });

  it('no alerts yet: the void, the large discounts, the cancellation and the No Charge (7:45 PM) all come later', async () => {
    setClockForTests(ist('18:00'));
    assert.deepEqual(section((await today()).body.data, 'alerts').rows, []);
  });

  it('by 10:00 PM the alerts list each event in time order', async () => {
    setClockForTests(ist('22:00'));
    const alerts = section((await today()).body.data, 'alerts').rows;
    assert.deepEqual(alerts.map((row) => [row.kind, row.detail, row.amountInPaise]), [
      ['Discount over 20%', 'CFA/C/22449', 20000],
      ['Discount over 20%', 'CFA/C/22450', 4500],
      ['No Charge', 'Table 29', 23000],
      ['Void', 'CFA/C/22452', 34700],
      ['Cancelled after preparation', 'Thecha Paneer Chilli', 39000],
    ]);
  });

  it('its figures equal computeDayFigures for the same moment', async () => {
    for (const time of ['18:00', '21:00']) {
      setClockForTests(ist(time));
      const data = (await today()).body.data;
      const [tiles] = section(data, 'tiles').rows;
      const figures = await computeDayFigures(
        { restaurantId: String(golden.restaurant._id), branchId: String(golden.branch._id) },
        GOLDEN_DATE,
        { upTo: ist(time) },
      );
      assert.equal(tiles.billTotalInPaise, figures.sales.billTotalInPaise, time);
      assert.equal(tiles.netSalesInPaise, figures.sales.netSalesInPaise, time);
      assert.equal(tiles.billCount, figures.sales.billCount, time);
      assert.equal(tiles.covers, figures.sales.covers, time);
      assert.equal(tiles.averagePerCoverInPaise, figures.sales.averagePerCoverInPaise, time);
      assert.equal(tiles.unpaidInPaise, figures.money.unpaidInPaise, time);
      assert.equal(section(data, 'money').totals.amountInPaise, figures.money.totalInPaise, time);
    }
  });

  it('after the day, Today matches the full golden day', async () => {
    setClockForTests(ist('04:00', '2026-09-27'));
    const [tiles] = section((await today()).body.data, 'tiles').rows;
    assert.deepEqual([tiles.billTotalInPaise, tiles.billCount, tiles.covers], [926900, 15, 27]);
  });

  it('is refused to every role but OWNER and MANAGER', async () => {
    setClockForTests(ist('18:00'));
    assert.equal((await today(golden.tokens.MANAGER)).status, 200);
    assert.equal((await today(golden.tokens.CASHIER)).status, 403);
    assert.equal((await today(golden.tokens.WAITER)).status, 403);
    assert.equal((await request('GET', '/api/v1/reports/v2/today?from=2026-09-26')).status, 401);
    assert.equal((await request('GET', '/api/v1/reports/v2/today?from=2026-09-26', { token: golden.tokens.OWNER })).status, 400);
  });
});
