/**
 * Ten days of mock trading, for a shared development or demo database.
 *
 *   npm run seed:mock:golden               the last 10 business days before today
 *   npm run seed:mock:golden -- --days 14  any number of days, up to 31
 *
 * Renamed from seed:mock on 2 October 2026 when it met Arya's loader of the
 * same name (scripts/loadMockDays.js, which builds "Cafezza Demo" from
 * setup/caffeza.json and the Zomato menu, and filled the cloud database).
 *
 * One separate restaurant, "Cafezza Demo (mock)", with the golden day's staff,
 * menu, stations, payment methods, accounts and tables, and its own invoice
 * series, MOCK/1 upwards. It never touches any other restaurant: if one by that
 * name exists it is wiped and rebuilt, and nothing else is read or written.
 *
 * Every record goes through the real API with the clock set to each moment,
 * the way the golden day does: orders opened by their captain and sent to the
 * kitchen, made, served, billed, discounted, paid by every method, the odd
 * void and rebill, No Charge, On Hold charges and later collections, a paid
 * out, and Day Close each night after midnight with a blind count that is
 * sometimes a little off. The days are random but seeded, so a rerun builds
 * the same data.
 *
 * Runs with NODE_ENV=test, because only then may a script set the clock.
 * Refuses any database that is not localhost or named in
 * SEED_DEMO_ALLOWED_HOSTS. Everyone's password is `demo1234`.
 */
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';

import { config } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { ALL_MODELS } from '../models/index.js';
import { ist, setupGoldenRestaurant } from '../tests/helpers/goldenDay.js';
import { request, startTestServer, stopTestServer } from '../tests/helpers/testServer.js';
import { businessDateFor, resetClockForTests, setClockForTests } from '../utils/time.js';
import { assertSafeToSeed, databaseHost, wipeRestaurantNamed } from './lib/localSeed.js';

export const MOCK_RESTAURANT = 'Cafezza Demo (mock)';
const PHONE_BASE = '970000000';
/** Everyone's sign-in password at the mock restaurant. The sign-in rule needs at least 8 characters. */
export const MOCK_PASSWORD = 'demo1234';
const DAY_MS = 86_400_000;

/** A small seeded random source, so the same days come out every run. */
function randomFrom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

const ok = (response, what) => {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${what}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.data;
};

/** Minutes past midnight as "HH:MM", wrapping past midnight onto the next date. */
function moment(date, minutes) {
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + Math.floor(minutes / 1440) * DAY_MS).toISOString().slice(0, 10);
  const within = minutes % 1440;
  const time = `${String(Math.floor(within / 60)).padStart(2, '0')}:${String(within % 60).padStart(2, '0')}`;
  return ist(time, next);
}

const DINE_IN_METHODS = [['CASH', 5], ['UPI', 5], ['CARD', 3], ['ZOMATO_GOLD', 2], ['DINEOUT', 1], ['EAZYDINER', 1]];
const DISCOUNTS = [
  { kind: 'PERCENT', rateBps: 1000, reasonCode: 'REGULAR_GUEST' },
  { kind: 'PERCENT', rateBps: 500, reasonCode: 'REFERRAL' },
  { kind: 'PERCENT', rateBps: 1500, reasonCode: 'ZOMATO_GOLD', fundedBy: 'PLATFORM' },
  { kind: 'FLAT', valueInPaise: 5000, reasonCode: 'SERVICE_RECOVERY' },
  { kind: 'PERCENT', rateBps: 2000, reasonCode: 'DINEOUT', fundedBy: 'PLATFORM' },
];

function weighted(random, entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random.next() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return entries[0][0];
}

