/**
 * M14 online takeaway, built in P23. docs/API-CONTRACT.md M14 sections 2 and 3.
 *
 * Every request goes through the real API: the public page with no token, and
 * the staff endpoints with each role's token.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, describe, it } from 'node:test';

import { ALL_MODELS } from '../models/index.js';
import { computeBillTotals } from '../utils/tax.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { createMenuItem, seedTeam } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

afterEach(() => resetClockForTests());

/** 1:00 PM on a Thursday, inside the default hours of 10:00 AM to 11:00 PM. */
const LUNCH = new Date('2026-10-08T13:00:00+05:30');
const minutesAfter = (date, minutes) => new Date(date.getTime() + minutes * 60_000);

let slugCounter = 0;

/** A team with online takeaway on, a page address, and two dishes at different GST rates. */
async function seedOnline({ settings = {} } = {}) {
  setClockForTests(LUNCH);
  const team = await seedTeam();
  const owner = team.tokens.OWNER;
  slugCounter += 1;
  const slug = `cafe-${slugCounter}`;

  const turnedOn = await request('PATCH', '/api/v1/settings', {
    token: owner,
    body: {
      reason: 'Start online orders',
      features: { online: true },
      online: { takeawayEnabled: true, reservationsEnabled: true, ...settings },
    },
  });
  assert.equal(turnedOn.status, 200, JSON.stringify(turnedOn.body));
  const site = await request('PATCH', '/api/v1/online/site', { token: owner, body: { publicSlug: slug } });
  assert.equal(site.status, 200, JSON.stringify(site.body));

  const chai = (await createMenuItem(owner, { name: 'Masala Chai', priceInPaise: 24000, taxRateBps: 500 })).body.data;
  const shake = (await createMenuItem(owner, { name: 'Cold Shake', priceInPaise: 15000, taxRateBps: 1800 })).body.data;

  return { ...team, owner, slug, chai, shake };
}

const publicPath = (slug, rest = '') => `/api/v1/public/${slug}${rest}`;

function orderBody(world, overrides = {}) {
  return {
    idempotencyKey: randomUUID(),
    customerName: 'Rishi Parekh',
    customerPhone: '9876543210',
    pickup: 'ASAP',
    lines: [
      { menuItemId: world.chai.id, quantity: 2 },
      { menuItemId: world.shake.id, quantity: 1 },
    ],
    marketingConsent: true,
    ...overrides,
  };
}

const place = (world, overrides) =>
  request('POST', publicPath(world.slug, '/orders'), { body: orderBody(world, overrides) });

const accept = (token, id, body = {}) =>
  request('POST', `/api/v1/online/orders/${id}/accept`, { token, body });

