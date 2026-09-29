/**
 * Restaurant and branch endpoint tests.
 *
 * Covers the three checks docs/CONVENTIONS.md section 13 requires of every
 * module: no token is 401, the wrong role is 403, and another restaurant data
 * is 404 rather than 403.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ROLES } from '../config/roles.js';
import { Branch } from '../models/Branch.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { DEFAULT_PASSWORD, seedFullRestaurant, seedUser } from './helpers/seed.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

before(async () => {
  await startTestDatabase();
  await startTestServer();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
});

const login = (phone, password = DEFAULT_PASSWORD) =>
  request('POST', '/api/v1/auth/login', { body: { phone, password } });

async function signedIn(options = {}) {
  const seeded = await seedFullRestaurant(options);
  const session = (await login(seeded.phone)).body.data;
  return { ...seeded, token: session.accessToken };
}

describe('GET /restaurant', () => {
  it('returns the caller own restaurant', async () => {
    const { token, restaurant } = await signedIn({ name: 'Shreeji Dining Hall' });

    const { status, body } = await request('GET', '/api/v1/restaurant', { token });

    assert.equal(status, 200);
    assert.equal(body.data.id, String(restaurant._id));
    assert.equal(body.data.name, 'Shreeji Dining Hall');
    assert.equal('_id' in body.data, false);
    assert.equal('__v' in body.data, false);
    // Platform state, not something on a customer settings screen.
    assert.equal('isActive' in body.data, false);
  });

  it('is 401 without a token', async () => {
    const { status, body } = await request('GET', '/api/v1/restaurant');
    assert.equal(status, 401);
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  it('is readable by every role', async () => {
    const { restaurant, branch } = await seedFullRestaurant();

    for (const role of [ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN, ROLES.STOREKEEPER]) {
      const { phone } = await seedUser({ restaurant, branch, role });
      const token = (await login(phone)).body.data.accessToken;
      const { status } = await request('GET', '/api/v1/restaurant', { token });
      assert.equal(status, 200, `${role} should be able to read the restaurant`);
    }
  });
});

describe('PATCH /restaurant', () => {
  it('updates the fields sent and leaves the rest alone', async () => {
    const { token } = await signedIn({ name: 'Old Name' });

    const { status, body } = await request('PATCH', '/api/v1/restaurant', {
      token,
      body: {
        name: 'Shreeji Dining Hall',
        gstin: '24aaacs1234a1z5',
        address: { city: 'Ahmedabad', pincode: '380009' },
      },
    });

    assert.equal(status, 200);
    assert.equal(body.data.name, 'Shreeji Dining Hall');
    assert.equal(body.data.gstin, '24AAACS1234A1Z5', 'uppercased on the way in');
    assert.equal(body.data.address.city, 'Ahmedabad');
  });

  it('is 403 for a CASHIER', async () => {
    const { restaurant, branch } = await seedFullRestaurant();
    const { phone } = await seedUser({ restaurant, branch, role: ROLES.CASHIER });
    const token = (await login(phone)).body.data.accessToken;

    const { status, body } = await request('PATCH', '/api/v1/restaurant', {
      token,
      body: { name: 'Renamed by a cashier' },
    });

    assert.equal(status, 403);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('is 403 for every role except OWNER', async () => {
    const { restaurant, branch } = await seedFullRestaurant();

    for (const role of [ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN, ROLES.STOREKEEPER]) {
      const { phone } = await seedUser({ restaurant, branch, role });
      const token = (await login(phone)).body.data.accessToken;
      const { status } = await request('PATCH', '/api/v1/restaurant', { token, body: { name: 'X' } });
      assert.equal(status, 403, `${role} must not be able to edit the restaurant`);
    }
  });

  it('rejects isActive rather than ignoring it', async () => {
    const { token } = await signedIn();

    const { status, body } = await request('PATCH', '/api/v1/restaurant', {
      token,
      body: { name: 'Still fine', isActive: false },
    });

    assert.equal(status, 400);
    assert.equal(body.error.code, 'VALIDATION_FAILED');
  });

  it('rejects an empty body', async () => {
    const { token } = await signedIn();
    const { status } = await request('PATCH', '/api/v1/restaurant', { token, body: {} });
    assert.equal(status, 400);
  });

  it('cannot reach another restaurant, because it takes no id', async () => {
    const mine = await signedIn({ name: 'Mine' });
    const theirs = await seedFullRestaurant({ name: 'Theirs' });

    await request('PATCH', '/api/v1/restaurant', { token: mine.token, body: { name: 'Renamed' } });

    const { Restaurant } = await import('../models/Restaurant.js');
    const untouched = await Restaurant.findById(theirs.restaurant._id);
    assert.equal(untouched.name, 'Theirs');
  });
});

describe('GET /branches', () => {
  it('returns the paginated list envelope with exactly one branch', async () => {
    const { token, branch } = await signedIn();

    const { status, body } = await request('GET', '/api/v1/branches', { token });

    assert.equal(status, 200);
    assert.deepEqual(Object.keys(body).sort(), ['data', 'meta', 'success']);
    assert.deepEqual(body.meta, { page: 1, limit: 50, total: 1 });
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, String(branch._id));
    assert.equal(body.data[0].name, 'Main');
    assert.equal('_id' in body.data[0], false);
  });

  /**
   * A branch has no branchId field, so the shared `scoped(req)` helper cannot
   * build this filter. If that regresses, strictQuery turns it into a 500
   * rather than something subtle.
   */
  it('does not blow up on the tenancy root exception', async () => {
    const { token } = await signedIn();
    const { status } = await request('GET', '/api/v1/branches', { token });
    assert.equal(status, 200);
  });

  it('never shows another restaurant branches', async () => {
    const mine = await signedIn({ name: 'Mine' });
    const theirs = await seedFullRestaurant({ name: 'Theirs', branchName: 'Their Main' });

    const { body } = await request('GET', '/api/v1/branches', { token: mine.token });

    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, String(mine.branch._id));
    assert.equal(
      body.data.some((entry) => entry.id === String(theirs.branch._id)),
      false,
    );
  });

  it('clamps a limit above the maximum instead of rejecting it', async () => {
    const { token } = await signedIn();
    const { status, body } = await request('GET', '/api/v1/branches?page=1&limit=1000', { token });
    assert.equal(status, 200);
    assert.equal(body.meta.limit, 200);
  });

  it('is 401 without a token', async () => {
    const { status } = await request('GET', '/api/v1/branches');
    assert.equal(status, 401);
  });

  it('ignores a restaurantId sent by the client', async () => {
    const mine = await signedIn({ name: 'Mine' });
    const theirs = await seedFullRestaurant({ name: 'Theirs' });

    const { status, body } = await request(
      'GET',
      `/api/v1/branches?restaurantId=${theirs.restaurant._id}`,
      { token: mine.token, headers: { 'x-restaurant-id': String(theirs.restaurant._id) } },
    );

    assert.equal(status, 200);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, String(mine.branch._id), 'the token decides the tenant, not the client');
  });
});

describe('the tenant guard is still armed after M0-B', () => {
  it('throws on a Branch query with no restaurantId', async () => {
    await assert.rejects(
      () => Branch.find({}),
      (error) => error.name === 'TenantFilterMissingError',
    );
  });

  it('throws on a User query with no restaurantId', async () => {
    const { User } = await import('../models/User.js');
    await assert.rejects(
      () => User.find({ isActive: true }),
      (error) => error.name === 'TenantFilterMissingError',
    );
  });

  it('throws on a RefreshToken query with no restaurantId', async () => {
    const { RefreshToken } = await import('../models/RefreshToken.js');
    await assert.rejects(
      () => RefreshToken.find({ revokedAt: null }),
      (error) => error.name === 'TenantFilterMissingError',
    );
  });
});
