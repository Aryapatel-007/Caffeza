/**
 * Ten busy days of mock trading for Cafezza, written to the configured
 * database. `npm run seed:mock` from the repo root, or from Git Bash in
 * `server/`:
 *
 *   npm run seed:mock                 resume, or start
 *   npm run seed:mock -- --fresh      wipe "Cafezza Demo" first
 *
 * Asked for on 2 October 2026 and pointed at the cloud cluster at the user's
 * explicit request, against CLAUDE.md's "never create a bill in production to
 * test something"; the decision log records it. To keep it contained:
 *   - everything belongs to one restaurant, "Cafezza Demo", which --fresh (or
 *     `wipeRestaurantNamed`) removes in one step before go-live;
 *   - bills use the default financial-year numbering (2026-27/000001), never
 *     the real CFA/C/ series, which stays untouched until cutover day;
 *   - every login's password is DEMO_PASSWORD from .env.
 *
 * How it works, the same way as the golden day (P21): the restaurant is set up
 * from setup/caffeza.json and the Zomato menu, setup/caffeza-zomato-menu.csv,
 * through the real API, then each day from 22 September to 1 October 2026 is
 * played through the real API with the server's clock moved to each moment,
 * so every bill, payment, discount, cancel, void, No Charge, On Hold charge,
 * collection and Day Close is made by the real code and obeys every rule. Each
 * day ends with the manager closing it on a blind count. Today stays empty.
 *
 * It runs with NODE_ENV=test because only there can the clock be set, and it
 * refuses any database host that is not localhost or named in
 * SEED_DEMO_ALLOWED_HOSTS, through the same guard as seed:demo. A closed day
 * is skipped on a re-run, so an interrupted run carries on where it stopped.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { config } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { ALL_MODELS } from '../models/index.js';
import { Restaurant } from '../models/Restaurant.js';
import { request, startTestServer, stopTestServer } from '../tests/helpers/testServer.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { applyMenu, planMenu, readMenu } from './importMenu.js';
import { apiClient } from './lib/scriptApi.js';
import { assertSafeToSeed, databaseHost, wipeRestaurantNamed } from './lib/localSeed.js';
import { runProvisioning } from './provisionRestaurant.js';
import { applySetup, planSetup, REPO_ROOT, validateSetupConfig } from './setupRestaurant.js';

export const MOCK_RESTAURANT = 'Cafezza Demo';
const PASSWORD = process.env.DEMO_PASSWORD;
const FIRST_DAY = '2026-09-22';
const DAYS = 10;

/** Demo phone numbers, in one block so they are easy to recognise and remove. */
const OWNER_PHONE = '9000002000';
const STAFF = [
  { key: 'manager', name: 'Manager', role: 'MANAGER', phone: '9000002001' },
  { key: 'counter', name: 'Counter', role: 'CASHIER', phone: '9000002002' },
  { key: 'ranjeet', name: 'Ranjeet Paswan', role: 'WAITER', phone: '9000002003' },
  { key: 'budha', name: 'Budha Singh', role: 'WAITER', phone: '9000002004' },
  { key: 'ratandip', name: 'Ratandip', role: 'WAITER', phone: '9000002005' },
  { key: 'khuman', name: 'Khuman Singh', role: 'WAITER', phone: '9000002006' },
  { key: 'devendra', name: 'Devendra Singh', role: 'WAITER', phone: '9000002007' },
  { key: 'liveKitchen', name: 'Live Kitchen', role: 'KITCHEN', phone: '9000002008', station: 'Live Kitchen' },
  { key: 'beverages', name: 'Beverages', role: 'KITCHEN', phone: '9000002009', station: 'Beverages' },
];
const WAITERS = ['ranjeet', 'budha', 'ratandip', 'khuman', 'devendra'];

/* ------------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------------ */

/** A seeded random number generator, so a re-run plays the same days. */
function generator(seed) {
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
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    weighted: (entries) => {
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
  };
}

const addDays = (date, days) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

/** Minutes after midnight IST on `date` as an instant. Past 1440 is the next calendar day. */
const at = (date, minutes) => new Date(new Date(`${date}T00:00:00+05:30`).getTime() + minutes * 60_000);

class Session {
  constructor(phone) {
    this.phone = phone;
    this.token = null;
  }

  async login() {
    const response = await request('POST', '/api/v1/auth/login', { body: { phone: this.phone, password: PASSWORD } });
    if (response.status !== 200) throw new Error(`Sign-in failed for ${this.phone}: ${JSON.stringify(response.body)}`);
    this.token = response.body.data.accessToken;
    return this.token;
  }

