/**
 * P34: setting a new password from the sign-in screen, approved by an owner's
 * or manager's own phone and PIN. docs/API-CONTRACT.md section 1.7.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ROLES } from '../config/roles.js';
import { AuditLog } from '../models/AuditLog.js';
import { ALL_MODELS } from '../models/index.js';
import { User } from '../models/User.js';
import { setPin } from '../services/authService.js';
import { RESET_REFUSED } from '../services/passwordResetService.js';
import { DEFAULT_PASSWORD, seedRestaurant, seedUser } from './helpers/seed.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const PIN = '4826';
const NEW_PASSWORD = 'a brand new one';

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

/** A restaurant with an owner and a manager who both have a PIN, a cashier and a captain. */
async function team() {
  const { restaurant, branch } = await seedRestaurant();
  const people = {};
  for (const role of [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER]) {
    people[role] = await seedUser({ restaurant, branch, name: role, role });
  }
  await setPin(people.OWNER.user, PIN);
  await setPin(people.MANAGER.user, PIN);
  return { restaurant, branch, ...people };
}

const reset = (body) => request('POST', '/api/v1/auth/password-reset', { body });

const asking = (person, approver, pin = PIN) => ({
  phone: person.phone,
  newPassword: NEW_PASSWORD,
  approval: { approverPhone: approver.phone, pin },
});

const login = (phone, password) => request('POST', '/api/v1/auth/login', { body: { phone, password } });

/** Every refusal is this one answer, whatever went wrong. */
function assertRefused(response) {
  assert.equal(response.status, 401, JSON.stringify(response.body));
  assert.deepEqual(response.body, {
    success: false,
    error: { code: 'INVALID_CREDENTIALS', message: RESET_REFUSED },
  });
}

describe('POST /auth/password-reset', () => {
  it("sets a cashier's password with the manager's PIN, ends their sessions, and audits the manager", async () => {
    const t = await team();
    const before = await login(t.CASHIER.phone, DEFAULT_PASSWORD);
    assert.equal(before.status, 200);
    const oldToken = before.body.data.accessToken;

    const done = await reset(asking(t.CASHIER, t.MANAGER));
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.deepEqual(done.body.data, { passwordSet: true });

    assert.equal((await login(t.CASHIER.phone, DEFAULT_PASSWORD)).status, 401, 'the old password no longer works');
    assert.equal((await login(t.CASHIER.phone, NEW_PASSWORD)).status, 200, 'the new one signs in');
    assert.equal((await request('GET', '/api/v1/auth/me', { token: oldToken })).status, 401, 'the old session is over');

    const audit = await AuditLog.find({ restaurantId: t.restaurant._id, action: 'USER_PASSWORD_RESET' }).lean();
    assert.equal(audit.length, 1);
    assert.equal(String(audit[0].actorId), String(t.MANAGER.user._id));
    assert.equal(audit[0].actorRole, ROLES.MANAGER);
    assert.equal(String(audit[0].entityId), String(t.CASHIER.user._id));
    assert.deepEqual(audit[0].details, { role: ROLES.CASHIER, source: 'SIGN_IN_SCREEN' });
  });

  it('lets an owner approve a manager, and works by email as login does', async () => {
    const t = await team();
    await User.updateOne({ _id: t.MANAGER.user._id, restaurantId: t.restaurant._id }, { email: 'manager@example.com' });

    const done = await reset({ email: 'Manager@Example.com', newPassword: NEW_PASSWORD, approval: { approverPhone: t.OWNER.phone, pin: PIN } });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal((await login(t.MANAGER.phone, NEW_PASSWORD)).status, 200);
  });

  it('refuses every wrong case with the identical answer, and changes no password', async () => {
    const t = await team();
    const other = await team();
    const inactive = await seedUser({ restaurant: t.restaurant, branch: t.branch, role: ROLES.CASHIER, isActive: false });
    const system = await seedUser({ restaurant: t.restaurant, branch: t.branch, role: ROLES.CASHIER });
    await User.updateOne({ _id: system.user._id, restaurantId: t.restaurant._id }, { isSystem: true });
    const noPinManager = await seedUser({ restaurant: t.restaurant, branch: t.branch, role: ROLES.MANAGER });

    const cases = {
      'an unknown phone': { ...asking(t.CASHIER, t.MANAGER), phone: '9123456780' },
      'a wrong PIN': asking(t.CASHIER, t.MANAGER, '1111'),
      'an approver from another restaurant': asking(t.CASHIER, other.MANAGER),
      'an approver who is a cashier': asking(t.WAITER, t.CASHIER),
      'a manager approving themselves': asking(t.MANAGER, t.MANAGER),
      'an owner approving themselves': asking(t.OWNER, t.OWNER),
      'a manager approving an owner': asking(t.OWNER, t.MANAGER),
      'an approver with no PIN': asking(t.CASHIER, noPinManager),
      'an inactive person': asking(inactive, t.MANAGER),
      'the integration user': asking(system, t.MANAGER),
    };

    for (const [name, body] of Object.entries(cases)) {
      const response = await reset(body);
      assert.equal(response.status, 401, name);
      assertRefused(response);
    }

    // The wrong PIN above counted one try against the manager; still unlocked.
    for (const person of [t.CASHIER, t.WAITER, t.MANAGER, t.OWNER]) {
      assert.equal((await login(person.phone, DEFAULT_PASSWORD)).status, 200, 'no password changed');
    }
    assert.equal(await AuditLog.countDocuments({ restaurantId: t.restaurant._id, action: 'USER_PASSWORD_RESET' }), 0);
  });

  it("locks the approver's PIN after five wrong tries, after which even the right PIN is refused", async () => {
    const t = await team();
    for (let attempt = 0; attempt < 5; attempt += 1) assertRefused(await reset(asking(t.CASHIER, t.MANAGER, '1111')));

    assertRefused(await reset(asking(t.CASHIER, t.MANAGER, PIN)));
    const manager = await User.findOne({ _id: t.MANAGER.user._id, restaurantId: t.restaurant._id }).lean();
    assert.ok(manager.pinLockedUntil, 'the manager PIN is locked');
    assert.equal((await login(t.CASHIER.phone, DEFAULT_PASSWORD)).status, 200);
  });

  it('refuses a bad shape with 400, and an approverId in place of a phone', async () => {
    const t = await team();
    const short = await reset({ ...asking(t.CASHIER, t.MANAGER), newPassword: 'short' });
    assert.equal(short.status, 400);
    const both = await reset({ ...asking(t.CASHIER, t.MANAGER), email: 'x@example.com' });
    assert.equal(both.status, 400);
    const byId = await reset({ phone: t.CASHIER.phone, newPassword: NEW_PASSWORD, approval: { approverId: String(t.MANAGER.user._id), pin: PIN } });
    assert.equal(byId.status, 400);
  });
});