/** Plays one business day through the API. Returns a short summary. */
async function playDay(golden, date, dayIndex) {
  const random = randomFrom(20260922 + dayIndex * 7919);
  const { tokens, people, ids } = golden;
  const { items, tables, accounts } = ids;
  const owner = tokens.OWNER;
  const manager = tokens.MANAGER;
  const counter = tokens.CASHIER;
  const captains = ['Khuman Singh', 'Budha Singh', 'Devendra Singh', 'Ranjeet Paswan'];
  const itemNames = Object.keys(items);
  const tableNames = Object.keys(tables);
  const at = (minutes) => setClockForTests(moment(date, minutes));
  const summary = { bills: 0, voids: 0, noCharge: 0, onHold: 0, collections: 0 };

  // Opening float at 11:00, and the odd collection from an On Hold account in the morning.
  at(11 * 60);
  ok(await request('POST', '/api/v1/cash-movements', { token: manager, body: { type: 'OPENING_FLOAT', amountInPaise: 200000 } }), 'float');
  const list = ok(await request('GET', '/api/v1/accounts', { token: manager }), 'accounts');
  at(11 * 60 + 10);
  for (const account of list) {
    const owed = account.outstandingInPaise ?? 0;
    if (owed > 0 && random.chance(0.5)) {
      ok(await request('POST', `/api/v1/accounts/${account.id}/collections`, { token: counter, body: { method: random.pick(['CASH', 'UPI']), amountInPaise: owed } }), `collect ${account.name}`);
      summary.collections += 1;
    }
  }

  // The day's orders: open, bill and pay times, a table free for the whole stay.
  const orders = [];
  const busyUntil = Object.fromEntries(tableNames.map((name) => [name, 0]));
  const dineInCount = random.int(10, 16);
  for (let index = 0; index < dineInCount; index += 1) {
    const opened = random.int(11 * 60 + 30, 22 * 60 + 30);
    const table = tableNames.find((name) => busyUntil[name] <= opened && random.chance(0.6)) ?? tableNames.find((name) => busyUntil[name] <= opened);
    if (!table) continue;
    const billed = opened + random.int(30, 75);
    const paid = billed + random.int(2, 8);
    busyUntil[table] = paid + 1;
    orders.push({ kind: 'DINE_IN', table, opened, billed, paid, captain: random.pick(captains), guests: random.int(1, 6) });
  }
  for (let index = 0; index < random.int(1, 3); index += 1) {
    const opened = random.int(12 * 60, 22 * 60);
    orders.push({ kind: 'TAKEAWAY', opened, billed: opened + random.int(5, 15), captain: 'Counter' });
  }
  for (let index = 0; index < random.int(1, 3); index += 1) {
    const opened = random.int(12 * 60, 22 * 60 + 30);
    const platform = random.pick(['SWIGGY', 'ZOMATO']);
    orders.push({ kind: 'DELIVERY', platform, platformOrderId: `${dayIndex + 1}${random.int(100000000, 999999999)}`, opened, billed: opened + random.int(1, 5), captain: 'Counter' });
  }
  for (const order of orders) {
    order.paid ??= order.billed + random.int(0, 3);
    const lineCount = random.int(1, 4);
    order.lines = Array.from({ length: lineCount }, () => ({ menuItemId: items[random.pick(itemNames)], quantity: random.int(1, 2) }));
  }

  // A few exceptions, decided up front so they land on dine-in orders.
  const dineIn = orders.filter((order) => order.kind === 'DINE_IN');
  if (dineIn.length > 3 && random.chance(0.35)) dineIn[1].voidThenRebill = true;
  if (dineIn.length > 4 && random.chance(0.3)) dineIn[2].noCharge = true;
  if (dineIn.length > 5 && random.chance(0.35)) dineIn[3].onHold = random.pick(Object.keys(accounts));
  if (dineIn.length > 6 && random.chance(0.3)) dineIn[4].cancelAfterPrep = true;

  // Events in time order, so the clock never runs backwards and invoices follow billing.
  const events = [];
  for (const order of orders) {
    events.push({ at: order.opened, run: () => openOrder(order) });
    events.push({ at: order.billed, run: () => (order.noCharge ? giveNoCharge(order) : billOrder(order)) });
    if (!order.noCharge) events.push({ at: order.paid, run: () => settle(order) });
  }
  if (random.chance(0.5)) {
    events.push({
      at: 21 * 60 + 30,
      run: async () =>
        ok(await request('POST', '/api/v1/cash-movements', { token: manager, body: { type: 'PAID_OUT', amountInPaise: random.pick([25000, 35000, 50000]), reason: random.pick(['Milk from the dairy', 'Vegetables', 'Gas cylinder']) } }), 'paid out'),
    });
  }
  events.sort((a, b) => a.at - b.at);

  async function openOrder(order) {
    const token = order.captain === 'Counter' ? counter : people[order.captain];
    const body =
      order.kind === 'DINE_IN'
        ? { orderType: 'DINE_IN', tableId: tables[order.table], guestCount: order.guests }
        : order.kind === 'TAKEAWAY'
          ? { orderType: 'TAKEAWAY' }
          : { orderType: 'DELIVERY', platform: { code: order.platform, orderId: order.platformOrderId } };
    const opened = ok(await request('POST', '/api/v1/orders', { token, body: { ...body, lines: order.lines } }), 'open');
    const fired = ok(await request('POST', `/api/v1/orders/${opened.id}/fire`, { token, body: { version: opened.version } }), 'fire');
    order.id = opened.id;
    order.token = token;
    order.kots = fired.kots;
    order.version = fired.order.version;
  }

  async function readyAndServe(order) {
    for (const kot of order.kots) ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: manager }), 'ready');
    let current = ok(await request('GET', `/api/v1/orders/${order.id}`, { token: order.token }), 'read');
    if (order.cancelAfterPrep) {
      const line = current.lines.find((entry) => entry.status === 'READY');
      if (line && current.lines.filter((entry) => entry.status !== 'CANCELLED').length > 1) {
        current = ok(
          await request('POST', `/api/v1/orders/${order.id}/lines/${line.id}/cancel`, { token: order.token, body: { version: current.version, reasonCode: 'QUALITY', wasPrepared: true } }),
          'cancel after prep',
        );
      }
    }
    for (const line of current.lines) {
      if (line.status !== 'READY') continue;
      current = ok(await request('PATCH', `/api/v1/orders/${order.id}/lines/${line.id}/served`, { token: order.token, body: { version: current.version } }), 'serve');
    }
    return current;
  }

  async function billOrder(order) {
    const current = await readyAndServe(order);
    let bill = ok(await request('POST', '/api/v1/bills', { token: counter, body: { orderId: order.id, version: current.version } }), 'bill');
    if (order.voidThenRebill) {
      ok(await request('POST', `/api/v1/bills/${bill.id}/void`, { token: manager, body: { reasonCode: 'ITEMS_CHANGED' } }), 'void');
      summary.voids += 1;
      const reread = ok(await request('GET', `/api/v1/orders/${order.id}`, { token: counter }), 'reread');
      bill = ok(await request('POST', '/api/v1/bills', { token: counter, body: { orderId: order.id, version: reread.version } }), 'rebill');
    }
    if (order.kind === 'DINE_IN' && random.chance(0.2)) {
      ok(await request('POST', `/api/v1/bills/${bill.id}/discount`, { token: manager, body: random.pick(DISCOUNTS) }), 'discount');
    }
    order.billId = bill.id;
    summary.bills += 1;
  }

  async function giveNoCharge(order) {
    // The food was made and given away, so the station clears the ticket first.
    for (const kot of order.kots) ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: manager }), 'ready');
    const current = ok(await request('GET', `/api/v1/orders/${order.id}`, { token: manager }), 'read');
    order.version = current.version;
    ok(await request('POST', `/api/v1/orders/${order.id}/no-charge`, { token: manager, body: { version: order.version, reasonCode: random.pick(['CORPORATE_OFFICE', 'STAFF_MEAL', 'OWNER_GUEST']) } }), 'No Charge');
    summary.noCharge += 1;
  }

  async function settle(order) {
    const bill = ok(await request('GET', `/api/v1/bills/${order.billId}`, { token: counter }), 'read bill');
    const owed = bill.grandTotalInPaise - bill.amountPaidInPaise;
    if (order.onHold) {
      ok(await request('POST', `/api/v1/bills/${bill.id}/charge-to-account`, { token: manager, body: { accountId: accounts[order.onHold] } }), 'charge');
      summary.onHold += 1;
      return;
    }
    const method = order.kind === 'DELIVERY' ? order.platform : order.kind === 'TAKEAWAY' ? weighted(random, [['CASH', 1], ['UPI', 2]]) : weighted(random, DINE_IN_METHODS);
    if (method === 'CASH' && owed > 20000 && random.chance(0.25)) {
      const cash = Math.round(owed / 2 / 100) * 100;
      ok(await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: counter, body: { method: 'CASH', amountInPaise: cash } }), 'pay cash part');
      ok(await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: counter, body: { method: 'UPI', amountInPaise: owed - cash } }), 'pay UPI part');
      return;
    }
    ok(await request('POST', `/api/v1/bills/${bill.id}/payments`, { token: counter, body: { method, amountInPaise: owed } }), `pay ${method}`);
  }

  for (const event of events) {
    at(event.at);
    await event.run();
  }

  // Day Close at 12:30 AM: the owner can read what the drawer should hold; the manager counts blind.
  at(24 * 60 + 30);
  const day = ok(await request('GET', `/api/v1/day-close/${date}`, { token: owner }), 'read day');
  const expected = day.figures.cash.expectedCashInPaise;
  const off = random.chance(0.3) ? random.pick([-500, -400, -200, 100, 300]) : 0;
  ok(
    await request('POST', '/api/v1/day-close', {
      token: manager,
      body: { businessDate: date, countedCashInPaise: expected + off, ...(off ? { note: off < 0 ? 'Short at the count' : 'Over at the count' } : {}) },
    }),
    `close ${date}`,
  );
  return { ...summary, cashDifferenceInPaise: off };
}