  /** One API call. An expired token (tokens keep real time) is renewed once. */
  async call(method, pathName, body) {
    if (!this.token) await this.login();
    let response = await request(method, `/api/v1${pathName}`, { token: this.token, body });
    if (response.status === 401) {
      await this.login();
      response = await request(method, `/api/v1${pathName}`, { token: this.token, body });
    }
    if (response.status < 200 || response.status >= 300) {
      const error = new Error(`${method} ${pathName}: ${response.status} ${JSON.stringify(response.body)}`);
      error.status = response.status;
      throw error;
    }
    return response.body.data;
  }
}

/* ------------------------------------------------------------------------ *
 * The restaurant
 * ------------------------------------------------------------------------ */

async function setUpRestaurant() {
  console.log(`Setting up "${MOCK_RESTAURANT}".`);
  setClockForTests(at(addDays(FIRST_DAY, -1), 9 * 60));
  await runProvisioning({
    restaurantName: MOCK_RESTAURANT,
    ownerName: 'Owner',
    ownerPhone: OWNER_PHONE,
    ownerEmail: null,
    password: PASSWORD,
  });
  const owner = new Session(OWNER_PHONE);
  await owner.login();

  const raw = JSON.parse(readFileSync(path.join(REPO_ROOT, 'setup', 'caffeza.json'), 'utf8'));
  // Staff are made below with known demo phones and the demo password.
  delete raw.staff;
  // Keep the demo name: the file's "Cafezza" would hide it from --fresh and from the wipe.
  if (raw.restaurant) delete raw.restaurant.name;
  const { config: setupConfig, toConfirm } = validateSetupConfig(raw);
  const client = apiClient((method, pathName, options) => request(method, `/api/v1${pathName}`, options), owner.token);
  await applySetup(await planSetup(client, setupConfig, { toConfirm }));
  console.log('  Settings, stations, 34 tables, payment methods, accounts, look and logo done.');

  await owner.login();
  const menuClient = apiClient((method, pathName, options) => request(method, `/api/v1${pathName}`, options), owner.token);
  const menu = readMenu(readFileSync(path.join(REPO_ROOT, 'setup', 'caffeza-zomato-menu.csv'), 'utf8'));
  if (menu.errors?.length) throw new Error(`The menu file has problems: ${JSON.stringify(menu.errors.slice(0, 3))}`);
  await applyMenu(await planMenu(menuClient, menu, { config: setupConfig }));
  console.log(`  Menu: ${menu.categories.length} categories, ${menu.categories.reduce((sum, c) => sum + c.items.length, 0)} items.`);

  const stations = await owner.call('GET', '/stations');
  for (const person of STAFF) {
    const stationId = person.station ? stations.find((station) => station.name === person.station)?.id : undefined;
    await owner.call('POST', '/users', {
      name: person.name,
      phone: person.phone,
      role: person.role,
      password: PASSWORD,
      ...(stationId ? { stationId } : {}),
    });
  }
  console.log(`  ${STAFF.length} staff logins.`);
  resetClockForTests();
}

/* ------------------------------------------------------------------------ *
 * One day
 * ------------------------------------------------------------------------ */

const BEVERAGE_STATION = 'Beverages';

/** The hour of a new order, weighted to lunch and dinner. */
const HOURS = [
  [11, 5], [12, 9], [13, 13], [14, 11], [15, 7], [16, 6], [17, 8], [18, 10], [19, 13], [20, 15], [21, 14], [22, 8], [23, 3],
];