describe('the public page', () => {
  it('describes the restaurant and today\'s takeaway state without signing in', async () => {
    const world = await seedOnline();
    const site = await request('GET', publicPath(world.slug));
    assert.equal(site.status, 200, JSON.stringify(site.body));
    assert.equal(site.body.data.takeaway.openNow, true);
    assert.equal(site.body.data.reservations.enabled, true);
    assert.equal(site.body.data.pageNote, 'Pay at the counter when you collect.');
    assert.equal(new Date(site.body.data.takeaway.earliestPickupAt).getTime(), minutesAfter(LUNCH, 20).getTime());
  });

  it('serves only active, available dishes, each with exactly the contract\'s fields', async () => {
    const world = await seedOnline();
    const gone = (await createMenuItem(world.owner, { name: 'Sold Out Cake' })).body.data;
    await request('PATCH', `/api/v1/menu-items/${gone.id}/availability`, { token: world.owner, body: { isAvailable: false } });

    const menu = await request('GET', publicPath(world.slug, '/menu'));
    assert.equal(menu.status, 200);
    const items = menu.body.data.flatMap((category) => category.items);
    assert.deepEqual(items.map((item) => item.name).sort(), ['Cold Shake', 'Masala Chai']);
    for (const item of items) {
      assert.deepEqual(Object.keys(item).sort(), ['addOns', 'description', 'id', 'name', 'priceInPaise', 'variants']);
    }
  });

  it('gives the same 404 for an unknown address and a restaurant with online orders off', async () => {
    const world = await seedOnline();
    const unknown = await request('GET', publicPath('no-such-cafe'));
    await request('PATCH', '/api/v1/settings', { token: world.owner, body: { reason: 'Off', features: { online: false } } });
    const off = await request('GET', publicPath(world.slug));
    assert.equal(unknown.status, 404);
    assert.equal(off.status, 404);
    assert.deepEqual(off.body, unknown.body);
  });

  it('quotes with the bill\'s own arithmetic and writes nothing', async () => {
    const world = await seedOnline();
    const quote = await request('POST', publicPath(world.slug, '/quote'), {
      body: { lines: orderBody(world).lines },
    });
    assert.equal(quote.status, 200, JSON.stringify(quote.body));

    const expected = computeBillTotals({
      lines: [
        { taxRateBps: 500, lineTotalInPaise: 48000 },
        { taxRateBps: 1800, lineTotalInPaise: 15000 },
      ],
    });
    assert.deepEqual(quote.body.data.estimate, {
      itemTotalInPaise: expected.subtotalInPaise,
      gstInPaise: expected.totalTaxInPaise,
      roundOffInPaise: expected.roundOffInPaise,
      billTotalInPaise: expected.grandTotalInPaise,
    });
    const waiting = await request('GET', '/api/v1/online/orders', { token: world.tokens.CASHIER });
    assert.equal(waiting.body.data.length, 0);
  });
});

describe('placing a takeaway', () => {
  it('waits for the cafe, with a reference, a token sent once, and consent recorded', async () => {
    const world = await seedOnline();
    const placed = await place(world);
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    assert.equal(placed.body.data.reference, 'W-1');
    assert.equal(placed.body.data.status, 'WAITING');
    assert.ok(placed.body.data.statusToken.length >= 40);

    const staff = await request('GET', `/api/v1/online/orders/${placed.body.data.id}`, { token: world.tokens.CASHIER });
    assert.equal(staff.body.data.customerPhone, '9876543210');
    assert.equal(staff.body.data.marketingConsent.given, true);
    assert.equal(staff.body.data.marketingConsent.textVersion, '2026-10-v1');
    assert.equal(staff.body.data.statusTokenHash, undefined);
  });

  it('refuses outside hours, while paused, and with takeaway off', async () => {
    const world = await seedOnline();

    setClockForTests(new Date('2026-10-08T03:00:00+05:30'));
    const night = await place(world);
    assert.equal(night.status, 422);
    assert.equal(night.body.error.code, 'ONLINE_CLOSED');

    setClockForTests(LUNCH);
    await request('POST', '/api/v1/online/pause', { token: world.tokens.CASHIER, body: { minutes: 30 } });
    const paused = await place(world);
    assert.equal(paused.status, 422);
    assert.match(paused.body.error.message, /Back at 1:30/);

    await request('POST', '/api/v1/online/resume', { token: world.tokens.CASHIER, body: {} });
    await request('PATCH', '/api/v1/settings', { token: world.owner, body: { reason: 'Off', online: { takeawayEnabled: false } } });
    const off = await place(world);
    assert.equal(off.status, 422);
    assert.equal(off.body.error.code, 'ONLINE_CLOSED');
  });

  it('refuses the hidden field, and a third waiting order from one phone', async () => {
    const world = await seedOnline();
    const bot = await place(world, { website: 'http://spam.example' });
    assert.equal(bot.status, 400);

    assert.equal((await place(world)).status, 201);
    assert.equal((await place(world)).status, 201);
    const third = await place(world);
    assert.equal(third.status, 422);
    assert.equal(third.body.error.code, 'TOO_MANY_OPEN_REQUESTS');
  });

  it('places once for one idempotency key, however often it is sent', async () => {
    const world = await seedOnline();
    const body = orderBody(world);
    const first = await request('POST', publicPath(world.slug, '/orders'), { body });
    const again = await request('POST', publicPath(world.slug, '/orders'), { body });
    assert.equal(first.status, 201);
    assert.equal(again.status, 200);
    assert.equal(again.body.data.reference, first.body.data.reference);
    assert.equal(again.body.data.statusToken, undefined);
  });

  it('refuses a pickup time outside what the page offers', async () => {
    const world = await seedOnline();
    const tooSoon = await place(world, { pickup: minutesAfter(LUNCH, 5).toISOString() });
    assert.equal(tooSoon.status, 400);
    const chosen = await place(world, { pickup: minutesAfter(LUNCH, 60).toISOString() });
    assert.equal(chosen.status, 201, JSON.stringify(chosen.body));
    assert.equal(new Date(chosen.body.data.pickupAt).getTime(), minutesAfter(LUNCH, 60).getTime());
  });
});

