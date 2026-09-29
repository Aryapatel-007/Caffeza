/**
 * Staff management tests.
 *
 * The interesting cases are not the happy paths. They are the four things a
 * manager must not be able to do to an owner, the two things nobody may do,
 * and the cross-restaurant lookups that have to answer 404 rather than 403.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ROLES } from '../config/roles.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { verifyPin } from '../services/authService.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { DEFAULT_PASSWORD, nextPhone, seedFullRestaurant, seedUser } from './helpers/seed.js';
import { observedResponses, request, startTestServer, stopTestServer } from './helpers/testServer.js';

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

const tokenFor = async (phone) => (await login(phone)).body.data.accessToken;

/** A restaurant with an owner, a manager, and a cashier, all signed in. */
async function seedTeam() {
  const base = await seedFullRestaurant({ name: 'Shreeji Dining Hall' });
  const { restaurant, branch } = base;

  const manager = await seedUser({ restaurant, branch, name: 'Manager', role: ROLES.MANAGER });
  const cashier = await seedUser({ restaurant, branch, name: 'Cashier', role: ROLES.CASHIER });

  return {
    ...base,
    ownerToken: await tokenFor(base.phone),
    manager,
    managerToken: await tokenFor(manager.phone),
    cashier,
    cashierToken: await tokenFor(cashier.phone),
  };
}

function newStaff(overrides = {}) {
  return {
    name: 'Arya Shah',
    phone: nextPhone(),
    email: 'arya@example.com',
    role: ROLES.CASHIER,
    password: 'initial password',
    ...overrides,
  };
}

describe('every endpoint is closed to roles below MANAGER', () => {
  it('answers 403 to a CASHIER on all seven', async () => {
    const team = await seedTeam();
    const id = String(team.cashier.user._id);

    const calls = [
      ['POST', '/api/v1/users', newStaff()],
      ['GET', '/api/v1/users', undefined],
      ['GET', `/api/v1/users/${id}`, undefined],
      ['PATCH', `/api/v1/users/${id}`, { name: 'Renamed' }],
      ['PATCH', `/api/v1/users/${id}/status`, { isActive: false }],
      ['PATCH', `/api/v1/users/${id}/password`, { newPassword: 'temporary one' }],
      ['PATCH', `/api/v1/users/${id}/pin`, { pin: '4821' }],
    ];

    for (const [method, path, body] of calls) {
      const { status, body: response } = await request(method, path, { token: team.cashierToken, body });
      assert.equal(status, 403, `${method} ${path}`);
      assert.equal(response.error.code, 'FORBIDDEN');
    }
  });

  it('answers 403 to every role except OWNER and MANAGER', async () => {
    const { restaurant, branch } = await seedFullRestaurant();

    for (const role of [ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN, ROLES.STOREKEEPER]) {
      const { phone } = await seedUser({ restaurant, branch, role });
      const token = await tokenFor(phone);
      const { status } = await request('GET', '/api/v1/users', { token });
      assert.equal(status, 403, `${role} must not list staff`);
    }
  });

  it('answers 401 with no token at all', async () => {
    const { status } = await request('GET', '/api/v1/users');
    assert.equal(status, 401);
  });
});