function planDay(date, dayIndex, menu, random) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  const count = weekend ? random.int(150, 165) : random.int(120, 140);

  const orders = [];
  for (let n = 0; n < count; n += 1) {
    const hour = random.weighted(HOURS);
    const minute = hour * 60 + random.int(0, 59);
    const type = random.weighted([['DINE_IN', 58], ['TAKEAWAY', 14], ['SWIGGY', 15], ['ZOMATO', 13]]);
    orders.push({ type, opensAt: Math.min(minute, 23 * 60 + 15) });
  }
  orders.sort((a, b) => a.opensAt - b.opensAt);

  // A few of the day's dine-in orders carry an exception, one each.
  const dineIn = orders.filter((order) => order.type === 'DINE_IN');
  const exceptions = [
    'NO_CHARGE',
    'VOID_REBILL',
    'ON_HOLD_E210',
    ...(dayIndex % 2 === 0 ? ['ON_HOLD_W330'] : []),
    'CANCEL_AFTER_PREP',
    'CANCEL_AFTER_PREP',
    'CANCEL_BEFORE_FIRE',
    'CANCEL_BEFORE_FIRE',
    'CANCEL_BEFORE_FIRE',
  ];
  for (const exception of exceptions) {
    const candidates = dineIn.filter((order) => !order.exception && order.opensAt < 22 * 60);
    if (candidates.length > 0) random.pick(candidates).exception = exception;
  }

  for (const order of orders) {
    const lines = random.int(1, order.type === 'DINE_IN' ? 5 : 3);
    const chosen = new Map();
    for (let i = 0; i < lines; i += 1) {
      const pool = random.chance(0.45) ? menu.beverages : menu.food;
      const item = random.pick(pool.length > 0 ? pool : menu.all);
      chosen.set(item.id, (chosen.get(item.id) ?? 0) + (random.chance(0.2) ? 2 : 1));
    }
    order.lines = [...chosen].map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
    order.guests = order.type === 'DINE_IN' ? random.weighted([[1, 8], [2, 34], [3, 20], [4, 22], [5, 8], [6, 8]]) : null;
    order.waiter = random.pick(WAITERS);
    order.kitchenMinutes = random.int(10, 24);
    order.eatMinutes = order.type === 'DINE_IN' ? random.int(18, 45) : random.int(1, 4);
    order.payMinutes = order.type === 'DINE_IN' ? random.int(2, 8) : 0;
    order.method =
      order.type === 'SWIGGY' || order.type === 'ZOMATO'
        ? order.type
        : random.weighted([
            ['UPI', 40],
            ['CASH', 28],
            ['CARD', 20],
            ...(order.type === 'DINE_IN' ? [['ZOMATO_GOLD', 6], ['DINEOUT', 4], ['EAZYDINER', 2]] : []),
          ]);
    order.split = order.type !== 'SWIGGY' && order.type !== 'ZOMATO' && !order.method.match(/GOLD|DINEOUT|EAZY/) && random.chance(0.05);
    order.discount = null;
    if (['ZOMATO_GOLD', 'DINEOUT', 'EAZYDINER'].includes(order.method)) {
      order.discount = { kind: 'PERCENT', rateBps: order.method === 'ZOMATO_GOLD' ? 1000 : 1500, reasonCode: order.method };
    } else if (order.type === 'DINE_IN' && random.chance(0.06)) {
      order.discount = random.pick([
        { kind: 'PERCENT', rateBps: 1000, reasonCode: 'REGULAR_GUEST' },
        { kind: 'PERCENT', rateBps: 500, reasonCode: 'REFERRAL' },
        { kind: 'FLAT', valueInPaise: 10000, reasonCode: 'MERCHANT_PROMO', note: 'FIRST100' },
      ]);
    }
    order.platformOrderId = order.type === 'SWIGGY' ? `${2490000 + dayIndex * 1000 + random.int(0, 999)}${random.int(10000000, 99999999)}` : order.type === 'ZOMATO' ? `${8600000000 + dayIndex * 100000 + random.int(0, 99999)}` : null;
  }

  return orders;
}