describe('the guest\'s status page', () => {
  it('needs the token, answers 404 without it, and never returns the phone', async () => {
    const world = await seedOnline();
    const placed = (await place(world)).body.data;
    const path = publicPath(world.slug, `/orders/${placed.id}`);

    assert.equal((await request('GET', path)).status, 404);
    assert.equal((await request('GET', path, { headers: { 'X-Status-Token': 'wrong' } })).status, 404);

    const read = await request('GET', path, { headers: { 'X-Status-Token': placed.statusToken } });
    assert.equal(read.status, 200);
    assert.equal(read.body.data.status, 'WAITING');
    assert.equal(JSON.stringify(read.body).includes('9876543210'), false);
  });

  it('lets the guest cancel while it waits, and not after', async () => {
    const world = await seedOnline();
    const placed = (await place(world)).body.data;
    const headers = { 'X-Status-Token': placed.statusToken };
    const cancel = () => request('POST', publicPath(world.slug, `/orders/${placed.id}/cancel`), { headers });
    assert.equal((await cancel()).body.data.status, 'CANCELLED');
    const again = await cancel();
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'REQUEST_ALREADY_DECIDED');
  });

  it('shows the guest the reason\'s guest label, never the staff note', async () => {
    const world = await seedOnline();
    const placed = (await place(world)).body.data;
    await request('POST', `/api/v1/online/orders/${placed.id}/decline`, {
      token: world.tokens.CASHIER,
      body: { reasonCode: 'OTHER', note: 'Same number placed six fake orders last week' },
    });
    const read = await request('GET', publicPath(world.slug, `/orders/${placed.id}`), {
      headers: { 'X-Status-Token': placed.statusToken },
    });
    assert.equal(read.body.data.status, 'DECLINED');
    assert.equal(read.body.data.declineReason, 'The cafe could not take this');
    assert.equal(JSON.stringify(read.body).includes('fake'), false);
  });
});

