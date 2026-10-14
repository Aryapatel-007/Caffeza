/**
 * The day-end message and its email. P44, API-CONTRACT P44.
 *
 * The golden day's message, line by line, against TEST-DATA; the blind
 * manager's preview; the email to a fake Resend, at the addresses in Settings
 * only; the email sent by a close, and a close that stands when Resend fails.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, afterEach, before, describe, it } from 'node:test';

import { ALL_MODELS } from '../models/index.js';
import { setEmailForTests } from '../services/emailService.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { buildGoldenDay, GOLDEN_DATE, ist } from './helpers/goldenDay.js';
import { readyToBillOrder, seedFloor } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

let golden;
let fake;
const sent = [];
let failNext = false;

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  golden = await buildGoldenDay();

  // A fake Resend: records what it is sent, and refuses when told to.
  fake = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (failNext) {
        failNext = false;
        res.writeHead(422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'The from address is not verified' }));
        return;
      }
      sent.push({ path: req.url, authorization: req.headers.authorization, body: JSON.parse(raw) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: `email_${sent.length}` }));
    });
  });
  await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve));
  setEmailForTests({ base: `http://127.0.0.1:${fake.address().port}`, apiKey: 're_test_key', from: 'Test <onboarding@resend.dev>' });
});

afterEach(() => resetClockForTests());

after(async () => {
  setEmailForTests(null);
  await new Promise((resolve) => fake.close(resolve));
  await stopTestServer();
  await stopTestDatabase();
});

const ok = (response, what) => {
  assert.ok(response.status >= 200 && response.status < 300, `${what}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data;
};
const message = (token) => request('GET', `/api/v1/day-close/${GOLDEN_DATE}/message`, { token });
const email = (token) => request('POST', `/api/v1/day-close/${GOLDEN_DATE}/email`, { token });
const setEmails = (token, dayEndEmails) => request('PATCH', '/api/v1/settings', { token, body: { reason: 'P44 test', reports: { dayEndEmails } } });

describe('the golden day as the day-end message', () => {
  it('reads every line in the manager\'s words, from the same figures as Day Close', async () => {
    setClockForTests(ist('09:00', '2026-09-27'));
    const { subject, text } = ok(await message(golden.tokens.OWNER), 'message');
    const lines = text.split('\n');
    assert.equal(lines[0], 'Caffeza');
    assert.equal(lines[1], '26-September-2026');
    assert.equal(subject, 'Caffeza day end, 26-September-2026');
    for (const line of [
      'Gross Sale - 9,269',
      'Tax - 383',
      'Net Sale - 8,886',
      'Cash - 1,754',
      'Card - 1,481',
      'UPI - 1,472',
      'Zomato Gold - 1,998',
      'Dineout - 778',
      'EazyDiner - 0',
      'Zomato - 305',
      'Swiggy - 930',
      'Due payment - 551',
      'Total exp - 350',
      'Today APC - 267',
      'Today Pax - 27',
      'Grand Total Cash in hand - 3,404',
      'Total Petty Cash - 3,404',
      'Monthly Till Date sale - 9,269',
      'Daily Average - 357',
    ]) {
      assert.ok(lines.includes(line), `missing "${line}" in:\n${text}`);
    }
    assert.match(text, /^Occupancy - 27 pax/m);
  });

  it('hides the cash in hand from a blind manager, and from nobody else', async () => {
    setClockForTests(ist('09:00', '2026-09-27'));
    const { text } = ok(await message(golden.tokens.MANAGER), 'manager');
    assert.ok(text.includes('Grand Total Cash in hand - —'));
    assert.ok(text.includes('Total Petty Cash - —'));
    assert.ok(text.includes('Gross Sale - 9,269'), 'the sales are not hidden');
    assert.equal((await message(golden.tokens.WAITER)).status, 403, 'a captain may not read it');
  });
});

describe('emailing it', () => {
  it('refuses with no addresses, refuses bad addresses, and stores them lowercased', async () => {
    const none = await email(golden.tokens.MANAGER);
    assert.equal(none.status, 422);
    assert.equal(none.body.error.message, 'Add an email address for the day-end report in Settings first.');

    assert.equal((await setEmails(golden.tokens.OWNER, ['not-an-email'])).status, 400);
    assert.equal((await setEmails(golden.tokens.OWNER, ['a@x.in', 'b@x.in', 'c@x.in', 'd@x.in', 'e@x.in', 'f@x.in'])).status, 400);
    assert.equal((await setEmails(golden.tokens.OWNER, ['a@x.in', 'A@x.in'])).status, 400, 'the same address twice');
    assert.equal((await setEmails(golden.tokens.MANAGER, ['z.chaat25@gmail.com'])).status, 403, 'settings are the owner\'s');
    ok(await setEmails(golden.tokens.OWNER, ['Z.Chaat25@Gmail.com']), 'owner sets the address');
  });

  it('sends the full message, cash included, to the addresses in Settings only, whoever taps it', async () => {
    setClockForTests(ist('09:00', '2026-09-27'));
    const before = sent.length;
    const result = ok(await email(golden.tokens.MANAGER), 'manager emails');
    assert.deepEqual(result.sentTo, ['z.chaat25@gmail.com']);
    assert.equal(sent.length, before + 1);
    const mail = sent.at(-1);
    assert.equal(mail.path, '/emails');
    assert.equal(mail.authorization, 'Bearer re_test_key');
    assert.deepEqual(mail.body.to, ['z.chaat25@gmail.com']);
    assert.equal(mail.body.subject, 'Caffeza day end, 26-September-2026');
    assert.ok(mail.body.text.includes('Grand Total Cash in hand - 3,404'), 'the email carries the cash');
  });

  it('is sent by the close itself, with the counted and kept cash', async () => {
    setClockForTests(ist('09:00', '2026-09-27'));
    const before = sent.length;
    const closed = ok(
      await request('POST', '/api/v1/day-close', {
        token: golden.tokens.MANAGER,
        body: { businessDate: GOLDEN_DATE, countedCashInPaise: 340000, note: 'Four rupees short, coins' },
      }),
      'close',
    );
    assert.equal(closed.status, 'CLOSED');
    assert.ok(closed.dayEndEmail.sentAt, 'the close sent it');
    assert.equal(closed.dayEndEmail.error, null);
    assert.equal(sent.length, before + 1);
    assert.ok(sent.at(-1).body.text.includes('Grand Total Cash in hand - 3,400'), 'the counted cash, once closed');
  });

  it('leaves the day closed when Resend refuses, and keeps the error', async () => {
    setClockForTests(ist('10:00', '2026-09-27'));
    ok(await request('POST', `/api/v1/day-close/${GOLDEN_DATE}/reopen`, { token: golden.tokens.OWNER, body: { reason: 'P44 test' } }), 'reopen');
    failNext = true;
    const closed = ok(
      await request('POST', '/api/v1/day-close', {
        token: golden.tokens.MANAGER,
        body: { businessDate: GOLDEN_DATE, countedCashInPaise: 340000, note: 'Four rupees short, coins' },
      }),
      'close again',
    );
    assert.equal(closed.status, 'CLOSED', 'the close stands');
    assert.equal(closed.dayEndEmail.sentAt, null);
    assert.match(closed.dayEndEmail.error, /not verified/);
    const read = ok(await request('GET', `/api/v1/day-close/${GOLDEN_DATE}`, { token: golden.tokens.OWNER }), 'read');
    assert.match(read.dayEndEmail.error, /not verified/);

    failNext = true;
    const refused = await email(golden.tokens.OWNER);
    assert.equal(refused.status, 502);
    assert.equal(refused.body.error.code, 'EMAIL_SEND_FAILED');
  });

  it('says plainly when email is not set up on the server', async () => {
    setEmailForTests({ base: `http://127.0.0.1:${fake.address().port}`, apiKey: null });
    try {
      const refused = await email(golden.tokens.OWNER);
      assert.equal(refused.status, 422);
      assert.equal(refused.body.error.message, 'Email is not set up on the server.');
    } finally {
      setEmailForTests({ base: `http://127.0.0.1:${fake.address().port}`, apiKey: 're_test_key', from: 'Test <onboarding@resend.dev>' });
    }
  });
});

describe('Other, by its mode', () => {
  it('reads "Other (mode)" for each mode typed (P43)', async () => {
    const floor = await seedFloor();
    const { tokens } = floor;
    const methods = ok(await request('GET', '/api/v1/payment-methods?includeInactive=true', { token: tokens.OWNER }), 'methods');
    const other = methods.find((method) => method.code === 'OTHER');
    ok(await request('PATCH', `/api/v1/payment-methods/${other.id}`, { token: tokens.OWNER, body: { isActive: true } }), 'Other on');

    const order = await readyToBillOrder(floor);
    const bill = ok(await request('POST', '/api/v1/bills', { token: tokens.CASHIER, body: { orderId: order.id, version: order.version } }), 'bill');
    ok(await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: tokens.CASHIER, body: { method: 'OTHER', amountInPaise: 100, reference: 'Zomato dine out' } }), 'pay by Other');

    const { text } = ok(await request('GET', `/api/v1/day-close/${bill.businessDate}/message`, { token: tokens.OWNER }), 'message');
    assert.ok(text.includes('Other (Zomato dine out) - 1'), text);
    assert.doesNotMatch(text, /^Other - /m, 'Other is split by mode, not shown whole');
  });
});