/** The `count` business dates before today's, oldest first. */
export function lastBusinessDates(count, now = new Date()) {
  const today = businessDateFor(now, 300);
  const start = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => new Date(start - (count - index) * DAY_MS).toISOString().slice(0, 10));
}

async function main() {
  assertSafeToSeed();
  if (config.NODE_ENV !== 'test') {
    throw new Error('Run this through `npm run seed:mock`, which sets NODE_ENV=test so it can set the clock.');
  }
  const daysArgument = process.argv.indexOf('--days');
  const count = daysArgument > 0 ? Number(process.argv[daysArgument + 1]) : 10;
  if (!Number.isInteger(count) || count < 1 || count > 31) throw new Error('--days must be a whole number from 1 to 31.');
  const dates = lastBusinessDates(count);

  await connectDatabase();
  await startTestServer();
  try {
    console.log(`Seeding ${count} mock days, ${dates[0]} to ${dates.at(-1)}, into ${databaseHost()} (${mongoose.connection.name}).`);
    for (const model of ALL_MODELS) await model.init();
    if (await wipeRestaurantNamed(MOCK_RESTAURANT)) console.log(`  Wiped the previous "${MOCK_RESTAURANT}".`);

    const golden = await setupGoldenRestaurant({ name: MOCK_RESTAURANT, invoiceSeries: false, phoneBase: PHONE_BASE, password: MOCK_PASSWORD });
    setClockForTests(ist('09:00', dates[0]));
    ok(
      await request('PATCH', '/api/v1/settings', {
        token: golden.tokens.OWNER,
        body: { reason: 'Mock data series', invoice: { mode: 'PREFIX', prefix: 'MOCK/', startingNumber: 1 } },
      }),
      'invoice series',
    );

    for (const [index, date] of dates.entries()) {
      const started = Date.now();
      const result = await playDay(golden, date, index);
      console.log(
        `  ${date}: ${result.bills} bills, ${result.voids} voided and rebilled, ${result.noCharge} No Charge, ${result.onHold} On Hold, ` +
          `${result.collections} collections, cash ${result.cashDifferenceInPaise === 0 ? 'exact' : `${result.cashDifferenceInPaise / 100} off`}, closed (${Math.round((Date.now() - started) / 1000)}s)`,
      );
    }

    console.log('');
    console.log(`Done. "${MOCK_RESTAURANT}", invoice series MOCK/. Every login's password: ${MOCK_PASSWORD}`);
    for (const [name, phone] of Object.entries(golden.phones)) console.log(`  ${name.padEnd(16)} ${phone}`);
  } finally {
    resetClockForTests();
    await stopTestServer();
    await disconnectDatabase();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
