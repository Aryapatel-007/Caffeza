/**
 * The speed of R19 over a full year, opt-in. P14.
 *
 *   PERF=1 npm test
 *
 * Inserts about 66,000 bills, a year at Caffeza's size, directly into the test
 * database, then asks R19 for the whole year with its totals. It must answer in
 * under two seconds. Skipped when PERF is unset, so the normal suite stays fast.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import mongoose from 'mongoose';

import { Bill } from '../models/Bill.js';
import { ALL_MODELS } from '../models/index.js';
import { seedTeam } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const RUN = Boolean(process.env.PERF);
const BILLS_PER_DAY = 182;
const DAYS = 365;

describe('R19 over a full year', { skip: !RUN && 'set PERF=1 to run the speed test' }, () => {
  let team;

  before(async () => {
    await startTestDatabase();
    await startTestServer();
    for (const model of ALL_MODELS) await model.init();
    team = await seedTeam();

    const start = Date.UTC(2025, 9, 1, 6, 30);
    const batch = [];
    let sequence = 0;
    for (let day = 0; day < DAYS; day += 1) {
      const businessDate = new Date(start + day * 86_400_000).toISOString().slice(0, 10);
      for (let n = 0; n < BILLS_PER_DAY; n += 1) {
        sequence += 1;
        const billedAt = new Date(start + day * 86_400_000 + n * 240_000);
        batch.push({
          restaurantId: team.restaurant._id,
          branchId: team.branch._id,
          billNumber: `CFA/C/${sequence}`,
          financialYear: '2025-26',
          billSequence: sequence,
          invoiceSeries: 'CFA/C/',
          orderId: new mongoose.Types.ObjectId(),
          orderNumber: sequence,
          orderType: 'DINE_IN',
          tableName: `Table ${(n % 34) + 1}`,
          businessDate,
          status: 'PAID',
          lines: [{ orderLineId: new mongoose.Types.ObjectId(), menuItemId: new mongoose.Types.ObjectId(), itemName: 'Caffe Latte', quantity: 1, unitPriceInPaise: 22000, taxRateBps: 500, lineTotalInPaise: 22000, categoryName: 'Italian Coffees', discountShareInPaise: 0, taxableInPaise: 22000, taxInPaise: 1100 }],
          subtotalInPaise: 22000,
          discount: null,
          taxBreakdown: [{ taxRateBps: 500, taxableInPaise: 22000, taxInPaise: 1100, cgstInPaise: 550, sgstInPaise: 550 }],
          totalTaxInPaise: 1100,
          roundOffInPaise: 0,
          grandTotalInPaise: 23100,
          payments: [{ _id: new mongoose.Types.ObjectId(), method: 'CASH', methodName: 'Cash', methodKind: 'IN_HAND', amountInPaise: 23100, receivedBy: team.restaurant._id, receivedAt: billedAt, businessDate }],
          amountPaidInPaise: 23100,
          billedBy: team.restaurant._id,
          billedAt,
          paidAt: billedAt,
          isVoided: false,
          captainName: 'Khuman Singh',
          guestCount: 2,
          createdAt: billedAt,
          updatedAt: billedAt,
        });
      }
    }
    for (let index = 0; index < batch.length; index += 5000) {
      await Bill.collection.insertMany(batch.slice(index, index + 5000), { ordered: false });
    }
  });

  after(async () => {
    await stopTestServer();
    await stopTestDatabase();
  });

  it('answers a full-year bill list with its totals in under two seconds', async () => {
    const startedAt = performance.now();
    const response = await request('GET', '/api/v1/reports/v2/bills?from=2025-10-01&to=2026-09-30&limit=50', {
      token: team.tokens.OWNER,
    });
    const elapsed = Math.round(performance.now() - startedAt);
    console.log(`R19 full year, ${BILLS_PER_DAY * DAYS} bills: ${elapsed} ms`);

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.data.totals.billCount, BILLS_PER_DAY * DAYS);
    assert.equal(response.body.data.totals.billTotalInPaise, BILLS_PER_DAY * DAYS * 23100);
    assert.ok(elapsed < 2000, `took ${elapsed} ms`);
  });
});
