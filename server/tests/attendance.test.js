/**
 * Employee attendance tests.
 *
 * The interesting cases are not the happy paths. They are: the minute
 * arithmetic and the business-day derivation, because a quiet bug there costs
 * someone their wages; "one open shift per person" holding under two tablets
 * racing; a manager able to fix an owner's entry but nobody able to fix their
 * own; and a cross-restaurant entry id answering 404, never 403.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ROLES } from '../config/roles.js';
import { AttendanceEntry } from '../models/AttendanceEntry.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { DEFAULT_PASSWORD, seedFullRestaurant, seedUser } from './helpers/seed.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';
import { businessDateFor, minutesBetween } from '../utils/time.js';

/** Fixed instants used by the manager-create tests, so durations are exact. */
const CLOCK_IN = '2026-08-29T04:00:00.000Z'; // 09:30 IST
const CLOCK_OUT = '2026-08-29T12:00:00.000Z'; // 17:30 IST, 480 minutes later
const CLOCK_OUT_LATER = '2026-08-29T13:00:00.000Z'; // 540 minutes after CLOCK_IN
const BUSINESS_DATE = '2026-08-29';

before(async () => {
  await startTestDatabase();
  await startTestServer();
  // The one-open-shift test depends on the partial unique index existing.
  await AttendanceEntry.init();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
});

const tokenFor = async (phone) =>
  (await request('POST', '/api/v1/auth/login', { body: { phone, password: DEFAULT_PASSWORD } })).body
    .data.accessToken;

/** A restaurant with one user in each of the six roles, all signed in. */
async function seedTeam(options = {}) {
  const base = await seedFullRestaurant(options);
  const { restaurant, branch } = base;

  const tokens = { OWNER: await tokenFor(base.phone) };
  const users = { OWNER: base.user };

  for (const role of [ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN, ROLES.STOREKEEPER]) {
    const seeded = await seedUser({ restaurant, branch, name: role, role });
    tokens[role] = await tokenFor(seeded.phone);
    users[role] = seeded.user;
  }

  return { ...base, tokens, users };
}

const clockIn = (token) => request('POST', '/api/v1/attendance/clock-in', { token });
const clockOut = (token) => request('POST', '/api/v1/attendance/clock-out', { token });

function manualEntry(token, userId, overrides = {}) {
  return request('POST', '/api/v1/attendance', {
    token,
    body: {
      userId: String(userId),
      clockInAt: CLOCK_IN,
      clockOutAt: CLOCK_OUT,
      reason: 'Reconstructed from the shift sheet',
      ...overrides,
    },
  });
}

// ---------------------------------------------------------------------------