async function playDay(date, dayIndex, people, ids, menu) {
  const random = generator(20260922 + dayIndex * 7919);
  const orders = planDay(date, dayIndex, menu, random);
  const { manager, counter, owner } = people;
  const clock = (minutes) => setClockForTests(at(date, minutes));

  /** Event queue: [minute, order of creation, action]. Run in time order. */
  const queue = [];
  let sequence = 0;
  const later = (minute, action, state = null) => queue.push([minute, sequence++, action, state]);

  // A table someone is using in the app right now is left out of the plan.
  const busyNow = new Set(
    (await owner.call('GET', '/tables')).filter((table) => table.occupancy?.isOccupied).map((table) => table.id),
  );
  const tableFreeAt = new Map(ids.tables.map((table) => [table.id, busyNow.has(table.id) ? Infinity : 0]));
  const freeTable = (minute) => {
    const free = ids.tables.filter((table) => tableFreeAt.get(table.id) <= minute);
    return free.length > 0 ? random.pick(free) : null;
  };

  const stats = { orders: 0, bills: 0, noCharge: 0, voids: 0, onHold: 0, skipped: 0 };
  const usedPlatformIds = new Set();

  later(10 * 60 + 30, async () => {
    await manager.call('POST', '/cash-movements', { type: 'OPENING_FLOAT', amountInPaise: 300000 });
  });
  for (const [minute, amountInPaise, reason] of [[14 * 60 + 10, 45000, 'Milk from the dairy'], [18 * 60 + 40, random.int(6, 14) * 10000, 'Vegetables']]) {
    later(minute, () => manager.call('POST', '/cash-movements', { type: 'PAID_OUT', amountInPaise, reason }));
  }
  // A collection against the office tabs every few days, in cash, of what was charged so far.
  if (dayIndex > 0 && dayIndex % 3 === 0) {
    later(13 * 60 + 15, async () => {
      for (const account of ids.accounts) {
        const owed = ids.charged.get(account.id) ?? 0;
        if (owed <= 0) continue;
        await counter.call('POST', `/accounts/${account.id}/collections`, { method: 'CASH', amountInPaise: owed });
        ids.charged.set(account.id, 0);
      }
    });
  }

  for (const order of orders) {
    const opensAt = order.opensAt;
    let table = null;
    if (order.type === 'DINE_IN') {
      table = freeTable(opensAt);
      if (!table) order.type = 'TAKEAWAY';
    }
    if (order.type === 'SWIGGY' || order.type === 'ZOMATO') {
      while (usedPlatformIds.has(order.platformOrderId)) order.platformOrderId = `${order.platformOrderId}1`;
      usedPlatformIds.add(order.platformOrderId);
    }
    const servedAt = opensAt + order.kitchenMinutes;
    const billedAt = servedAt + order.eatMinutes;
    const paidAt = billedAt + order.payMinutes;
    // A voided and re-issued bill is paid four minutes later than planned.
    if (table) tableFreeAt.set(table.id, paidAt + 3 + (order.exception === 'VOID_REBILL' ? 4 : 0));

    const captain = order.type === 'DINE_IN' ? people[order.waiter] : counter;
    const state = { label: `${date} ${order.type} ${order.exception ?? ''}`.trim() };

    later(opensAt, async () => {
      const body =
        order.type === 'DINE_IN'
          ? { orderType: 'DINE_IN', tableId: table.id, guestCount: order.guests, lines: order.lines }
          : order.type === 'TAKEAWAY'
            ? { orderType: 'TAKEAWAY', lines: order.lines }
            : { orderType: 'DELIVERY', platform: { code: order.type, orderId: order.platformOrderId }, lines: order.lines };
      let opened;
      try {
        opened = await captain.call('POST', '/orders', body);
      } catch (error) {
        // Someone opened this table in the app while the loader ran: serve this party as takeaway.
        if (!/TABLE_OCCUPIED/.test(error.message)) throw error;
        opened = await captain.call('POST', '/orders', { orderType: 'TAKEAWAY', lines: order.lines });
      }
      if (order.exception === 'CANCEL_BEFORE_FIRE') {
        // An extra dish entered by mistake and taken off before it reached the kitchen.
        opened = await captain.call('POST', `/orders/${opened.id}/lines`, {
          version: opened.version,
          lines: [{ menuItemId: random.pick(menu.food.length ? menu.food : menu.all).id, quantity: 1 }],
        });
        const extra = opened.lines[opened.lines.length - 1];
        opened = await captain.call('POST', `/orders/${opened.id}/lines/${extra.id}/cancel`, {
          version: opened.version,
          reasonCode: random.pick(['WRONG_ITEM', 'DUPLICATE']),
        });
      }
      const fired = await captain.call('POST', `/orders/${opened.id}/fire`, { version: opened.version });
      state.orderId = opened.id;
      state.order = fired.order;
      state.kots = fired.kots ?? (fired.kot ? [fired.kot] : []);
      stats.orders += 1;
    }, state);

    if (order.exception === 'NO_CHARGE') {
      later(opensAt + 20, async () => {
        // Free food is still cooked: the kitchen marks it ready, so no ticket is left open.
        for (const kot of state.kots) await manager.call('PATCH', `/kots/${kot.id}/ready`);
        const current = await manager.call('GET', `/orders/${state.orderId}`);
        await manager.call('POST', `/orders/${state.orderId}/no-charge`, {
          version: current.version,
          reasonCode: random.pick(['STAFF_MEAL', 'OWNER_GUEST', 'CORPORATE_OFFICE']),
        });
        stats.noCharge += 1;
        if (table) tableFreeAt.set(table.id, opensAt + 23);
      }, state);
      continue;
    }

    if (order.exception === 'CANCEL_AFTER_PREP') {
      later(servedAt - 2, async () => {
        const current = await captain.call('GET', `/orders/${state.orderId}`);
        const live = current.lines.filter((line) => line.status !== 'CANCELLED');
        if (live.length < 2) return; // keep at least one dish on the bill
        await captain.call('POST', `/orders/${state.orderId}/lines/${live[0].id}/cancel`, {
          version: current.version,
          reasonCode: random.pick(['MODIFICATION', 'QUALITY']),
          wasPrepared: true,
        });
      }, state);
    }

    later(servedAt, async () => {
      for (const kot of state.kots) {
        try {
          await counter.call('PATCH', `/kots/${kot.id}/ready`);
        } catch (error) {
          // A ticket whose only line was cancelled after preparation has nothing left to make.
          if (error.status !== 409 && error.status !== 422) throw error;
        }
      }
      let current = await captain.call('GET', `/orders/${state.orderId}`);
      for (const line of current.lines) {
        if (line.status !== 'READY') continue;
        current = await captain.call('PATCH', `/orders/${state.orderId}/lines/${line.id}/served`, { version: current.version });
      }
      state.order = current;
    }, state);

    const bill = async () => {
      const current = await counter.call('GET', `/orders/${state.orderId}`);
      let issued;
      try {
        issued = await counter.call('POST', '/bills', { orderId: current.id, version: current.version });
      } catch (error) {
        const lines = current.lines.map((line) => `${line.itemName}:${line.status}`).join(', ');
        console.error(`  Billing ${order.type} ${order.exception ?? ''} order #${current.orderNumber} (${current.status}) failed. Lines: ${lines}. Tickets: ${state.kots.length}.`);
        throw error;
      }
      if (order.discount) issued = await manager.call('POST', `/bills/${issued.id}/discount`, order.discount);
      state.bill = issued;
      stats.bills += 1;
    };
    later(billedAt, bill, state);

    if (order.exception === 'VOID_REBILL') {
      later(billedAt + 3, async () => {
        await manager.call('POST', `/bills/${state.bill.id}/void`, { reasonCode: 'ITEMS_CHANGED', note: 'Guest changed the order' });
        stats.voids += 1;
        await bill();
      }, state);
    }

    later(paidAt + (order.exception === 'VOID_REBILL' ? 4 : 0), async () => {
      const total = state.bill.grandTotalInPaise;
      if (order.exception === 'ON_HOLD_E210' || order.exception === 'ON_HOLD_W330') {
        const account = ids.accounts.find((entry) => entry.name === (order.exception === 'ON_HOLD_E210' ? 'E-210 Office' : 'W-330 Office'));
        await manager.call('POST', `/bills/${state.bill.id}/charge-to-account`, { accountId: account.id });
        ids.charged.set(account.id, (ids.charged.get(account.id) ?? 0) + total);
        stats.onHold += 1;
        return;
      }
      if (order.split && total >= 20000) {
        const half = Math.floor(total / 200) * 100;
        await counter.call('POST', `/bills/${state.bill.id}/payments`, { method: 'CASH', amountInPaise: half });
        await counter.call('POST', `/bills/${state.bill.id}/payments`, { method: 'UPI', amountInPaise: total - half });
        return;
      }
      await counter.call('POST', `/bills/${state.bill.id}/payments`, { method: order.method, amountInPaise: total });
      state.done = true;
    }, state);
  }

  /**
   * An order that hits trouble (most often a person using the same restaurant
   * in the app while the loader runs) is set aside rather than stopping the
   * run: its bill is voided and the order cancelled, so the day still closes.
   */
  const setAside = async (state, error) => {
    state.abandoned = true;
    stats.skipped += 1;
    console.warn(`  Set aside one order (${state.label}): ${error.message.slice(0, 160)}`);
    const note = 'Mock data, set aside by the loader';
    try {
      if (state.bill && !state.done) await manager.call('POST', `/bills/${state.bill.id}/void`, { reasonCode: 'OTHER', note });
    } catch {
      // Already paid, voided or charged: nothing left to undo.
    }
    if (!state.orderId) return;
    try {
      const current = await manager.call('GET', `/orders/${state.orderId}`);
      if (current.status !== 'OPEN' && current.status !== 'READY_TO_BILL') return;
      const fired = current.lines.some((line) => ['FIRED', 'READY', 'SERVED'].includes(line.status));
      await manager.call('POST', `/orders/${state.orderId}/cancel`, {
        version: current.version,
        reasonCode: 'OTHER',
        note,
        ...(fired ? { wasPrepared: true } : {}),
      });
    } catch (cancelError) {
      console.warn(`  Could not cancel it: ${cancelError.message.slice(0, 160)}`);
    }
  };

  queue.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [minute, , action, state] of queue) {
    if (state?.abandoned) continue;
    clock(minute);
    try {
      await action();
    } catch (error) {
      if (!state) throw error;
      await setAside(state, error);
    }
  }

  // Close the day the next morning, still its business date (the day starts at 5:00 AM).
  clock(24 * 60 + 90);
  const view = await owner.call('GET', `/day-close/${date}`);
  const expected = view.expectedCashInPaise;
  const short = dayIndex === 3 || dayIndex === 7;
  await manager.call('POST', '/day-close', {
    businessDate: date,
    countedCashInPaise: short ? expected - 10000 : expected,
    ...(short ? { note: 'Counted twice, ₹100 short' } : {}),
  });
  resetClockForTests();
  return stats;
}