describe('the four things a MANAGER cannot do to an OWNER', () => {
  it('cannot create an OWNER', async () => {
    const team = await seedTeam();

    const { status, body } = await request('POST', '/api/v1/users', {
      token: team.managerToken,
      body: newStaff({ role: ROLES.OWNER }),
    });

    assert.equal(status, 403);
    assert.equal(body.error.code, 'FORBIDDEN');
    assert.equal(await User.countDocuments({ restaurantId: team.restaurant._id, role: ROLES.OWNER }), 1);
  });

  it('cannot edit an OWNER', async () => {
    const team = await seedTeam();

    const { status, body } = await request('PATCH', `/api/v1/users/${team.user._id}`, {
      token: team.managerToken,
      body: { name: 'Renamed by a manager' },
    });

    assert.equal(status, 403);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('cannot promote anyone to OWNER', async () => {
    const team = await seedTeam();

    const { status, body } = await request('PATCH', `/api/v1/users/${team.cashier.user._id}`, {
      token: team.managerToken,
      body: { role: ROLES.OWNER },
    });

    assert.equal(status, 403);
    assert.equal(body.error.code, 'FORBIDDEN');

    const unchanged = await User.findOne({
      _id: team.cashier.user._id,
      restaurantId: team.restaurant._id,
    });
    assert.equal(unchanged.role, ROLES.CASHIER);
  });

  it('cannot reset an OWNER password', async () => {
    const team = await seedTeam();

    const { status, body } = await request('PATCH', `/api/v1/users/${team.user._id}/password`, {
      token: team.managerToken,
      body: { newPassword: 'a manager takeover' },
    });

    assert.equal(status, 403);
    assert.equal(body.error.code, 'FORBIDDEN');

    // And the owner password genuinely still works.
    assert.equal((await login(team.phone)).status, 200);
  });

  it('cannot set an OWNER PIN', async () => {
    const team = await seedTeam();

    const { status, body } = await request('PATCH', `/api/v1/users/${team.user._id}/pin`, {
      token: team.managerToken,
      body: { pin: '4821' },
    });

    assert.equal(status, 403);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('can still do all of them to a non-owner', async () => {
    const team = await seedTeam();
    const id = String(team.cashier.user._id);

    assert.equal((await request('POST', '/api/v1/users', { token: team.managerToken, body: newStaff() })).status, 201);
    assert.equal((await request('PATCH', `/api/v1/users/${id}`, { token: team.managerToken, body: { name: 'Renamed' } })).status, 200);
    assert.equal((await request('PATCH', `/api/v1/users/${id}/password`, { token: team.managerToken, body: { newPassword: 'temporary one' } })).status, 200);
    assert.equal((await request('PATCH', `/api/v1/users/${id}/pin`, { token: team.managerToken, body: { pin: '4821' } })).status, 200);
    assert.equal((await request('PATCH', `/api/v1/users/${id}/status`, { token: team.managerToken, body: { isActive: false } })).status, 200);
  });
});

describe('the two rules that bind everyone, including an OWNER', () => {
  it('nobody can change their own role', async () => {
    const team = await seedTeam();

    const { status, body } = await request('PATCH', `/api/v1/users/${team.user._id}`, {
      token: team.ownerToken,
      body: { role: ROLES.MANAGER },
    });

    assert.equal(status, 422, 'not 403: it is not about who they are, nobody may do it');
    assert.equal(body.error.code, 'BUSINESS_RULE_VIOLATED');

    const unchanged = await User.findOne({ _id: team.user._id, restaurantId: team.restaurant._id });
    assert.equal(unchanged.role, ROLES.OWNER, 'the only owner must not be able to demote themselves');
  });

  it('lets an owner edit their own name, just not their own role', async () => {
    const team = await seedTeam();

    const { status } = await request('PATCH', `/api/v1/users/${team.user._id}`, {
      token: team.ownerToken,
      body: { name: 'Rishi R Patel' },
    });

    assert.equal(status, 200);
  });

  it('lets another owner change the first owner role', async () => {
    const team = await seedTeam();
    const second = await seedUser({
      restaurant: team.restaurant,
      branch: team.branch,
      name: 'Second Owner',
      role: ROLES.OWNER,
    });
    const secondToken = await tokenFor(second.phone);

    const { status } = await request('PATCH', `/api/v1/users/${team.user._id}`, {
      token: secondToken,
      body: { role: ROLES.MANAGER },
    });

    assert.equal(status, 200);
  });

  it('refuses to deactivate the last active OWNER', async () => {
    const team = await seedTeam();

    const { status, body } = await request('PATCH', `/api/v1/users/${team.user._id}/status`, {
      token: team.ownerToken,
      body: { isActive: false },
    });

    assert.equal(status, 422);
    assert.equal(body.error.code, 'LAST_OWNER');
    assert.match(body.error.message, /one active owner/i);

    const stillActive = await User.findOne({ _id: team.user._id, restaurantId: team.restaurant._id });
    assert.equal(stillActive.isActive, true);
  });

  it('allows deactivating an owner once a second active one exists', async () => {
    const team = await seedTeam();
    const second = await seedUser({
      restaurant: team.restaurant,
      branch: team.branch,
      name: 'Second Owner',
      role: ROLES.OWNER,
    });

    const { status } = await request('PATCH', `/api/v1/users/${team.user._id}/status`, {
      token: await tokenFor(second.phone),
      body: { isActive: false },
    });

    assert.equal(status, 200);
  });

  it('counts owners per restaurant, not across the platform', async () => {
    const team = await seedTeam();
    // Another restaurant with its own owner. It must not prop this one up.
    await seedFullRestaurant({ name: 'Somebody Else' });

    const { status, body } = await request('PATCH', `/api/v1/users/${team.user._id}/status`, {
      token: team.ownerToken,
      body: { isActive: false },
    });

    assert.equal(status, 422);
    assert.equal(body.error.code, 'LAST_OWNER');
  });
});

describe('another restaurant data is 404, never 403', () => {
  it('answers 404 on every endpoint that takes a user id', async () => {
    const mine = await seedTeam();
    const theirs = await seedFullRestaurant({ name: 'Theirs' });
    const theirId = String(theirs.user._id);

    const calls = [
      ['GET', `/api/v1/users/${theirId}`, undefined],
      ['PATCH', `/api/v1/users/${theirId}`, { name: 'Renamed' }],
      ['PATCH', `/api/v1/users/${theirId}/status`, { isActive: false }],
      ['PATCH', `/api/v1/users/${theirId}/password`, { newPassword: 'temporary one' }],
      ['PATCH', `/api/v1/users/${theirId}/pin`, { pin: '4821' }],
    ];

    for (const [method, path, body] of calls) {
      const { status, body: response } = await request(method, path, { token: mine.ownerToken, body });
      assert.equal(status, 404, `${method} ${path}`);
      assert.equal(response.error.code, 'NOT_FOUND', 'a 403 here would confirm the record exists');
    }
  });

  it('leaves the other restaurant user untouched', async () => {
    const mine = await seedTeam();
    const theirs = await seedFullRestaurant({ name: 'Theirs' });

    await request('PATCH', `/api/v1/users/${theirs.user._id}`, {
      token: mine.ownerToken,
      body: { name: 'Renamed by an outsider' },
    });

    const untouched = await User.findOne({
      _id: theirs.user._id,
      restaurantId: theirs.restaurant._id,
    });
    assert.equal(untouched.name, 'Rishi Patel');
  });

  it('never lists another restaurant staff', async () => {
    const mine = await seedTeam();
    const theirs = await seedFullRestaurant({ name: 'Theirs' });

    const { body } = await request('GET', '/api/v1/users?limit=200', { token: mine.ownerToken });

    assert.equal(body.data.length, 3, 'owner, manager, cashier');
    assert.equal(
      body.data.some((u) => u.id === String(theirs.user._id)),
      false,
    );
    for (const user of body.data) {
      assert.equal(user.restaurantId, String(mine.restaurant._id));
    }
  });

  it('answers 404 for a well formed id that does not exist', async () => {
    const mine = await seedTeam();
    const { status } = await request('GET', '/api/v1/users/652f00000000000000000009', {
      token: mine.ownerToken,
    });
    assert.equal(status, 404);
  });

  it('answers 400 for an id that is not an id', async () => {
    const mine = await seedTeam();
    const { status, body } = await request('GET', '/api/v1/users/not-an-id', { token: mine.ownerToken });
    assert.equal(status, 400);
    assert.equal(body.error.code, 'VALIDATION_FAILED');
  });
});

describe('POST /users', () => {
  it('creates a user inheriting tenancy from the token', async () => {
    const team = await seedTeam();
    const staff = newStaff();

    const { status, body } = await request('POST', '/api/v1/users', {
      token: team.ownerToken,
      body: staff,
    });

    assert.equal(status, 201);
    assert.equal(body.data.name, staff.name);
    assert.equal(body.data.phone, staff.phone);
    assert.equal(body.data.role, ROLES.CASHIER);
    assert.equal(body.data.isActive, true);
    assert.equal(body.data.lastLoginAt, null);
    assert.equal(body.data.restaurantId, String(team.restaurant._id));
    assert.equal(body.data.branchId, String(team.branch._id));
    assert.equal('passwordHash' in body.data, false);
  });

  it('creates someone who can immediately sign in', async () => {
    const team = await seedTeam();
    const staff = newStaff();

    await request('POST', '/api/v1/users', { token: team.ownerToken, body: staff });

    const { status, body } = await login(staff.phone, staff.password);
    assert.equal(status, 200);
    assert.equal(body.data.user.role, ROLES.CASHIER);
  });

  it('ignores a restaurantId the client tries to send', async () => {
    const team = await seedTeam();
    const theirs = await seedFullRestaurant({ name: 'Theirs' });

    const { status, body } = await request('POST', '/api/v1/users', {
      token: team.ownerToken,
      body: newStaff(),
      headers: { 'x-restaurant-id': String(theirs.restaurant._id) },
    });

    assert.equal(status, 201);
    assert.equal(body.data.restaurantId, String(team.restaurant._id), 'the token decides, not the client');
  });

  /**
   * Phone numbers are unique across the whole platform, so a number held by a
   * different restaurant is still a duplicate here.
   */
  it('answers 409 for a phone held by another restaurant, without naming it', async () => {
    const team = await seedTeam();
    const theirs = await seedFullRestaurant({ name: 'Somebody Else' });

    const { status, body } = await request('POST', '/api/v1/users', {
      token: team.ownerToken,
      body: newStaff({ phone: theirs.phone }),
    });

    assert.equal(status, 409);
    assert.equal(body.error.code, 'DUPLICATE');

    const serialised = JSON.stringify(body);
    assert.equal(serialised.includes('Somebody Else'), false, 'must not name the other restaurant');
    assert.equal(serialised.includes(String(theirs.restaurant._id)), false);
    assert.equal(serialised.includes(String(theirs.user._id)), false);
  });

  it('answers 409 for a phone already used inside this restaurant', async () => {
    const team = await seedTeam();
    const { status } = await request('POST', '/api/v1/users', {
      token: team.ownerToken,
      body: newStaff({ phone: team.cashier.phone }),
    });
    assert.equal(status, 409);
  });

  it('answers 409 for an email already registered, case-insensitively', async () => {
    const team = await seedTeam();

    const first = await request('POST', '/api/v1/users', {
      token: team.ownerToken,
      body: newStaff({ email: 'shared@example.com' }),
    });
    assert.equal(first.status, 201);

    const clash = await request('POST', '/api/v1/users', {
      token: team.ownerToken,
      body: newStaff({ email: 'Shared@Example.com' }),
    });
    assert.equal(clash.status, 409);
    assert.equal(clash.body.error.code, 'DUPLICATE');
    assert.ok(clash.body.error.fields.email);
  });

  it('rejects a role that is not one of the six', async () => {
    const team = await seedTeam();
    const { status, body } = await request('POST', '/api/v1/users', {
      token: team.ownerToken,
      body: { ...newStaff(), role: 'SUPERADMIN' },
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, 'VALIDATION_FAILED');
    assert.ok(body.error.fields.role);
  });

  it('creates nothing when validation fails', async () => {
    const team = await seedTeam();
    const before = await User.countDocuments({ restaurantId: team.restaurant._id });

    await request('POST', '/api/v1/users', {
      token: team.ownerToken,
      body: { ...newStaff(), password: 'short' },
    });

    assert.equal(await User.countDocuments({ restaurantId: team.restaurant._id }), before);
  });
});

describe('GET /users', () => {
  it('returns the paginated list envelope, sorted by name', async () => {
    const team = await seedTeam();

    const { status, body } = await request('GET', '/api/v1/users', { token: team.ownerToken });

    assert.equal(status, 200);
    assert.deepEqual(Object.keys(body).sort(), ['data', 'meta', 'success']);
    assert.deepEqual(body.meta, { page: 1, limit: 50, total: 3 });

    const names = body.data.map((u) => u.name);
    assert.deepEqual(names, [...names].sort(), 'sorted by name ascending');
  });

  it('filters by role and by status', async () => {
    const team = await seedTeam();
    await request('PATCH', `/api/v1/users/${team.cashier.user._id}/status`, {
      token: team.ownerToken,
      body: { isActive: false },
    });

    const byRole = await request('GET', '/api/v1/users?role=MANAGER', { token: team.ownerToken });
    assert.equal(byRole.body.meta.total, 1);
    assert.equal(byRole.body.data[0].role, ROLES.MANAGER);

    const inactive = await request('GET', '/api/v1/users?isActive=false', { token: team.ownerToken });
    assert.equal(inactive.body.meta.total, 1);
    assert.equal(inactive.body.data[0].isActive, false);

    const active = await request('GET', '/api/v1/users?isActive=true', { token: team.ownerToken });
    assert.equal(active.body.meta.total, 2);
  });

  it('searches name and phone, case insensitively', async () => {
    const team = await seedTeam();

    const byName = await request('GET', '/api/v1/users?search=manag', { token: team.ownerToken });
    assert.equal(byName.body.meta.total, 1);
    assert.equal(byName.body.data[0].role, ROLES.MANAGER);

    const byPhone = await request(
      `GET`,
      `/api/v1/users?search=${team.cashier.phone.slice(-5)}`,
      { token: team.ownerToken },
    );
    assert.equal(byPhone.body.meta.total, 1);
    assert.equal(byPhone.body.data[0].id, String(team.cashier.user._id));
  });

  /**
   * An unescaped ".*" would match every row, turning a search box into a full
   * collection scan and a way to enumerate staff.
   */
  it('treats regex metacharacters as literal text', async () => {
    const team = await seedTeam();

    const { status, body } = await request('GET', '/api/v1/users?search=.*', { token: team.ownerToken });

    assert.equal(status, 200);
    assert.equal(body.meta.total, 0, 'searching for ".*" should find nobody, not everybody');
  });

  it('pages, and clamps a limit above the maximum', async () => {
    const team = await seedTeam();

    const firstPage = await request('GET', '/api/v1/users?page=1&limit=2', { token: team.ownerToken });
    assert.equal(firstPage.body.data.length, 2);
    assert.equal(firstPage.body.meta.total, 3, 'total is the match count, not the page size');

    const secondPage = await request('GET', '/api/v1/users?page=2&limit=2', { token: team.ownerToken });
    assert.equal(secondPage.body.data.length, 1);

    const clamped = await request('GET', '/api/v1/users?limit=1000', { token: team.ownerToken });
    assert.equal(clamped.body.meta.limit, 200);
  });
});

describe('sessions end when they should', () => {
  /**
   * Signs a user in twice more, as if from two extra devices.
   *
   * Not "two sessions in total": seedTeam already signed everyone in once to
   * get their token, so counts here are measured rather than assumed.
   */
  async function twoSessions(phone) {
    const first = (await login(phone)).body.data;
    const second = (await login(phone)).body.data;
    return { first, second };
  }

  const activeSessions = (restaurantId, userId) =>
    RefreshToken.countDocuments({ restaurantId, userId, revokedAt: null });

  it('deactivating a user revokes every one of their sessions', async () => {
    const team = await seedTeam();
    const { first } = await twoSessions(team.cashier.phone);

    const before = await activeSessions(team.restaurant._id, team.cashier.user._id);
    assert.ok(before >= 2, 'the cashier has several live sessions');

    await request('PATCH', `/api/v1/users/${team.cashier.user._id}/status`, {
      token: team.ownerToken,
      body: { isActive: false },
    });

    assert.equal(await activeSessions(team.restaurant._id, team.cashier.user._id), 0);

    // The access token they are holding stops working too.
    const { status } = await request('GET', '/api/v1/auth/me', { token: first.accessToken });
    assert.equal(status, 401);
  });

  it('leaves other staff sessions alone', async () => {
    const team = await seedTeam();
    await twoSessions(team.cashier.phone);
    await twoSessions(team.manager.phone);

    const managerBefore = await activeSessions(team.restaurant._id, team.manager.user._id);

    await request('PATCH', `/api/v1/users/${team.cashier.user._id}/status`, {
      token: team.ownerToken,
      body: { isActive: false },
    });

    assert.equal(await activeSessions(team.restaurant._id, team.manager.user._id), managerBefore);
    assert.ok(managerBefore > 0, 'and the manager did have sessions to keep');
  });

  it('does not restore old sessions on reactivation', async () => {
    const team = await seedTeam();
    await twoSessions(team.cashier.phone);

    const path = `/api/v1/users/${team.cashier.user._id}/status`;
    await request('PATCH', path, { token: team.ownerToken, body: { isActive: false } });
    await request('PATCH', path, { token: team.ownerToken, body: { isActive: true } });

    const active = await RefreshToken.countDocuments({
      restaurantId: team.restaurant._id,
      userId: team.cashier.user._id,
      revokedAt: null,
    });
    assert.equal(active, 0, 'they sign in fresh');

    // But they can sign in again.
    assert.equal((await login(team.cashier.phone)).status, 200);
  });

  it('resetting a password revokes sessions and kills outstanding access tokens', async () => {
    const team = await seedTeam();
    const { first } = await twoSessions(team.cashier.phone);

    assert.equal((await request('GET', '/api/v1/auth/me', { token: first.accessToken })).status, 200);

    const { status, body } = await request('PATCH', `/api/v1/users/${team.cashier.user._id}/password`, {
      token: team.ownerToken,
      body: { newPassword: 'a temporary one' },
    });

    assert.equal(status, 200);
    assert.deepEqual(body.data, { passwordReset: true });

    const active = await RefreshToken.countDocuments({
      restaurantId: team.restaurant._id,
      userId: team.cashier.user._id,
      revokedAt: null,
    });
    assert.equal(active, 0);

    const afterReset = await request('GET', '/api/v1/auth/me', { token: first.accessToken });
    assert.equal(afterReset.status, 401);
    assert.equal(afterReset.body.error.code, 'TOKEN_EXPIRED');

    // The old password is gone and the new one works.
    assert.equal((await login(team.cashier.phone, DEFAULT_PASSWORD)).status, 401);
    assert.equal((await login(team.cashier.phone, 'a temporary one')).status, 200);
  });

  it('never returns the new password', async () => {
    const team = await seedTeam();
    const { body } = await request('PATCH', `/api/v1/users/${team.cashier.user._id}/password`, {
      token: team.ownerToken,
      body: { newPassword: 'a very distinctive one' },
    });
    assert.equal(JSON.stringify(body).includes('a very distinctive one'), false);
  });

  it('changing a role revokes that user sessions', async () => {
    const team = await seedTeam();
    await twoSessions(team.cashier.phone);

    await request('PATCH', `/api/v1/users/${team.cashier.user._id}`, {
      token: team.ownerToken,
      body: { role: ROLES.WAITER },
    });

    const active = await RefreshToken.countDocuments({
      restaurantId: team.restaurant._id,
      userId: team.cashier.user._id,
      revokedAt: null,
    });
    assert.equal(active, 0);
  });

  it('does not revoke sessions for an edit that does not change the role', async () => {
    const team = await seedTeam();
    await twoSessions(team.cashier.phone);
    const before = await activeSessions(team.restaurant._id, team.cashier.user._id);

    await request('PATCH', `/api/v1/users/${team.cashier.user._id}`, {
      token: team.ownerToken,
      body: { name: 'Renamed', role: ROLES.CASHIER },
    });

    assert.equal(
      await activeSessions(team.restaurant._id, team.cashier.user._id),
      before,
      'a rename should not sign someone out mid-shift',
    );
  });
});

describe('passwordHash', () => {
  it('never appears in any response this suite has seen', async () => {
    const team = await seedTeam();
    await request('POST', '/api/v1/users', { token: team.ownerToken, body: newStaff() });
    await request('GET', '/api/v1/users?limit=200', { token: team.ownerToken });
    await request('GET', `/api/v1/users/${team.cashier.user._id}`, { token: team.ownerToken });

    assert.ok(observedResponses.length > 60, 'the suite should have exercised plenty of endpoints');

    for (const seen of observedResponses) {
      const serialised = JSON.stringify(seen.body);
      assert.equal(
        serialised.includes('passwordHash'),
        false,
        `passwordHash leaked from ${seen.method} ${seen.path}`,
      );
      assert.equal(
        /\$2[aby]\$/.test(serialised),
        false,
        `a bcrypt hash leaked from ${seen.method} ${seen.path}`,
      );
    }
  });
});

describe('a newly created user can use their first token immediately', () => {
  /**
   * Regression guard.
   *
   * createUser used to stamp passwordChangedAt with the current time. The
   * authenticate middleware compares whole seconds and fails closed, so the
   * first token a new user was issued got rejected whenever the login landed
   * in the same second as the creation. Asserting on the login status alone
   * missed it, because the login endpoint does not run authenticate.
   */
  it('signs in and uses the token in the same second', async () => {
    const team = await seedTeam();
    const staff = newStaff();

    const created = await request('POST', '/api/v1/users', { token: team.ownerToken, body: staff });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.passwordChangedAt, undefined);

    const session = (await login(staff.phone, staff.password)).body.data;

    // The part that used to fail: actually using the token.
    const me = await request('GET', '/api/v1/auth/me', { token: session.accessToken });
    assert.equal(me.status, 200, 'a brand new user must be able to use their first token');
    assert.equal(me.body.data.user.phone, staff.phone);

    // And they can immediately do whatever their role allows.
    const asStaff = await request('GET', '/api/v1/restaurant', { token: session.accessToken });
    assert.equal(asStaff.status, 200);
  });

  it('a created MANAGER can immediately manage staff', async () => {
    const team = await seedTeam();
    const staff = newStaff({ role: ROLES.MANAGER });

    await request('POST', '/api/v1/users', { token: team.ownerToken, body: staff });
    const session = (await login(staff.phone, staff.password)).body.data;

    const { status } = await request('GET', '/api/v1/users', { token: session.accessToken });
    assert.equal(status, 200);
  });
});

describe('the staff PIN (M0-D)', () => {
  const PIN = '4821';

  /** Sets a PIN on the cashier and returns the ids verifyPin needs. */
  async function withPin(team, pin = PIN) {
    const id = String(team.cashier.user._id);
    const response = await request('PATCH', `/api/v1/users/${id}/pin`, {
      token: team.ownerToken,
      body: { pin },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, { pinSet: true });
    return {
      userId: id,
      restaurantId: String(team.restaurant._id),
      branchId: String(team.branch._id),
    };
  }

  it('sets a PIN, and never echoes it back', async () => {
    const team = await seedTeam();
    const id = String(team.cashier.user._id);

    await request('PATCH', `/api/v1/users/${id}/pin`, { token: team.ownerToken, body: { pin: PIN } });

    for (const seen of observedResponses) {
      assert.equal(
        JSON.stringify(seen.body).includes(PIN),
        false,
        `the PIN leaked from ${seen.method} ${seen.path}`,
      );
    }

    const stored = await User.findOne({ _id: id, restaurantId: team.restaurant._id }).select('+pinHash');
    assert.ok(stored.pinHash, 'a hash is stored');
    assert.notEqual(stored.pinHash, PIN, 'not the PIN itself');
    assert.match(stored.pinHash, /^\$2[aby]\$/, 'a bcrypt hash');
  });

  it('rejects a PIN that is not 4 to 6 digits', async () => {
    const team = await seedTeam();
    const id = String(team.cashier.user._id);

    for (const bad of ['123', '1234567', '12a4', '', '  ']) {
      const { status, body } = await request('PATCH', `/api/v1/users/${id}/pin`, {
        token: team.ownerToken,
        body: { pin: bad },
      });
      assert.equal(status, 400, `"${bad}" must be rejected`);
      assert.equal(body.error.code, 'VALIDATION_FAILED');
    }
  });

  it('verifyPin returns the user id for the right PIN and issues no session', async () => {
    const team = await seedTeam();
    const ids = await withPin(team);

    const before = await RefreshToken.countDocuments({}).setOptions({ skipTenantGuard: true });

    const result = await verifyPin(ids, PIN);

    assert.deepEqual(Object.keys(result), ['userId'], 'nothing but the user id comes back');
    assert.equal(result.userId, ids.userId);

    const after = await RefreshToken.countDocuments({}).setOptions({ skipTenantGuard: true });
    assert.equal(after, before, 'a PIN check must never create a session');
  });

  it('verifyPin fails identically for a wrong PIN, no PIN, and an unknown user', async () => {
    const team = await seedTeam();
    const withoutPin = {
      userId: String(team.manager.user._id),
      restaurantId: String(team.restaurant._id),
      branchId: String(team.branch._id),
    };
    const ids = await withPin(team);

    const wrongPin = ids;
    const unknownUser = { ...ids, userId: '652f00000000000000000009' };

    for (const [label, target, pin] of [
      ['wrong pin', wrongPin, '0000'],
      ['no pin set', withoutPin, PIN],
      ['unknown user', unknownUser, PIN],
    ]) {
      await assert.rejects(
        () => verifyPin(target, pin),
        (error) => error.code === 'INVALID_PIN' && error.statusCode === 401,
        label,
      );
    }
  });

  it('locks the PIN after five wrong tries, and only a manager reset clears it', async () => {
    const team = await seedTeam();
    const ids = await withPin(team);

    for (let i = 0; i < 4; i += 1) {
      await assert.rejects(() => verifyPin(ids, '0000'), (e) => e.code === 'INVALID_PIN');
    }

    // The fifth failure locks it.
    await assert.rejects(() => verifyPin(ids, '0000'), (e) => e.code === 'PIN_LOCKED' && e.statusCode === 429);

    // Even the correct PIN is now refused, and it does not auto-unlock.
    await assert.rejects(() => verifyPin(ids, PIN), (e) => e.code === 'PIN_LOCKED');

    const locked = await User.findOne({ _id: ids.userId, restaurantId: ids.restaurantId });
    assert.ok(locked.pinLockedUntil instanceof Date);

    // A manager reset clears the lock.
    await withPin(team, '9999');
    const cleared = await User.findOne({ _id: ids.userId, restaurantId: ids.restaurantId });
    assert.equal(cleared.pinLockedUntil, null);

    const ok = await verifyPin(ids, '9999');
    assert.equal(ok.userId, ids.userId);
  });

  it('resets the failure count on a correct PIN', async () => {
    const team = await seedTeam();
    const ids = await withPin(team);

    await assert.rejects(() => verifyPin(ids, '0000'), (e) => e.code === 'INVALID_PIN');
    await assert.rejects(() => verifyPin(ids, '0000'), (e) => e.code === 'INVALID_PIN');

    await verifyPin(ids, PIN);

    const user = await User.findOne({ _id: ids.userId, restaurantId: ids.restaurantId }).select(
      '+pinFailedAttempts',
    );
    assert.equal(user.get('pinFailedAttempts'), 0);
  });

  it('is 404 for a user in another restaurant, never 403', async () => {
    const mine = await seedTeam();
    const theirs = await seedFullRestaurant({ name: 'Theirs' });

    const { status, body } = await request('PATCH', `/api/v1/users/${theirs.user._id}/pin`, {
      token: mine.ownerToken,
      body: { pin: PIN },
    });

    assert.equal(status, 404);
    assert.equal(body.error.code, 'NOT_FOUND');
  });
});