describe('worked minutes and the business day', () => {
  it('drops seconds and counts whole minutes across midnight', () => {
    assert.equal(
      minutesBetween(new Date('2026-08-29T18:00:00.000Z'), new Date('2026-08-30T02:30:00.000Z')),
      510,
    );
    assert.equal(
      minutesBetween(new Date('2026-08-29T09:00:00.000Z'), new Date('2026-08-29T09:00:59.000Z')),
      0,
    );
  });

  it('counts a late-night shift under the day it started', () => {
    // 05:00 IST boundary. 01:30 IST is before it, so it belongs to the day before.
    assert.equal(businessDateFor(new Date('2026-08-29T20:00:00.000Z'), 300), '2026-08-29');
    assert.equal(businessDateFor(new Date('2026-08-29T23:35:00.000Z'), 300), '2026-08-30'); // 05:05 IST
    assert.equal(businessDateFor(new Date('2026-08-29T23:25:00.000Z'), 300), '2026-08-29'); // 04:55 IST
  });

  it('honours a per-restaurant boundary of midnight', () => {
    assert.equal(businessDateFor(new Date('2026-08-29T20:00:00.000Z'), 0), '2026-08-30'); // 01:30 IST
  });

  it('derives businessDate and workedMinutes on a manager-created entry', async () => {
    const team = await seedTeam();

    const created = await manualEntry(team.tokens.MANAGER, team.users.WAITER._id);

    assert.equal(created.status, 201);
    assert.equal(created.body.data.businessDate, BUSINESS_DATE);
    assert.equal(created.body.data.workedMinutes, 480);
    assert.equal(created.body.data.clockInSource, 'MANAGER');
    assert.equal(created.body.data.clockOutSource, 'MANAGER');
    assert.equal(created.body.data.corrections.length, 1);
    assert.equal(created.body.data.corrections[0].field, 'CREATION');
  });

  it('crosses the configured boundary: same shift, two different business dates', async () => {
    const team = await seedTeam();
    const waiterId = team.users.WAITER._id;

    // clock-in at 01:30 IST on the 30th. Default 05:00 boundary -> the 29th.
    const first = await manualEntry(team.tokens.MANAGER, waiterId, {
      clockInAt: '2026-08-29T20:00:00.000Z',
      clockOutAt: '2026-08-30T03:00:00.000Z',
    });
    assert.equal(first.body.data.businessDate, '2026-08-29');

    // Move the boundary to midnight, and the identical clock-in is now the 30th.
    await request('PATCH', '/api/v1/restaurant', {
      token: team.tokens.OWNER,
      body: { settings: { businessDayStartsAtMinutes: 0 } },
    });

    const second = await manualEntry(team.tokens.MANAGER, waiterId, {
      clockInAt: '2026-08-29T20:00:00.000Z',
      clockOutAt: '2026-08-30T03:00:00.000Z',
    });
    assert.equal(second.body.data.businessDate, '2026-08-30');
  });
});

// ---------------------------------------------------------------------------

describe('clock in and out', () => {
  it('opens a shift, then refuses a second one', async () => {
    const team = await seedTeam();

    const first = await clockIn(team.tokens.WAITER);
    assert.equal(first.status, 201);
    assert.equal(first.body.data.clockOutAt, null);
    assert.equal(first.body.data.workedMinutes, null);
    assert.equal(first.body.data.clockInSource, 'SELF');
    assert.equal(first.body.data.businessDate, businessDateFor(new Date(), 300));
    assert.equal(first.body.data.userName, 'WAITER');

    const second = await clockIn(team.tokens.WAITER);
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'ALREADY_CLOCKED_IN');
  });

  it('closes the shift and computes worked minutes', async () => {
    const team = await seedTeam();

    await clockIn(team.tokens.WAITER);
    const out = await clockOut(team.tokens.WAITER);

    assert.equal(out.status, 200);
    assert.notEqual(out.body.data.clockOutAt, null);
    assert.equal(out.body.data.workedMinutes, 0, 'an immediate clock-out is zero whole minutes');
    assert.equal(out.body.data.clockOutSource, 'SELF');
  });

  it('refuses a clock-out with nothing open', async () => {
    const team = await seedTeam();

    const out = await clockOut(team.tokens.WAITER);
    assert.equal(out.status, 409);
    assert.equal(out.body.error.code, 'NOT_CLOCKED_IN');
  });

  it('keeps exactly one open shift when two tablets race', async () => {
    const team = await seedTeam();

    const [a, b] = await Promise.all([clockIn(team.tokens.WAITER), clockIn(team.tokens.WAITER)]);

    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    assert.equal(
      (a.status === 409 ? a : b).body.error.code,
      'ALREADY_CLOCKED_IN',
    );

    const open = await AttendanceEntry.countDocuments({
      restaurantId: team.restaurant._id,
      userId: team.users.WAITER._id,
      clockOutAt: null,
    });
    assert.equal(open, 1);
  });
});

// ---------------------------------------------------------------------------