/* ------------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------------ */

async function main() {
  assertSafeToSeed();
  if (config.NODE_ENV !== 'test') {
    throw new Error('Run it through `npm run seed:mock`, which runs it as NODE_ENV=test so it can set the clock.');
  }
  if (!PASSWORD) throw new Error('Set DEMO_PASSWORD in .env first. Every mock login uses it.');
  const fresh = process.argv.includes('--fresh');

  await connectDatabase();
  await startTestServer();
  try {
    console.log(`Loading ${DAYS} mock days into ${databaseHost()}.`);
    for (const model of ALL_MODELS) await model.init();

    if (fresh && (await wipeRestaurantNamed(MOCK_RESTAURANT))) console.log(`  Wiped the previous "${MOCK_RESTAURANT}".`);
    // The tenancy root, looked up by its fixed demo name: the seed scripts' one sanctioned lookup.
    const existing = await Restaurant.findOne({ name: MOCK_RESTAURANT }).select('_id').lean();
    if (!existing) await setUpRestaurant();

    const people = { owner: new Session(OWNER_PHONE) };
    for (const person of STAFF) people[person.key] = new Session(person.phone);

    const tables = (await people.owner.call('GET', '/tables')).filter((table) => table.isActive);
    const accounts = await people.owner.call('GET', '/accounts');
    const tree = await people.owner.call('GET', '/menu');
    const stations = await people.owner.call('GET', '/stations');
    const beverageStation = stations.find((station) => station.name === BEVERAGE_STATION)?.id;
    const categories = await people.owner.call('GET', '/categories');
    const beverageCategories = new Set(categories.filter((category) => category.stationId === beverageStation).map((category) => category.id));
    const all = tree.flatMap((category) => category.items.filter((item) => item.variants.length === 0).map((item) => ({ ...item, categoryId: category.id })));
    const menu = {
      all,
      beverages: all.filter((item) => beverageCategories.has(item.categoryId)),
      food: all.filter((item) => !beverageCategories.has(item.categoryId)),
    };
    const ids = { tables, accounts, charged: new Map() };

    const totals = { orders: 0, bills: 0, noCharge: 0, voids: 0, onHold: 0 };
    for (let dayIndex = 0; dayIndex < DAYS; dayIndex += 1) {
      const date = addDays(FIRST_DAY, dayIndex);
      const day = await people.owner.call('GET', `/day-close/${date}`);
      if (day.isClosed) {
        console.log(`  ${date} already closed, skipped.`);
        continue;
      }
      if ((day.figures?.sales?.billCount ?? 0) > 0) {
        throw new Error(`${date} has bills but was not closed: an earlier run stopped part way. Run again with --fresh.`);
      }
      const started = Date.now();
      const stats = await playDay(date, dayIndex, people, ids, menu);
      for (const key of Object.keys(totals)) totals[key] += stats[key];
      console.log(
        `  ${date}: ${stats.bills} bills from ${stats.orders} orders, ${stats.onHold} On Hold, ${stats.voids} void, ${stats.noCharge} No Charge${stats.skipped ? `, ${stats.skipped} set aside` : ''}. Closed. ${Math.round((Date.now() - started) / 1000)}s`,
      );
    }

    console.log('');
    console.log(`Done. ${totals.bills} bills across ${DAYS} days, every day closed. Today is empty.`);
    console.log(`Every login's password is DEMO_PASSWORD from .env. Owner ${OWNER_PHONE}.`);
    for (const person of STAFF) console.log(`  ${person.name.padEnd(16)} ${person.phone}  ${person.role}`);
  } finally {
    resetClockForTests();
    await stopTestServer();
    await disconnectDatabase();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { main };