describe('accepting', () => {
  it('opens an ordinary takeaway order, priced fresh, opened by the cashier, and sends it to the kitchen', async () => {
    const world = await seedOnline();
    const placed = (await place(world)).body.data;
    const accepted = await accept(world.tokens.CASHIER, placed.id);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));

    const { order, kots, onlineOrder } = accepted.body.data;
    assert.equal(onlineOrder.status, 'ACCEPTED');
    assert.equal(onlineOrder.orderId, order.id);
    assert.equal(order.orderType, 'TAKEAWAY');
    assert.equal(order.customerName, 'Rishi Parekh');
    assert.equal(order.origin.kind, 'ONLINE_ORDER');
    assert.equal(order.origin.reference, 'W-1');
    assert.equal(order.totals.subtotalInPaise, 63000);
    assert.ok(order.lines.every((line) => line.status === 'FIRED'));
    assert.equal(kots.length, 1);

    const cashier = (await request('GET', '/api/v1/auth/me', { token: world.tokens.CASHIER })).body.data.user;
    const stored = await request('GET', `/api/v1/orders/${order.id}`, { token: world.tokens.CASHIER });
    assert.equal(stored.body.data.openedBy, cashier.id);

    const ticket = await request('GET', `/api/v1/kots/${kots[0].id}/ticket`, { token: world.tokens.KITCHEN });
    assert.match(ticket.body.data.text, /ONLINE {2}W-1 {2}PICKUP 1:20 PM/);
    assert.match(ticket.body.data.text, /\nRishi\n/);

    const guest = await request('GET', publicPath(world.slug, `/orders/${placed.id}`), {
      headers: { 'X-Status-Token': placed.statusToken },
    });
    assert.equal(guest.body.data.status, 'ACCEPTED');
    assert.equal(guest.body.data.orderNumber, order.orderNumber);
  });

  it('lets exactly one of two people accepting at once win', async () => {
    const world = await seedOnline();
    const placed = (await place(world)).body.data;
    const results = await Promise.all([accept(world.tokens.CASHIER, placed.id), accept(world.tokens.MANAGER, placed.id)]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);

    const orders = await request('GET', '/api/v1/orders?orderType=TAKEAWAY', { token: world.tokens.CASHIER });
    assert.equal(orders.body.data.length, 1);
  });

  it('stops on a changed price until told to accept it, and never accepts an unavailable dish', async () => {
    const world = await seedOnline();
    const placed = (await place(world)).body.data;
    await request('PATCH', `/api/v1/menu-items/${world.chai.id}`, { token: world.owner, body: { priceInPaise: 26000 } });

    const stopped = await accept(world.tokens.CASHIER, placed.id);
    assert.equal(stopped.status, 422);
    assert.equal(stopped.body.error.code, 'ONLINE_ORDER_CHANGED');
    assert.deepEqual(stopped.body.error.changes, [
      { itemName: 'Masala Chai', variantName: null, wasInPaise: 24000, nowInPaise: 26000 },
    ]);
    // Put back, so it can be accepted.
    const still = await request('GET', `/api/v1/online/orders/${placed.id}`, { token: world.tokens.CASHIER });
    assert.equal(still.body.data.status, 'WAITING');

    const taken = await accept(world.tokens.CASHIER, placed.id, { acceptChangedPrices: true });
    assert.equal(taken.status, 200, JSON.stringify(taken.body));
    assert.equal(taken.body.data.order.totals.subtotalInPaise, 2 * 26000 + 15000);
    assert.equal(taken.body.data.onlineOrder.acceptedChangedPrices, true);

    const second = (await place(world, { customerPhone: '9123456789' })).body.data;
    await request('PATCH', `/api/v1/menu-items/${world.shake.id}/availability`, { token: world.owner, body: { isAvailable: false } });
    const refused = await accept(world.tokens.CASHIER, second.id, { acceptChangedPrices: true });
    assert.equal(refused.status, 422);
    assert.deepEqual(refused.body.error.changes, [{ itemName: 'Cold Shake', variantName: null, unavailable: true }]);
  });

  it('reads as expired once nobody answered in time, and cannot then be accepted', async () => {
    const world = await seedOnline();
    const placed = (await place(world)).body.data;
    setClockForTests(minutesAfter(LUNCH, 11));

    const read = await request('GET', `/api/v1/online/orders/${placed.id}`, { token: world.tokens.CASHIER });
    assert.equal(read.body.data.status, 'EXPIRED');
    const late = await accept(world.tokens.CASHIER, placed.id);
    assert.equal(late.status, 409);
    assert.equal(late.body.error.currentStatus, 'EXPIRED');
  });

  it('carries where the order came from onto its bill', async () => {
    const world = await seedOnline();
    const placed = (await place(world)).body.data;
    const { order, kots } = (await accept(world.tokens.CASHIER, placed.id)).body.data;
    await request('PATCH', `/api/v1/kots/${kots[0].id}/ready`, { token: world.tokens.KITCHEN });
    let current = (await request('GET', `/api/v1/orders/${order.id}`, { token: world.tokens.CASHIER })).body.data;
    for (const line of current.lines) {
      current = (
        await request('PATCH', `/api/v1/orders/${order.id}/lines/${line.id}/served`, {
          token: world.tokens.CASHIER,
          body: { version: current.version },
        })
      ).body.data;
    }
    const bill = await request('POST', '/api/v1/bills', { token: world.tokens.CASHIER, body: { orderId: order.id, version: current.version } });
    assert.equal(bill.status, 201, JSON.stringify(bill.body));
    assert.equal(bill.body.data.origin.kind, 'ONLINE_ORDER');
    assert.equal(bill.body.data.origin.reference, 'W-1');
  });
});