describe('my attendance', () => {
  it('reports the open shift, then the closed one in the week total', async () => {
    const team = await seedTeam();

    await clockIn(team.tokens.WAITER);
    const during = await request('GET', '/api/v1/attendance/me', { token: team.tokens.WAITER });

    assert.equal(during.status, 200);
    assert.ok(during.body.data.openShift);
    assert.equal(during.body.data.openShift.openMinutes, 0);
    assert.deepEqual(during.body.data.recent, [], 'the open shift is not repeated in recent');
    assert.equal(during.body.data.rangeMinutes, 0);

    await clockOut(team.tokens.WAITER);
    const afterwards = await request('GET', '/api/v1/attendance/me', { token: team.tokens.WAITER });

    assert.equal(afterwards.body.data.openShift, null);
    assert.equal(afterwards.body.data.recent.length, 1);
    assert.equal(afterwards.body.data.recent[0].workedMinutes, 0);
  });
});

// ---------------------------------------------------------------------------

describe('corrections', () => {
  async function anEntry(team) {
    const created = await manualEntry(team.tokens.MANAGER, team.users.WAITER._id);
    return created.body.data.id;
  }

  it('recomputes worked minutes and records the change with a reason', async () => {
    const team = await seedTeam();
    const id = await anEntry(team);

    const corrected = await request('PATCH', `/api/v1/attendance/${id}`, {
      token: team.tokens.MANAGER,
      body: { clockOutAt: CLOCK_OUT_LATER, reason: 'CCTV shows the shift ended at 18:30' },
    });

    assert.equal(corrected.status, 200);
    assert.equal(corrected.body.data.workedMinutes, 540);
    assert.equal(corrected.body.data.corrections.length, 2, 'CREATION plus this one');

    const last = corrected.body.data.corrections.at(-1);
    assert.equal(last.field, 'clockOutAt');
    assert.match(last.previousValue, /12:00/);
    assert.match(last.newValue, /13:00/);
    assert.match(last.reason, /CCTV/);
  });

  it('rejects a correction with no reason, and does not default it to empty', async () => {
    const team = await seedTeam();
    const id = await anEntry(team);

    const noReason = await request('PATCH', `/api/v1/attendance/${id}`, {
      token: team.tokens.MANAGER,
      body: { clockOutAt: CLOCK_OUT_LATER },
    });
    assert.equal(noReason.status, 400);

    const blankReason = await request('PATCH', `/api/v1/attendance/${id}`, {
      token: team.tokens.MANAGER,
      body: { clockOutAt: CLOCK_OUT_LATER, reason: '   ' },
    });
    assert.equal(blankReason.status, 400);
  });

  it('rejects a correction that names no timestamp to change', async () => {
    const team = await seedTeam();
    const id = await anEntry(team);

    const response = await request('PATCH', `/api/v1/attendance/${id}`, {
      token: team.tokens.MANAGER,
      body: { reason: 'changed my mind' },
    });
    assert.equal(response.status, 400);
  });

  it('rejects a clock-out at or before the clock-in', async () => {
    const team = await seedTeam();
    const id = await anEntry(team);

    const response = await request('PATCH', `/api/v1/attendance/${id}`, {
      token: team.tokens.MANAGER,
      body: { clockOutAt: '2026-08-29T03:00:00.000Z', reason: 'typo' },
    });
    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'CLOCK_OUT_BEFORE_CLOCK_IN');
  });

  it('lets a MANAGER correct an OWNER entry', async () => {
    const team = await seedTeam();

    await clockIn(team.tokens.OWNER);
    const ownersEntry = (await clockOut(team.tokens.OWNER)).body.data;

    const response = await request('PATCH', `/api/v1/attendance/${ownersEntry.id}`, {
      token: team.tokens.MANAGER,
      body: {
        clockInAt: CLOCK_IN,
        clockOutAt: CLOCK_OUT_LATER,
        reason: 'Shift lead confirms the real hours',
      },
    });

    assert.equal(response.status, 200, 'attendance is operational data, unlike the M0-C user rules');
    assert.equal(response.body.data.workedMinutes, 540);
    assert.equal(response.body.data.corrections.length, 2, 'both timestamps were changed');
  });

  it('stops anyone correcting their own entry, including an OWNER', async () => {
    const team = await seedTeam();

    for (const role of ['MANAGER', 'OWNER']) {
      await clockIn(team.tokens[role]);
      const mine = (await clockOut(team.tokens[role])).body.data;

      const response = await request('PATCH', `/api/v1/attendance/${mine.id}`, {
        token: team.tokens[role],
        body: { clockOutAt: CLOCK_OUT_LATER, reason: 'padding my own hours' },
      });

      assert.equal(response.status, 422, `${role} must not correct their own entry`);
      assert.equal(response.body.error.code, 'SELF_CORRECTION_FORBIDDEN');
    }
  });

  it('stops a manager creating a missed entry for themselves', async () => {
    const team = await seedTeam();

    const response = await manualEntry(team.tokens.MANAGER, team.users.MANAGER._id);
    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'SELF_CORRECTION_FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------

describe('void', () => {
  it('marks the entry voided, keeps it, and refuses a second void', async () => {
    const team = await seedTeam();
    const id = (await manualEntry(team.tokens.MANAGER, team.users.WAITER._id)).body.data.id;

    const voided = await request('PATCH', `/api/v1/attendance/${id}/void`, {
      token: team.tokens.MANAGER,
      body: { reason: 'Duplicate of the paper record' },
    });
    assert.equal(voided.status, 200);
    assert.equal(voided.body.data.isVoided, true);
    assert.match(voided.body.data.voidReason, /Duplicate/);

    const again = await request('PATCH', `/api/v1/attendance/${id}/void`, {
      token: team.tokens.MANAGER,
      body: { reason: 'again' },
    });
    assert.equal(again.status, 422);
    assert.equal(again.body.error.code, 'ENTRY_VOIDED');

    const stored = await AttendanceEntry.findOne({ restaurantId: team.restaurant._id, _id: id });
    assert.ok(stored, 'a voided entry is never removed');
  });

  it('refuses a correction to a voided entry', async () => {
    const team = await seedTeam();
    const id = (await manualEntry(team.tokens.MANAGER, team.users.WAITER._id)).body.data.id;

    await request('PATCH', `/api/v1/attendance/${id}/void`, {
      token: team.tokens.MANAGER,
      body: { reason: 'wrong person' },
    });

    const response = await request('PATCH', `/api/v1/attendance/${id}`, {
      token: team.tokens.MANAGER,
      body: { clockOutAt: CLOCK_OUT_LATER, reason: 'too late' },
    });
    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'ENTRY_VOIDED');
  });

  it('stops a manager voiding their own entry', async () => {
    const team = await seedTeam();

    await clockIn(team.tokens.MANAGER);
    const mine = (await clockOut(team.tokens.MANAGER)).body.data;

    const response = await request('PATCH', `/api/v1/attendance/${mine.id}/void`, {
      token: team.tokens.MANAGER,
      body: { reason: 'never happened' },
    });
    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'SELF_CORRECTION_FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------

describe('the register', () => {
  it('lists the day with each entry carrying the staff name and role', async () => {
    const team = await seedTeam();
    await manualEntry(team.tokens.MANAGER, team.users.WAITER._id);

    const response = await request('GET', `/api/v1/attendance?from=${BUSINESS_DATE}&to=${BUSINESS_DATE}`, {
      token: team.tokens.MANAGER,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].userName, 'WAITER');
    assert.equal(response.body.data[0].userRole, ROLES.WAITER);
    assert.equal(response.body.meta.total, 1);
  });

  it('flags an open shift older than twelve hours, and never closes it', async () => {
    const team = await seedTeam();
    const startedAt = new Date(Date.now() - 13 * 60 * 60 * 1000);

    await AttendanceEntry.create({
      restaurantId: team.restaurant._id,
      branchId: team.branch._id,
      userId: team.users.KITCHEN._id,
      clockInAt: startedAt,
      businessDate: businessDateFor(startedAt, 300),
      clockInSource: 'SELF',
    });

    const response = await request('GET', '/api/v1/attendance?openOnly=true', {
      token: team.tokens.MANAGER,
    });

    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].requiresAttention, true);
    assert.ok(response.body.data[0].openMinutes >= 12 * 60);
    assert.equal(response.body.data[0].clockOutAt, null, 'the server never auto-closes it');
  });

  it('hides voided entries unless asked', async () => {
    const team = await seedTeam();
    const id = (await manualEntry(team.tokens.MANAGER, team.users.WAITER._id)).body.data.id;
    await request('PATCH', `/api/v1/attendance/${id}/void`, {
      token: team.tokens.MANAGER,
      body: { reason: 'test' },
    });

    const hidden = await request('GET', `/api/v1/attendance?from=${BUSINESS_DATE}&to=${BUSINESS_DATE}`, {
      token: team.tokens.MANAGER,
    });
    assert.deepEqual(hidden.body.data, []);

    const shown = await request(
      'GET',
      `/api/v1/attendance?from=${BUSINESS_DATE}&to=${BUSINESS_DATE}&includeVoided=true`,
      { token: team.tokens.MANAGER },
    );
    assert.equal(shown.body.data.length, 1);
    assert.equal(shown.body.data[0].isVoided, true);
  });
});

// ---------------------------------------------------------------------------

describe('the hours-worked summary', () => {
  it('totals closed minutes per user and leaves voided entries out', async () => {
    const team = await seedTeam();
    const waiterId = team.users.WAITER._id;

    await manualEntry(team.tokens.MANAGER, waiterId); // 480 minutes
    const toVoid = (await manualEntry(team.tokens.MANAGER, waiterId, {
      clockInAt: '2026-08-29T14:00:00.000Z',
      clockOutAt: '2026-08-29T16:00:00.000Z',
    })).body.data.id;
    await request('PATCH', `/api/v1/attendance/${toVoid}/void`, {
      token: team.tokens.MANAGER,
      body: { reason: 'double counted' },
    });

    const response = await request(
      'GET',
      `/api/v1/attendance/summary?from=${BUSINESS_DATE}&to=${BUSINESS_DATE}`,
      { token: team.tokens.OWNER },
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.data.rows.length, 1);
    const row = response.body.data.rows[0];
    assert.equal(row.userName, 'WAITER');
    assert.equal(row.totalMinutes, 480, 'the voided two hours are not counted');
    assert.equal(row.entryCount, 1);
    assert.equal(row.openEntryCount, 0);
  });

  it('counts an open entry without adding its minutes', async () => {
    const team = await seedTeam();

    await manualEntry(team.tokens.MANAGER, team.users.CASHIER._id, { clockOutAt: undefined });

    const response = await request(
      'GET',
      `/api/v1/attendance/summary?from=${BUSINESS_DATE}&to=${BUSINESS_DATE}`,
      { token: team.tokens.OWNER },
    );

    const row = response.body.data.rows[0];
    assert.equal(row.openEntryCount, 1);
    assert.equal(row.totalMinutes, 0);
  });

  it('requires both from and to', async () => {
    const team = await seedTeam();
    const response = await request('GET', `/api/v1/attendance/summary?from=${BUSINESS_DATE}`, {
      token: team.tokens.OWNER,
    });
    assert.equal(response.status, 400);
  });
});

// ---------------------------------------------------------------------------

describe('permissions, against the contract table', () => {
  const FLOOR_ROLES = [ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN, ROLES.STOREKEEPER];

  it('lets every one of the six roles clock in and out', async () => {
    const team = await seedTeam();

    for (const role of Object.keys(team.tokens)) {
      assert.equal((await clockIn(team.tokens[role])).status, 201, `${role} clock-in`);
      assert.equal((await clockOut(team.tokens[role])).status, 200, `${role} clock-out`);
      assert.equal(
        (await request('GET', '/api/v1/attendance/me', { token: team.tokens[role] })).status,
        200,
        `${role} /me`,
      );
    }
  });

  it('closes the register, corrections and summary to everyone below MANAGER', async () => {
    const team = await seedTeam();
    const someId = '0'.repeat(24);

    const calls = [
      ['GET', `/api/v1/attendance?from=${BUSINESS_DATE}&to=${BUSINESS_DATE}`, undefined],
      ['GET', `/api/v1/attendance/summary?from=${BUSINESS_DATE}&to=${BUSINESS_DATE}`, undefined],
      ['GET', `/api/v1/users/${someId}/attendance`, undefined],
      ['POST', '/api/v1/attendance', { userId: someId, clockInAt: CLOCK_IN, reason: 'x' }],
      ['PATCH', `/api/v1/attendance/${someId}`, { clockOutAt: CLOCK_OUT, reason: 'x' }],
      ['PATCH', `/api/v1/attendance/${someId}/void`, { reason: 'x' }],
    ];

    for (const role of FLOOR_ROLES) {
      for (const [method, path, body] of calls) {
        const response = await request(method, path, { token: team.tokens[role], body });
        assert.equal(response.status, 403, `${role} must not ${method} ${path}`);
        assert.equal(response.body.error.code, 'FORBIDDEN');
      }
    }
  });
});

// ---------------------------------------------------------------------------

describe('tenancy', () => {
  it('answers 404, not 403, for an entry in another restaurant', async () => {
    const a = await seedTeam({ name: 'Restaurant A' });
    const b = await seedTeam({ name: 'Restaurant B' });

    const id = (await manualEntry(a.tokens.MANAGER, a.users.WAITER._id)).body.data.id;

    const correct = await request('PATCH', `/api/v1/attendance/${id}`, {
      token: b.tokens.MANAGER,
      body: { clockOutAt: CLOCK_OUT_LATER, reason: 'reaching across the tenant line' },
    });
    assert.equal(correct.status, 404);
    assert.equal(correct.body.error.code, 'NOT_FOUND');

    const kill = await request('PATCH', `/api/v1/attendance/${id}/void`, {
      token: b.tokens.MANAGER,
      body: { reason: 'not mine to void' },
    });
    assert.equal(kill.status, 404);

    const history = await request('GET', `/api/v1/users/${a.users.WAITER._id}/attendance`, {
      token: b.tokens.MANAGER,
    });
    assert.equal(history.status, 404);
  });

  it('shows a restaurant none of another restaurant entries in the register', async () => {
    const a = await seedTeam({ name: 'Restaurant A' });
    const b = await seedTeam({ name: 'Restaurant B' });

    await manualEntry(a.tokens.MANAGER, a.users.WAITER._id);

    const register = await request('GET', `/api/v1/attendance?from=${BUSINESS_DATE}&to=${BUSINESS_DATE}`, {
      token: b.tokens.MANAGER,
    });
    assert.deepEqual(register.body.data, []);

    const summary = await request(
      'GET',
      `/api/v1/attendance/summary?from=${BUSINESS_DATE}&to=${BUSINESS_DATE}`,
      { token: b.tokens.MANAGER },
    );
    assert.deepEqual(summary.body.data.rows, []);
  });

  it('strips a restaurantId sent in the body rather than erroring on it', async () => {
    const a = await seedTeam({ name: 'Restaurant A' });
    const b = await seedTeam({ name: 'Restaurant B' });

    const response = await request('POST', '/api/v1/attendance', {
      token: a.tokens.MANAGER,
      body: {
        userId: String(a.users.WAITER._id),
        clockInAt: CLOCK_IN,
        clockOutAt: CLOCK_OUT,
        reason: 'injection attempt',
        restaurantId: String(b.restaurant._id),
      },
    });

    assert.equal(response.status, 201, 'stripped by the tenant middleware before strict validation');
    assert.equal(response.body.data.restaurantId, String(a.restaurant._id));
  });
});

// ---------------------------------------------------------------------------

describe('the business day setting', () => {
  it('defaults to 05:00 on a fresh restaurant and is readable', async () => {
    const team = await seedTeam();
    const response = await request('GET', '/api/v1/restaurant', { token: team.tokens.OWNER });
    assert.equal(response.body.data.settings.businessDayStartsAtMinutes, 300);
  });

  it('is OWNER-only and range checked', async () => {
    const team = await seedTeam();

    const ok = await request('PATCH', '/api/v1/restaurant', {
      token: team.tokens.OWNER,
      body: { settings: { businessDayStartsAtMinutes: 360 } },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.settings.businessDayStartsAtMinutes, 360);

    const tooBig = await request('PATCH', '/api/v1/restaurant', {
      token: team.tokens.OWNER,
      body: { settings: { businessDayStartsAtMinutes: 1500 } },
    });
    assert.equal(tooBig.status, 400);

    const fractional = await request('PATCH', '/api/v1/restaurant', {
      token: team.tokens.OWNER,
      body: { settings: { businessDayStartsAtMinutes: 90.5 } },
    });
    assert.equal(fractional.status, 400);

    const byManager = await request('PATCH', '/api/v1/restaurant', {
      token: team.tokens.MANAGER,
      body: { settings: { businessDayStartsAtMinutes: 300 } },
    });
    assert.equal(byManager.status, 403);
  });
});

// ---------------------------------------------------------------------------

describe('serialisation', () => {
  it('never ships _id or __v, including inside corrections', async () => {
    const team = await seedTeam();
    const created = await manualEntry(team.tokens.MANAGER, team.users.WAITER._id);

    const body = JSON.stringify(created.body);
    assert.equal(body.includes('"_id"'), false);
    assert.equal(body.includes('"__v"'), false);
    assert.ok(created.body.data.id);
    assert.ok(created.body.data.corrections[0].id);
  });
});

// ---------------------------------------------------------------------------

describe('the station clock', () => {
  const PIN = '4821';

  /** Sets a PIN on the given team user and returns { userId }. */
  async function withPin(team, role = 'WAITER', pin = PIN) {
    const userId = String(team.users[role]._id);
    const set = await request('PATCH', `/api/v1/users/${userId}/pin`, {
      token: team.tokens.OWNER,
      body: { pin },
    });
    assert.equal(set.status, 200);
    return userId;
  }

  const station = (team, body) =>
    request('POST', '/api/v1/attendance/station/clock', { token: team.tokens.CASHIER, body });

  it('toggles a shift for the user whose PIN was entered', async () => {
    const team = await seedTeam();
    const userId = await withPin(team);

    const inEvent = await station(team, { userId, pin: PIN });
    assert.equal(inEvent.status, 200);
    assert.equal(inEvent.body.data.event, 'CLOCK_IN');
    assert.equal(inEvent.body.data.userName, 'WAITER');
    assert.ok(inEvent.body.data.undoUntil);

    const stored = await AttendanceEntry.findOne({
      restaurantId: team.restaurant._id,
      _id: inEvent.body.data.entryId,
    });
    assert.equal(stored.clockInSource, 'STATION');

    const outEvent = await station(team, { userId, pin: PIN });
    assert.equal(outEvent.body.data.event, 'CLOCK_OUT');
    assert.equal(typeof outEvent.body.data.workedMinutes, 'number');
  });

  it('issues no session, ever', async () => {
    const team = await seedTeam();
    const userId = await withPin(team);

    const before = await RefreshToken.countDocuments({}).setOptions({ skipTenantGuard: true });
    await station(team, { userId, pin: PIN });
    const after = await RefreshToken.countDocuments({}).setOptions({ skipTenantGuard: true });

    assert.equal(after, before, 'a PIN clock must never mint a token');
  });

  it('rejects a wrong PIN without recording anything', async () => {
    const team = await seedTeam();
    const userId = await withPin(team);

    const response = await station(team, { userId, pin: '0000' });
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'INVALID_PIN');

    assert.equal(
      await AttendanceEntry.countDocuments({ restaurantId: team.restaurant._id }),
      0,
    );
  });

  it('locks the PIN after five wrong tries', async () => {
    const team = await seedTeam();
    const userId = await withPin(team);

    for (let i = 0; i < 4; i += 1) {
      assert.equal((await station(team, { userId, pin: '0000' })).status, 401);
    }
    const locked = await station(team, { userId, pin: '0000' });
    assert.equal(locked.status, 429);
    assert.equal(locked.body.error.code, 'PIN_LOCKED');

    // Even the right PIN is refused now.
    assert.equal((await station(team, { userId, pin: PIN })).status, 429);
  });

  it('rejects a badly shaped PIN with 400', async () => {
    const team = await seedTeam();
    const userId = await withPin(team);

    const response = await station(team, { userId, pin: '12' });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_FAILED');
  });

  it('undoes a fresh clock-in by voiding it', async () => {
    const team = await seedTeam();
    const userId = await withPin(team);

    const inEvent = await station(team, { userId, pin: PIN });
    const undo = await station(team, { userId, pin: PIN, action: 'undo' });

    assert.equal(undo.status, 200);
    assert.equal(undo.body.data.event, 'UNDO');

    const stored = await AttendanceEntry.findOne({
      restaurantId: team.restaurant._id,
      _id: inEvent.body.data.entryId,
    });
    assert.equal(stored.isVoided, true);
    assert.equal(stored.voidReason, 'MIS_TAP');
  });

  it('undoes a fresh clock-out by reopening the shift', async () => {
    const team = await seedTeam();
    const userId = await withPin(team);

    const inEvent = await station(team, { userId, pin: PIN });
    await station(team, { userId, pin: PIN }); // clock out
    const undo = await station(team, { userId, pin: PIN, action: 'undo' });

    assert.equal(undo.body.data.event, 'UNDO');

    const stored = await AttendanceEntry.findOne({
      restaurantId: team.restaurant._id,
      _id: inEvent.body.data.entryId,
    });
    assert.equal(stored.clockOutAt, null, 'the shift is open again');
    assert.equal(stored.workedMinutes, null);
    assert.equal(stored.corrections.at(-1).reason, 'MIS_TAP');
  });

  it('refuses an undo once the window has passed', async () => {
    const team = await seedTeam();
    const userId = await withPin(team);

    const inEvent = await station(team, { userId, pin: PIN });

    // Backdate the clock-in past the ~8s undo window.
    await AttendanceEntry.updateOne(
      { restaurantId: team.restaurant._id, _id: inEvent.body.data.entryId },
      { $set: { clockInAt: new Date(Date.now() - 60_000) } },
    );

    const undo = await station(team, { userId, pin: PIN, action: 'undo' });
    assert.equal(undo.status, 409);
    assert.equal(undo.body.error.code, 'NOT_CLOCKED_IN');
  });

  it('cannot reach a user in another restaurant', async () => {
    const a = await seedTeam({ name: 'Restaurant A' });
    const b = await seedTeam({ name: 'Restaurant B' });
    await withPin(b, 'WAITER'); // B's waiter has a PIN

    // A's tablet, B's user id, B's PIN.
    const response = await request('POST', '/api/v1/attendance/station/clock', {
      token: a.tokens.CASHIER,
      body: { userId: String(b.users.WAITER._id), pin: PIN },
    });

    assert.equal(response.status, 401, 'the PIN check is scoped to the tablet restaurant');
    assert.equal(response.body.error.code, 'INVALID_PIN');
  });
});

describe('authentication', () => {
  it('answers 401 to every attendance route without a token', async () => {
    const paths = [
      ['POST', '/api/v1/attendance/clock-in'],
      ['POST', '/api/v1/attendance/clock-out'],
      ['POST', '/api/v1/attendance/station/clock'],
      ['GET', '/api/v1/attendance/me'],
      ['GET', '/api/v1/attendance'],
      ['GET', '/api/v1/attendance/summary'],
      ['POST', '/api/v1/attendance'],
      ['PATCH', `/api/v1/attendance/${'0'.repeat(24)}`],
      ['PATCH', `/api/v1/attendance/${'0'.repeat(24)}/void`],
      ['GET', `/api/v1/users/${'0'.repeat(24)}/attendance`],
    ];

    for (const [method, path] of paths) {
      const response = await request(method, path, { body: method === 'GET' ? undefined : {} });
      assert.equal(response.status, 401, `${method} ${path} must require a token`);
    }
  });
});
