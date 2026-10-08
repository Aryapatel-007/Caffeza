/**
 * P25 Part I: card machine payments through Pine Labs, against a fake service.
 * docs/API-CONTRACT.md M21 section 8 and M10 section 5.2.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { AuditLog } from '../models/AuditLog.js';
import { ALL_MODELS } from '../models/index.js';
import { IntegrationEvent } from '../models/IntegrationEvent.js';
import { TerminalTransaction } from '../models/TerminalTransaction.js';
import { runDueJobs } from '../services/integrations/jobRunner.js';
import '../services/integrations/terminals/terminalService.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { startFakePineLabs, GOOD, PATHS } from './helpers/fakePineLabs.js';
import { setupGoldenRestaurant } from './helpers/goldenDay.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

let fake;
let baseUrl;
let worldCounter = 0;

before(async () => {
  await startTestDatabase();
  baseUrl = await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  fake = await startFakePineLabs();
});

after(async () => {
  resetClockForTests();
  await fake.close();
  await stopTestServer();
  await stopTestDatabase();
});

/** The golden restaurant, Pine Labs connected with one machine, and UPI and Card on it. */
async function world() {
  worldCounter += 1;
  const golden = await setupGoldenRestaurant({ name: `Card Cafe ${worldCounter}` });
  const owner = golden.tokens.OWNER;
  const saved = await request('PUT', '/api/v1/integrations/PINE_LABS', {
    token: owner,
    body: {
      environment: 'UAT',
      credentials: GOOD,
      config: { baseUrl: fake.base, paths: PATHS, storeId: '1221', terminals: [{ name: 'Counter', clientId: '1234' }], autoCancelMinutes: 1 },
    },
  });
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  const tested = await request('POST', '/api/v1/integrations/PINE_LABS/test', { token: owner });
  assert.equal(tested.status, 200, JSON.stringify(tested.body));
  const methods = await request('GET', '/api/v1/payment-methods', { token: owner });
  for (const [code, mode] of [['UPI', 10], ['CARD', 1]]) {
    const method = methods.body.data.find((entry) => entry.code === code);
    const linked = await request('PATCH', `/api/v1/payment-methods/${method.id}`, { token: owner, body: { terminalProvider: 'PINE_LABS', terminalPaymentMode: mode } });
    assert.equal(linked.status, 200, JSON.stringify(linked.body));
  }
  return { ...golden, owner, webhookUrl: saved.body.data.webhookUrl };
}

/** Golden day B05 on a table: Half & Half Pizza, Ferrero Hazelnut Shake, Water Bottle. ₹795.00. */
async function b05Bill(w) {
  const { tokens, ids } = w;
  const items = ['Half & Half Pizza', 'Ferrero Hazelnut Shake', 'Water Bottle'];
  let order = (await request('POST', '/api/v1/orders', {
    token: tokens.WAITER,
    body: { orderType: 'DINE_IN', tableId: ids.tables['Table 3'], guestCount: 2, lines: items.map((name) => ({ menuItemId: ids.items[name], quantity: 1 })) },
  })).body.data;
  const fired = (await request('POST', `/api/v1/orders/${order.id}/fire`, { token: tokens.WAITER, body: { version: order.version } })).body.data;
  for (const kot of fired.kots) await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: tokens.MANAGER });
  order = (await request('GET', `/api/v1/orders/${order.id}`, { token: tokens.WAITER })).body.data;
  for (const line of order.lines) {
    order = (await request('PATCH', `/api/v1/orders/${order.id}/lines/${line.id}/served`, { token: tokens.WAITER, body: { version: order.version } })).body.data;
  }
  const bill = (await request('POST', '/api/v1/bills', { token: tokens.CASHIER, body: { orderId: order.id, version: order.version } })).body.data;
  assert.equal(bill.grandTotalInPaise, 79500);
  return bill;
}

const start = (w, bill, body) =>
  request('POST', `/api/v1/bills/${bill.id}/terminal-payments`, { token: w.tokens.CASHIER, body: { terminalClientId: '1234', ...body } });
const read = (w, id) => request('GET', `/api/v1/terminal-payments/${id}`, { token: w.tokens.CASHIER });
const later = (ms) => new Date(Date.now() + ms);

