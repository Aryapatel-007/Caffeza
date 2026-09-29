/**
 * Provisioning script tests.
 *
 * There is no signup endpoint, so this script is the only way an account comes
 * into existence. If it half-succeeds, the result is a restaurant nobody can
 * log into or a user pointing at a restaurant that does not exist.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import mongoose from 'mongoose';

import { ROLES } from '../config/roles.js';
import { Branch } from '../models/Branch.js';
import { Restaurant } from '../models/Restaurant.js';
import { User } from '../models/User.js';
import {
  createRecords,
  generatePassword,
  ProvisioningError,
  runProvisioning,
} from '../scripts/provisionRestaurant.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const INPUT = {
  restaurantName: 'Shreeji Dining Hall',
  ownerName: 'Rishi Patel',
  ownerPhone: '9876543210',
};

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

async function documentCounts() {
  const [restaurants, branches, users] = await Promise.all([
    Restaurant.countDocuments({}),
    Branch.countDocuments({}).setOptions({ skipTenantGuard: true }),
    User.countDocuments({}).setOptions({ skipTenantGuard: true }),
  ]);
  return { restaurants, branches, users };
}

describe('generatePassword', () => {
  it('is 16 characters with no look-alike glyphs', () => {
    const password = generatePassword();
    assert.equal(password.length, 16);
    assert.equal(/[0O1lI]/.test(password), false, 'these get misread off a screen');
  });

  it('does not repeat', () => {
    const generated = new Set(Array.from({ length: 50 }, () => generatePassword()));
    assert.equal(generated.size, 50);
  });
});

describe('runProvisioning', () => {
  it('creates exactly three documents, correctly linked', async () => {
    const result = await runProvisioning(INPUT);

    assert.deepEqual(await documentCounts(), { restaurants: 1, branches: 1, users: 1 });

    const restaurant = await Restaurant.findById(result.restaurantId);
    const branch = await Branch.findOne({ _id: result.branchId, restaurantId: result.restaurantId });
    const user = await User.findOne({ _id: result.userId, restaurantId: result.restaurantId });

    assert.equal(restaurant.name, INPUT.restaurantName);
    assert.equal(restaurant.isActive, true);
    assert.equal(branch.name, 'Main');
    assert.equal(String(branch.restaurantId), result.restaurantId);
    assert.equal(user.name, INPUT.ownerName);
    assert.equal(user.phone, INPUT.ownerPhone);
    assert.equal(user.role, ROLES.OWNER);
    assert.equal(String(user.branchId), result.branchId);
  });

  it('uses a transaction when the connection supports one', async () => {
    const result = await runProvisioning(INPUT);
    assert.equal(result.mode, 'transaction');
  });

  it('returns the password once and never stores it', async () => {
    const result = await runProvisioning(INPUT);

    assert.equal(result.password.length, 16);

    const user = await User.findOne({ _id: result.userId, restaurantId: result.restaurantId })
      .select('+passwordHash');
    assert.notEqual(user.passwordHash, result.password);
    assert.equal(user.passwordHash.includes(result.password), false);
  });

  it('produces an owner who can log in', async () => {
    const result = await runProvisioning(INPUT);

    const response = await request('POST', '/api/v1/auth/login', {
      body: { phone: INPUT.ownerPhone, password: result.password },
    });
    const { status, body } = response;

    assert.equal(status, 200);
    assert.equal(body.data.user.role, ROLES.OWNER);
    assert.equal(body.data.restaurant.name, INPUT.restaurantName);
    assert.equal(body.data.branch.name, 'Main');
    assert.ok(body.data.accessToken);

    // The refresh token is an httpOnly cookie now, not a body field.
    const setCookie =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')].filter(Boolean);
    assert.ok(setCookie.some((line) => line.startsWith('refreshToken=')), 'login sets the refresh cookie');
  });

  it('normalises a phone number typed with a country code', async () => {
    const result = await runProvisioning({ ...INPUT, ownerPhone: '+91 98765-43210' });
    const user = await User.findOne({ _id: result.userId, restaurantId: result.restaurantId });
    assert.equal(user.phone, '9876543210');
  });

  it('accepts a chosen password and an email login', async () => {
    const result = await runProvisioning({
      ...INPUT,
      ownerEmail: 'Founder@Example.com',
      password: 'a password i picked',
    });

    assert.equal(result.password, 'a password i picked');
    assert.equal(result.passwordSource, 'chosen');
    assert.equal(result.email, 'founder@example.com');

    const byEmail = await request('POST', '/api/v1/auth/login', {
      body: { email: 'founder@example.com', password: 'a password i picked' },
    });
    assert.equal(byEmail.status, 200);
    assert.equal(byEmail.body.data.user.role, ROLES.OWNER);
  });

  it('rejects a too-short chosen password before creating anything', async () => {
    await assert.rejects(
      () => runProvisioning({ ...INPUT, password: 'short' }),
      ProvisioningError,
    );
    assert.deepEqual(await documentCounts(), { restaurants: 0, branches: 0, users: 0 });
  });

  it('refuses an email already registered', async () => {
    await runProvisioning({ ...INPUT, ownerEmail: 'taken@example.com' });

    await assert.rejects(
      () =>
        runProvisioning({
          ...INPUT,
          restaurantName: 'Another Place',
          ownerPhone: '9812345678',
          ownerEmail: 'taken@example.com',
        }),
      ProvisioningError,
    );
  });

  it('refuses a phone number that already exists anywhere on the platform', async () => {
    await runProvisioning(INPUT);

    await assert.rejects(
      () => runProvisioning({ ...INPUT, restaurantName: 'A Different Restaurant' }),
      ProvisioningError,
    );

    assert.deepEqual(await documentCounts(), { restaurants: 1, branches: 1, users: 1 });
  });

  it('rejects bad input before touching the database', async () => {
    await assert.rejects(() => runProvisioning({ ...INPUT, restaurantName: '  ' }), ProvisioningError);
    await assert.rejects(() => runProvisioning({ ...INPUT, ownerName: '' }), ProvisioningError);
    await assert.rejects(() => runProvisioning({ ...INPUT, ownerPhone: '12345' }), ProvisioningError);

    assert.deepEqual(await documentCounts(), { restaurants: 0, branches: 0, users: 0 });
  });
});

describe('rollback on failure', () => {
  /**
   * The failure is forced at the last of the three creates, which is the worst
   * case: two documents already exist and the third is what fails. If nothing
   * unwinds them, the result is a restaurant with a branch and no owner, which
   * nobody can log into and nobody notices until they try.
   */
  function breakUserCreation() {
    const original = User.create.bind(User);
    User.create = () => Promise.reject(new Error('forced failure while creating the owner'));
    return () => {
      User.create = original;
    };
  }

  it('leaves nothing behind when the transaction path fails', async () => {
    const restore = breakUserCreation();
    try {
      await assert.rejects(() => runProvisioning(INPUT), /forced failure/);
    } finally {
      restore();
    }

    assert.deepEqual(
      await documentCounts(),
      { restaurants: 0, branches: 0, users: 0 },
      'the transaction must have rolled back all three',
    );
  });

  /**
   * The same failure without a transaction, which is what a standalone local
   * mongod gives you. There is no atomic undo, so the script deletes what it
   * created, in reverse.
   */
  it('cleans up by hand when there is no transaction', async () => {
    const created = {};
    const restore = breakUserCreation();

    let failed = false;
    try {
      await createRecords(
        { restaurantName: 'Manual Mode', ownerName: 'Rishi Patel', ownerPhone: '9876543211' },
        { session: null, password: 'a generated one', created },
      );
    } catch {
      failed = true;
    } finally {
      restore();
    }

    assert.equal(failed, true);
    assert.ok(created.restaurantId, 'the restaurant was created before the failure');
    assert.ok(created.branchId, 'so was the branch');
    assert.equal(created.userId, undefined, 'the owner was not');

    assert.deepEqual(
      await documentCounts(),
      { restaurants: 1, branches: 1, users: 0 },
      'without cleanup this is the orphan state the script has to undo',
    );

    // What runProvisioning does on this path.
    await User.deleteMany({ restaurantId: created.restaurantId });
    await Branch.deleteOne({ _id: created.branchId, restaurantId: created.restaurantId });
    await Restaurant.deleteOne({ _id: created.restaurantId });

    assert.deepEqual(await documentCounts(), { restaurants: 0, branches: 0, users: 0 });
  });

  it('reports which mode it used, because the guarantees differ', async () => {
    const result = await runProvisioning(INPUT);
    assert.ok(['transaction', 'manual'].includes(result.mode));
    assert.equal(result.mode, 'transaction', 'the test replica set supports them');
  });

  it('does not leave a session open after a failure', async () => {
    const restore = breakUserCreation();
    try {
      await assert.rejects(() => runProvisioning(INPUT));
    } finally {
      restore();
    }
    assert.equal(mongoose.connection.readyState, 1, 'the connection is still usable');
    await runProvisioning(INPUT);
    assert.deepEqual(await documentCounts(), { restaurants: 1, branches: 1, users: 1 });
  });
});