describe('the inbox and permissions', () => {
  it('counts what is waiting and names the newest', async () => {
    const world = await seedOnline();
    await place(world);
    await place(world, { customerPhone: '9123456789', lines: [{ menuItemId: world.chai.id, quantity: 3 }] });
    const inbox = await request('GET', '/api/v1/online/inbox', { token: world.tokens.WAITER });
    assert.equal(inbox.status, 200);
    assert.equal(inbox.body.data.waitingOrders, 2);
    assert.equal(inbox.body.data.latest.reference, 'W-2');
    assert.equal(inbox.body.data.latest.itemCount, 3);
  });

  it('refuses without a token, the wrong roles, another restaurant, and a switched-off feature', async () => {
    const world = await seedOnline();
    const other = await seedOnline();
    const placed = (await place(world)).body.data;

    assert.equal((await request('GET', '/api/v1/online/inbox')).status, 401);
    assert.equal((await request('GET', '/api/v1/online/inbox', { token: world.tokens.KITCHEN })).status, 403);
    assert.equal((await accept(world.tokens.WAITER, placed.id)).status, 403);
    assert.equal(
      (await request('PATCH', '/api/v1/online/site', { token: world.tokens.MANAGER, body: { publicSlug: 'mine' } })).status,
      403,
    );

    // Restaurant B's staff, and B's page address, never reach A's request.
    assert.equal((await request('GET', `/api/v1/online/orders/${placed.id}`, { token: other.tokens.CASHIER })).status, 404);
    assert.equal((await accept(other.tokens.CASHIER, placed.id)).status, 404);
    const viaOtherPage = await request('GET', publicPath(other.slug, `/orders/${placed.id}`), {
      headers: { 'X-Status-Token': placed.statusToken },
    });
    assert.equal(viaOtherPage.status, 404);

    await request('PATCH', '/api/v1/settings', { token: world.owner, body: { reason: 'Off', features: { online: false } } });
    const off = await request('GET', '/api/v1/online/inbox', { token: world.tokens.CASHIER });
    assert.equal(off.status, 403);
    assert.equal(off.body.error.code, 'FEATURE_DISABLED');
  });

  it('refuses a page address another restaurant already has, and a reserved one', async () => {
    const world = await seedOnline();
    const other = await seedOnline();
    const taken = await request('PATCH', '/api/v1/online/site', { token: other.owner, body: { publicSlug: world.slug } });
    assert.equal(taken.status, 409);
    const reserved = await request('PATCH', '/api/v1/online/site', { token: other.owner, body: { publicSlug: 'admin' } });
    assert.equal(reserved.status, 400);
  });

  it('tells every device about online orders through /auth/me', async () => {
    const world = await seedOnline();
    const me = await request('GET', '/api/v1/auth/me', { token: world.tokens.CASHIER });
    assert.deepEqual(me.body.data.online, {
      enabled: true,
      takeawayEnabled: true,
      reservationsEnabled: true,
      alertRoles: ['OWNER', 'MANAGER', 'CASHIER'],
      publicSlug: world.slug,
      pausedUntil: null,
    });
  });
});
