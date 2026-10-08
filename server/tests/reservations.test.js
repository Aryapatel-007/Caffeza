/**
 * M14 table bookings, built in P23. docs/API-CONTRACT.md M14 sections 2.7 to
 * 2.9 and 3.3, and the floor's `upcomingReservation`.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, describe, it } from 'node:test';

import { ALL_MODELS } from '../models/index.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { createTable, seedTeam } from './helpers/m2Fixtures.js';
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

const LUNCH = new Date('2026-10-08T13:00:00+05:30');
const ist = (time, date = '2026-10-10') => new Date(`${date}T${time}:00+05:30`);
const minutesAfter = (date, minutes) => new Date(date.getTime() + minutes * 60_000);

let slugCounter = 0;

async function seedBookings() {
  setClockForTests(LUNCH);
  const team = await seedTeam();
  const owner = team.tokens.OWNER;
  slugCounter += 1;
  const slug = `book-${slugCounter}`;
  await request('PATCH', '/api/v1/settings', {
    token: owner,
    body: { reason: 'Bookings', features: { online: true }, online: { reservationsEnabled: true } },
  });
  await request('PATCH', '/api/v1/online/site', { token: owner, body: { publicSlug: slug } });
  const table = (await createTable(owner, { name: 'Table 5', seats: 4 })).body.data;
  return { ...team, owner, slug, table };
}

const bookingBody = (overrides = {}) => ({
  idempotencyKey: randomUUID(),
  guestName: 'Asha',
  guestPhone: '9876543210',
  partySize: 4,
  at: ist('20:00').toISOString(),
  note: 'Birthday',
  ...overrides,
});

const requestBooking = (world, overrides) =>
  request('POST', `/api/v1/public/${world.slug}/reservations`, { body: bookingBody(overrides) });

const staff = (method, path, token, body) => request(method, `/api/v1/online/reservations${path}`, { token, body });

describe('booking from the page', () => {
  it('offers slots from opening until the hold length before closing', async () => {
    const world = await seedBookings();
    const slots = await request('GET', `/api/v1/public/${world.slug}/reservations/slots?date=2026-10-10&partySize=4`);
    assert.equal(slots.status, 200, JSON.stringify(slots.body));
    const times = slots.body.data.slots.map((slot) => new Date(slot).getTime());
    // 10:00 AM to 11:00 PM, 30-minute slots, a 90-minute hold: the last is 9:30 PM.
    assert.equal(times[0], ist('10:00').getTime());
    assert.equal(times.at(-1), ist('21:30').getTime());
    assert.equal(times.length, 24);

    const today = await request('GET', `/api/v1/public/${world.slug}/reservations/slots?date=2026-10-08&partySize=2`);
    // Nothing before 1:20 PM today: now plus the 20-minute lead.
    assert.equal(new Date(today.body.data.slots[0]).getTime(), new Date('2026-10-08T13:30:00+05:30').getTime());

    const tooMany = await request('GET', `/api/v1/public/${world.slug}/reservations/slots?date=2026-10-10&partySize=11`);
    assert.equal(tooMany.status, 400);
    const tooFar = await request('GET', `/api/v1/public/${world.slug}/reservations/slots?date=2026-11-30&partySize=2`);
    assert.equal(tooFar.status, 400);
  });

  it('takes a request at an offered time, and refuses one off the list', async () => {
    const world = await seedBookings();
    const placed = await requestBooking(world);
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    assert.equal(placed.body.data.reference, 'R-1');
    assert.equal(placed.body.data.status, 'REQUESTED');

    const offList = await requestBooking(world, { at: ist('20:10').toISOString() });
    assert.equal(offList.status, 400);
  });

  it('limits one phone to three open bookings', async () => {
    const world = await seedBookings();
    for (const time of ['12:00', '14:00', '16:00']) {
      assert.equal((await requestBooking(world, { at: ist(time).toISOString() })).status, 201);
    }
    const fourth = await requestBooking(world, { at: ist('18:00').toISOString() });
    assert.equal(fourth.status, 422);
    assert.equal(fourth.body.error.code, 'TOO_MANY_OPEN_REQUESTS');
  });

  it('lets the guest read and cancel it with the token only', async () => {
    const world = await seedBookings();
    const placed = (await requestBooking(world)).body.data;
    const path = `/api/v1/public/${world.slug}/reservations/${placed.id}`;
    assert.equal((await request('GET', path)).status, 404);
    const headers = { 'X-Status-Token': placed.statusToken };
    assert.equal((await request('GET', path, { headers })).body.data.partySize, 4);
    const cancelled = await request('POST', `${path}/cancel`, { headers });
    assert.equal(cancelled.body.data.status, 'CANCELLED');
  });
});

describe('the booking book', () => {
  it('confirms on a table, and refuses a second booking on that table inside the hold', async () => {
    const world = await seedBookings();
    const first = (await requestBooking(world)).body.data;
    const confirmed = await staff('POST', `/${first.id}/confirm`, world.tokens.CASHIER, { tableId: world.table.id });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.data.status, 'CONFIRMED');
    assert.equal(confirmed.body.data.tableName, 'Table 5');

    const second = (await requestBooking(world, { guestPhone: '9123456789', at: ist('21:00').toISOString() })).body.data;
    const clash = await staff('POST', `/${second.id}/confirm`, world.tokens.CASHIER, { tableId: world.table.id });
    assert.equal(clash.status, 409);
    assert.equal(clash.body.error.code, 'RESERVATION_CLASH');
    assert.equal(clash.body.error.clashes[0].reference, 'R-1');

    const later = (await requestBooking(world, { guestPhone: '9123456780', at: ist('21:30').toISOString() })).body.data;
    const fine = await staff('POST', `/${later.id}/confirm`, world.tokens.CASHIER, { tableId: world.table.id });
    assert.equal(fine.status, 200);
  });

  it('writes a phone booking confirmed, with no status token and no consent', async () => {
    const world = await seedBookings();
    const phone = await staff('POST', '', world.tokens.CASHIER, {
      guestName: 'Mehta',
      guestPhone: '9988776655',
      partySize: 6,
      at: ist('19:00').toISOString(),
    });
    assert.equal(phone.status, 201, JSON.stringify(phone.body));
    assert.equal(phone.body.data.status, 'CONFIRMED');
    assert.equal(phone.body.data.source, 'PHONE');
    assert.equal(phone.body.data.marketingConsent.given, false);
  });

  it('shows Reserved on the floor inside the hold window, and not outside it', async () => {
    const world = await seedBookings();
    const booking = (
      await staff('POST', '', world.tokens.CASHIER, {
        guestName: 'Mehta',
        guestPhone: '9988776655',
        partySize: 4,
        at: ist('20:00', '2026-10-08').toISOString(),
        tableId: world.table.id,
      })
    ).body.data;

    const floorAt = async (when) => {
      setClockForTests(when);
      const tables = (await request('GET', '/api/v1/tables', { token: world.tokens.WAITER })).body.data;
      return tables.find((table) => table.id === world.table.id).occupancy.upcomingReservation;
    };

    assert.equal(await floorAt(ist('18:00', '2026-10-08')), null);
    const soon = await floorAt(ist('18:45', '2026-10-08'));
    assert.equal(soon.reference, booking.reference);
    assert.equal(soon.partySize, 4);
    // Guests running up to 15 minutes late keep the table.
    assert.equal((await floorAt(ist('20:10', '2026-10-08')))?.reference, booking.reference);
    assert.equal(await floorAt(ist('20:20', '2026-10-08')), null);
  });

  it('seats the booking into a dine-in order with its party as covers', async () => {
    const world = await seedBookings();
    const booking = (await requestBooking(world)).body.data;
    await staff('POST', `/${booking.id}/confirm`, world.tokens.CASHIER, {});
    setClockForTests(ist('19:55'));

    const seated = await staff('POST', `/${booking.id}/seat`, world.tokens.WAITER, { tableId: world.table.id, guestCount: 5 });
    assert.equal(seated.status, 200, JSON.stringify(seated.body));
    assert.equal(seated.body.data.reservation.status, 'SEATED');
    const { order } = seated.body.data;
    assert.equal(order.orderType, 'DINE_IN');
    assert.equal(order.guestCount, 5);
    assert.equal(order.origin.kind, 'RESERVATION');
    assert.equal(order.origin.reference, 'R-1');
  });

  it('puts the booking back when its table is already taken', async () => {
    const world = await seedBookings();
    const booking = (await requestBooking(world)).body.data;
    await staff('POST', `/${booking.id}/confirm`, world.tokens.CASHIER, {});
    await request('POST', '/api/v1/orders', {
      token: world.tokens.WAITER,
      body: { orderType: 'DINE_IN', tableId: world.table.id, guestCount: 2 },
    });

    const refused = await staff('POST', `/${booking.id}/seat`, world.tokens.WAITER, { tableId: world.table.id, guestCount: 4 });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error.code, 'TABLE_OCCUPIED');
    const after = await staff('GET', `/${booking.id}`, world.tokens.WAITER);
    assert.equal(after.body.data.status, 'CONFIRMED');
  });

  it('marks a no-show only from 15 minutes after the booked time', async () => {
    const world = await seedBookings();
    const booking = (await requestBooking(world)).body.data;
    await staff('POST', `/${booking.id}/confirm`, world.tokens.CASHIER, {});

    setClockForTests(ist('20:10'));
    const early = await staff('POST', `/${booking.id}/no-show`, world.tokens.CASHIER, {});
    assert.equal(early.status, 422);
    setClockForTests(minutesAfter(ist('20:00'), 15));
    const ok = await staff('POST', `/${booking.id}/no-show`, world.tokens.CASHIER, {});
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.status, 'NO_SHOW');
  });

  it('declines with a reason the guest sees in its guest words', async () => {
    const world = await seedBookings();
    const booking = (await requestBooking(world)).body.data;
    await staff('POST', `/${booking.id}/decline`, world.tokens.CASHIER, { reasonCode: 'FULLY_BOOKED' });
    const read = await request('GET', `/api/v1/public/${world.slug}/reservations/${booking.id}`, {
      headers: { 'X-Status-Token': booking.statusToken },
    });
    assert.equal(read.body.data.status, 'DECLINED');
    assert.equal(read.body.data.declineReason, 'There is no table free at that time');
  });

  it('keeps bookings to their own restaurant and roles', async () => {
    const world = await seedBookings();
    const other = await seedBookings();
    const booking = (await requestBooking(world)).body.data;
    assert.equal((await staff('GET', `/${booking.id}`, other.tokens.CASHIER)).status, 404);
    assert.equal((await staff('POST', `/${booking.id}/confirm`, world.tokens.WAITER, {})).status, 403);
    assert.equal((await staff('GET', '', world.tokens.STOREKEEPER)).status, 403);
    assert.equal((await staff('GET', '')).status, 401);
  });
});
