/**
 * P25 Part L: integration alerts, derived on read. docs/API-CONTRACT.md M21
 * section 5.1.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import mongoose from 'mongoose';

import { ALL_MODELS } from '../models/index.js';
import { IntegrationJob } from '../models/IntegrationJob.js';
import { PlatformOrder } from '../models/PlatformOrder.js';
import { TallyExport } from '../models/TallyExport.js';
import { TerminalTransaction } from '../models/TerminalTransaction.js';
import { setupGoldenRestaurant } from './helpers/goldenDay.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

let golden;
let other;
const ids = {};

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  golden = await setupGoldenRestaurant({ name: 'Alert Cafe' });
  other = await setupGoldenRestaurant({ name: 'Other Cafe', invoiceSeries: false });

  const saved = await request('PUT', '/api/v1/integrations/SANDBOX_PLATFORM', {
    token: golden.tokens.OWNER,
    body: { environment: 'SANDBOX', credentials: { webhookSecret: 'a-long-enough-sandbox-secret' }, config: { actsAs: 'ZOMATO' } },
  });
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  const connectionId = saved.body.data.id;
  const tenant = { restaurantId: golden.restaurant._id, branchId: golden.branch._id };
  const someone = new mongoose.Types.ObjectId();
  const now = new Date();

  ids.job = (await IntegrationJob.create({ ...tenant, connectionId, type: 'CHANNEL_CALL', payload: { call: 'markFoodReady', args: { platformOrderId: '249377796192385' } }, status: 'DEAD', runAfter: now, attempts: 6 }))._id;
  // A bridge's dead post shows as its export, not twice.
  await IntegrationJob.create({ ...tenant, connectionId, type: 'POST_VOUCHERS', status: 'DEAD', runAfter: now, attempts: 1, forBridge: true });
  const platform = { ...tenant, connectionId, provider: 'SANDBOX_PLATFORM', platformCode: 'ZOMATO', order: { totalInPaise: 30500 }, receivedAt: now, businessDate: '2026-09-26' };
  ids.failed = (await PlatformOrder.create({ ...platform, platformOrderId: 'A1', status: 'FAILED' }))._id;
  ids.mismatch = (await PlatformOrder.create({ ...platform, platformOrderId: 'A2', status: 'PICKED_UP', billId: someone, amountMismatch: { oursInPaise: 31000, platformInPaise: 30500 } }))._id;
  ids.closedDay = (await PlatformOrder.create({ ...platform, platformOrderId: 'A3', status: 'NEEDS_ATTENTION', attentionReasons: ['DAY_CLOSED'] }))._id;
  await PlatformOrder.create({ ...platform, platformOrderId: 'A4', status: 'ACCEPTED' });
  ids.terminal = (await TerminalTransaction.create({
    ...tenant, connectionId, billId: someone, billNumber: 'CFA/C/22446', methodCode: 'UPI', allowedPaymentMode: 10, amountInPaise: 29500,
    transactionNumber: 'CFAC22446', sequenceNumber: 1, terminal: { name: 'Counter', clientId: '1234' }, status: 'UNKNOWN',
    result: { amountInPaise: 50000 }, businessDate: '2026-09-26', startedBy: someone, startedAt: now,
  }))._id;
  ids.tally = (await TallyExport.create({
    ...tenant, connectionId, businessDate: '2026-09-26', granularity: 'DAILY_SUMMARY', version: 'TALLY_PRIME', status: 'FAILED',
    voucherCount: 2, debitInPaise: 1, creditInPaise: 1, xml: '<ENVELOPE/>', xmlSha256: 'x', builtFromCloseAt: now, createdBy: someone,
    lineErrors: ["Ledger 'Swiggy' does not exist!"],
  }))._id;
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

const list = (token) => request('GET', '/api/v1/integrations/alerts', { token });

describe('integration alerts', () => {
  it('lists each open source once, with a plain sentence and a link', async () => {
    const response = await list(golden.tokens.MANAGER);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const byKind = Object.fromEntries(response.body.data.map((alert) => [alert.kind, alert]));
    assert.deepEqual(Object.keys(byKind).sort(), ['JOB_DEAD', 'PLATFORM_ACCEPT_FAILED', 'PLATFORM_AMOUNT_MISMATCH', 'PLATFORM_CANCELLED_CLOSED_DAY', 'TALLY_FAILED', 'TERMINAL_UNKNOWN']);
    assert.equal(response.body.data.length, 6);
    assert.equal(byKind.JOB_DEAD.sentence, 'Sandbox platform did not answer after 6 tries: mark food ready for order 249377796192385.');
    assert.equal(byKind.PLATFORM_ACCEPT_FAILED.sentence, 'Accepted on Zomato but not created here: order A1. Enter it by hand.');
    assert.equal(byKind.PLATFORM_AMOUNT_MISMATCH.sentence, 'Zomato order A2: the platform charged ₹305.00, our bill says ₹310.00.');
    assert.equal(byKind.PLATFORM_CANCELLED_CLOSED_DAY.sentence, 'Zomato cancelled order A3 on 26 Sep 2026, a closed day. Reopen it to void the bill.');
    assert.equal(byKind.TERMINAL_UNKNOWN.sentence, "The card machine approved ₹500.00 for bill CFA/C/22446, but ₹295.00 was asked for. Check the machine's slip.");
    assert.equal(byKind.TALLY_FAILED.sentence, "Tally refused the vouchers for 26 Sep 2026. Ledger 'Swiggy' does not exist!");
    assert.equal(byKind.TALLY_FAILED.link, '/settings/tally');
  });

  it('is the owner’s and the manager’s, and another restaurant sees none of it', async () => {
    assert.equal((await list(golden.tokens.CASHIER)).status, 403);
    assert.equal((await list(golden.tokens.WAITER)).status, 403);
    const theirs = await list(other.tokens.OWNER);
    assert.equal(theirs.status, 200);
    assert.deepEqual(theirs.body.data, []);
    const cross = await request('POST', '/api/v1/integrations/alerts/acknowledge', { token: other.tokens.OWNER, body: { kind: 'TALLY_FAILED', id: String(ids.tally) } });
    assert.equal(cross.status, 404);
  });

  it('shows in Today’s alerts as Integration', async () => {
    const today = await request('GET', '/api/v1/reports/v2/today', { token: golden.tokens.MANAGER });
    assert.equal(today.status, 200, JSON.stringify(today.body));
    const rows = today.body.data.sections.find((section) => section.key === 'alerts').rows.filter((row) => row.kindCode === 'INTEGRATION');
    assert.equal(rows.length, 6);
    assert.ok(rows.every((row) => row.kind === 'Integration' && row.detail && row.link));
  });

  it('an acknowledged alert is no longer listed, and stamps its source', async () => {
    const done = await request('POST', '/api/v1/integrations/alerts/acknowledge', { token: golden.tokens.MANAGER, body: { kind: 'TALLY_FAILED', id: String(ids.tally) } });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const after = await list(golden.tokens.OWNER);
    assert.equal(after.body.data.some((alert) => alert.kind === 'TALLY_FAILED'), false);
    const row = await TallyExport.findOne({ restaurantId: golden.restaurant._id, _id: ids.tally }).lean();
    assert.ok(row.acknowledgedAt);
    assert.ok(row.acknowledgedBy);
    const again = await request('POST', '/api/v1/integrations/alerts/acknowledge', { token: golden.tokens.MANAGER, body: { kind: 'TALLY_FAILED', id: String(ids.tally) } });
    assert.equal(again.status, 404);
    const wrongKind = await request('POST', '/api/v1/integrations/alerts/acknowledge', { token: golden.tokens.MANAGER, body: { kind: 'NOPE', id: String(ids.tally) } });
    assert.equal(wrongKind.status, 400);
  });
});