describe('a payment on the card machine', () => {
  it('golden day B05: ₹500.00 in cash, then ₹295.00 by UPI on the machine, sequence 1, paid in full', async () => {
    const w = await world();
    const bill = await b05Bill(w);
    const cash = await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: w.tokens.CASHIER, body: { method: 'CASH', amountInPaise: 50000 } });
    assert.equal(cash.status, 200, JSON.stringify(cash.body));

    const started = await start(w, bill, { method: 'UPI', amountInPaise: 29500 });
    assert.equal(started.status, 201, JSON.stringify(started.body));
    assert.equal(started.body.data.status, 'WAITING');
    assert.equal(started.body.data.sequenceNumber, 1);
    assert.match(started.body.data.transactionNumber, /^[A-Za-z0-9]+$/);
    assert.equal(fake.state.requests.at(-1).body.Amount, 29500);
    assert.equal(fake.state.requests.at(-1).body.AllowedPaymentMode, '10');

    // Still waiting: nothing recorded.
    assert.equal((await read(w, started.body.data.id)).body.data.status, 'WAITING');

    fake.approve(started.body.data.ptrid);
    setClockForTests(later(5_000));
    const done = await read(w, started.body.data.id);
    resetClockForTests();
    assert.equal(done.body.data.status, 'APPROVED');

    const paid = (await request('GET', `/api/v1/bills/${bill.id}`, { token: w.tokens.CASHIER })).body.data;
    assert.equal(paid.status, 'PAID');
    assert.equal(paid.payments.length, 2);
    const upi = paid.payments[1];
    assert.equal(upi.method, 'UPI');
    assert.equal(upi.amountInPaise, 29500);
    assert.equal(upi.reference, '628100123456');
    assert.deepEqual(upi.terminal, { provider: 'PINE_LABS', ptrid: started.body.data.ptrid, rrn: '628100123456', approvalCode: 'A12345', tid: '30001234', paymentMode: 'UPI' });
  });

  it('records one payment however many times the approval is read, and a postback adds nothing', async () => {
    const w = await world();
    const bill = await b05Bill(w);
    const started = (await start(w, bill, { method: 'CARD', amountInPaise: 79500 })).body.data;
    fake.approve(started.ptrid, { mode: 'CARD' });
    for (let index = 0; index < 3; index += 1) {
      setClockForTests(later((index + 1) * 5_000));
      await read(w, started.id);
    }
    resetClockForTests();
    // Pine Labs' postback is a hint: it makes the server ask again, and nothing more.
    const postback = await fetch(`${baseUrl}${new URL(w.webhookUrl).pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PlutusTransactionReferenceID: Number(started.ptrid), ResponseCode: 0 }),
    });
    assert.equal(postback.status, 200);
    await runDueJobs({ now: later(60_000) });
    const paid = (await request('GET', `/api/v1/bills/${bill.id}`, { token: w.tokens.CASHIER })).body.data;
    assert.equal(paid.payments.length, 1);
    assert.equal((await TerminalTransaction.findOne({ restaurantId: w.restaurant._id, _id: started.id }).lean()).paymentId !== null, true);
  });

  it('records nothing when declined, cancelled, or left until it expires', async () => {
    const w = await world();
    const bill = await b05Bill(w);

    const declined = (await start(w, bill, { method: 'CARD', amountInPaise: 79500 })).body.data;
    fake.decline(declined.ptrid);
    setClockForTests(later(5_000));
    assert.equal((await read(w, declined.id)).body.data.status, 'DECLINED');
    resetClockForTests();

    const cancelled = (await start(w, bill, { method: 'CARD', amountInPaise: 79500 })).body.data;
    assert.equal(cancelled.sequenceNumber, 2);
    const cancel = await request('POST', `/api/v1/terminal-payments/${cancelled.id}/cancel`, { token: w.tokens.CASHIER });
    assert.equal(cancel.body.data.status, 'CANCELLED');

    const expiring = (await start(w, bill, { method: 'CARD', amountInPaise: 79500 })).body.data;
    // The machine's own cancel time is 1 minute; 5 more, and the last check finds nothing.
    await runDueJobs({ now: later(7 * 60_000) });
    setClockForTests(later(7 * 60_000));
    await runDueJobs({ now: later(7 * 60_000) });
    resetClockForTests();
    assert.equal((await TerminalTransaction.findOne({ restaurantId: w.restaurant._id, _id: expiring.id }).lean()).status, 'EXPIRED');

    const unpaid = (await request('GET', `/api/v1/bills/${bill.id}`, { token: w.tokens.CASHIER })).body.data;
    assert.equal(unpaid.payments.length, 0);
  });

  it('records nothing for an approved amount different from the one asked for, and says so', async () => {
    const w = await world();
    const bill = await b05Bill(w);
    const started = (await start(w, bill, { method: 'UPI', amountInPaise: 29500 })).body.data;
    fake.approve(started.ptrid, { approvedAmount: 50000 });
    setClockForTests(later(5_000));
    const after = (await read(w, started.id)).body.data;
    resetClockForTests();
    assert.equal(after.status, 'UNKNOWN');
    assert.match(after.lastMessage, /Check the machine's slip/);
    assert.equal((await request('GET', `/api/v1/bills/${bill.id}`, { token: w.tokens.CASHIER })).body.data.payments.length, 0);

    const close = await request('POST', '/api/v1/day-close', { token: w.tokens.OWNER, body: { businessDate: after.businessDate, countedCashInPaise: 0 } });
    assert.equal(close.status, 422);
    assert.ok(close.body.error.blockers.some((blocker) => blocker.kind === 'TERMINAL_PAYMENT'));
  });
});

describe('a card-machine method entered by hand', () => {
  it('is refused for a cashier, and taken from a manager with a reason, on the audit trail', async () => {
    const w = await world();
    const bill = await b05Bill(w);
    const byCashier = await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: w.tokens.CASHIER, body: { method: 'CARD', amountInPaise: 79500 } });
    assert.equal(byCashier.status, 422);
    assert.equal(byCashier.body.error.code, 'TERMINAL_REQUIRED');
    const cashierReason = await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: w.tokens.CASHIER, body: { method: 'CARD', amountInPaise: 79500, terminalBypassReason: 'The machine is down' } });
    assert.equal(cashierReason.status, 403);

    const byManager = await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: w.tokens.MANAGER, body: { method: 'CARD', amountInPaise: 79500, terminalBypassReason: 'The machine is down' } });
    assert.equal(byManager.status, 200, JSON.stringify(byManager.body));
    const audit = await AuditLog.findOne({ restaurantId: w.restaurant._id, action: 'TERMINAL_BYPASSED' }).lean();
    assert.equal(audit.reason, 'The machine is down');
    assert.equal(audit.amountInPaise, 79500);
  });

  it('never writes the security token into an event line', async () => {
    const w = await world();
    const bill = await b05Bill(w);
    await start(w, bill, { method: 'UPI', amountInPaise: 79500 });
    const lines = await IntegrationEvent.find({ restaurantId: w.restaurant._id }).lean();
    assert.ok(lines.length >= 2);
    const text = JSON.stringify(lines);
    assert.equal(text.includes(GOOD.securityToken), false);
    assert.equal(text.includes(GOOD.merchantId), false);
  });
});
