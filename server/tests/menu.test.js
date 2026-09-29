/**
 * Menu management tests.
 *
 * The interesting cases are not the happy paths. They are: a variant id
 * surviving a rename, because M2 and M4 will both hold one as a foreign key; a
 * cross-restaurant read answering 404 rather than 403; the availability
 * endpoint being open to six roles and still unable to touch a price; and a
 * deactivated category hiding its items without writing to them.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ROLES } from '../config/roles.js';
import { Category } from '../models/Category.js';
import { MenuItem } from '../models/MenuItem.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { DEFAULT_PASSWORD, seedFullRestaurant, seedUser } from './helpers/seed.js';
import { observedResponses, request, startTestServer, stopTestServer } from './helpers/testServer.js';

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

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

const tokenFor = async (phone) =>
  (await request('POST', '/api/v1/auth/login', { body: { phone, password: DEFAULT_PASSWORD } })).body
    .data.accessToken;

/** A restaurant with one user in each of the six roles, all signed in. */
async function seedTeam(options = {}) {
  const base = await seedFullRestaurant(options);
  const { restaurant, branch } = base;

  const tokens = { OWNER: await tokenFor(base.phone) };

  for (const role of [ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN, ROLES.STOREKEEPER]) {
    const seeded = await seedUser({ restaurant, branch, name: role, role });
    tokens[role] = await tokenFor(seeded.phone);
  }

  return { ...base, tokens };
}

const createCategory = (token, body = {}) =>
  request('POST', '/api/v1/categories', { token, body: { name: 'Starters', ...body } });

async function createItem(token, body = {}) {
  const categoryId = body.categoryId ?? (await createCategory(token)).body.data.id;
  return request('POST', '/api/v1/menu-items', {
    token,
    body: {
      categoryId,
      name: 'Paneer Tikka',
      priceInPaise: 24000,
      taxRateBps: 500,
      ...body,
    },
  });
}

// ---------------------------------------------------------------------------

describe('tenancy', () => {
  it('answers 404, not 403, for an item in another restaurant, and leaks nothing', async () => {
    const a = await seedTeam({ name: 'Restaurant A' });
    const b = await seedTeam({ name: 'Restaurant B' });

    const created = await createItem(a.tokens.OWNER);
    const id = created.body.data.id;

    const response = await request('GET', `/api/v1/menu-items/${id}`, { token: b.tokens.OWNER });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'NOT_FOUND');

    // No hint the record exists: not the name, not the price, not the id.
    const body = JSON.stringify(response.body);
    assert.equal(body.includes('Paneer'), false);
    assert.equal(body.includes('24000'), false);
    assert.equal(body.includes(id), false);
  });

  it('returns none of restaurant A items to restaurant B', async () => {
    const a = await seedTeam({ name: 'Restaurant A' });
    const b = await seedTeam({ name: 'Restaurant B' });

    await createItem(a.tokens.OWNER);

    const response = await request('GET', '/api/v1/menu-items', { token: b.tokens.OWNER });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, []);
    assert.equal(response.body.meta.total, 0);
  });

  it('refuses to write a restaurantId sent in the body, silently', async () => {
    const a = await seedTeam({ name: 'Restaurant A' });
    const b = await seedTeam({ name: 'Restaurant B' });

    const response = await request('POST', '/api/v1/categories', {
      token: a.tokens.OWNER,
      body: { name: 'Injected', restaurantId: String(b.restaurant._id) },
    });

    // Stripped, not errored on: a 400 would confirm restaurantId is the lever.
    assert.equal(response.status, 201);
    assert.equal(response.body.data.restaurantId, String(a.restaurant._id));
  });

  it('adds no new use of the tenant guard escape hatch', () => {
    /**
     * readdirSync with recursive returns the platform separator, so on Windows
     * these arrive as "tests\auth.test.js". Comparing that against "tests/"
     * excluded nothing, and every test file that mentions the hatch, this one
     * included, was reported as a violation. A tripwire that cries wolf on
     * every run is a tripwire somebody eventually deletes.
     */
    const files = readdirSync(SERVER_DIR, { recursive: true, encoding: 'utf8' })
      .map((name) => name.split(sep).join('/'))
      .filter(
        (name) =>
          name.endsWith('.js') &&
          !name.includes('node_modules') &&
          !name.startsWith('tests/') &&
          name !== 'models/plugins/tenantGuard.js',
      );

    /**
     * Count CALL SITES, not files.
     *
     * This assertion used to be a list of filenames. That version could not see
     * a second, unreviewed hatch added inside a file already on the list, which
     * is exactly what happened: `isEmailRegistered` became a fourth production
     * use inside `authService.js`, which was already listed, and the tripwire
     * stayed green. A per-file count catches both a new file and a new use in
     * an old one.
     */
    const counts = {};
    for (const name of files) {
      const contents = readFileSync(join(SERVER_DIR, name), 'utf8');
      const uses = contents.match(/skipTenantGuard/g)?.length ?? 0;
      if (uses > 0) counts[name] = uses;
    }

    /**
     * The four sanctioned production uses, and no more. Every one is a lookup
     * that genuinely happens before any tenant is known, so there is no
     * restaurantId to filter on yet:
     *
     *   authService.verifyCredentials  - find the user by phone or email at
     *                                    login, before any token exists.
     *   authService.isPhoneRegistered  - phone is globally unique across the
     *                                    platform, so the check cannot be
     *                                    scoped to one restaurant.
     *   authService.isEmailRegistered  - email is globally unique on the same
     *                                    terms, for the same reason.
     *   tokenService                   - find a refresh token by its hash. At
     *                                    refresh time the token is the only
     *                                    thing the server has.
     *
     * This scan covers the whole `server/` tree, so it is the tripwire for
     * every module. M1, M2 and M5 each add zero. If a number here moves, or a
     * new file appears, a query has been let out of the guard and that is a
     * tenant leak, not a refactor.
     */
    assert.deepEqual(counts, {
      'services/authService.js': 3,
      'services/tokenService.js': 1,
    });
  });
});

// ---------------------------------------------------------------------------

describe('permissions, every row of the contract table', () => {
  const WRITE_ROLES = [ROLES.OWNER, ROLES.MANAGER];
  const READ_ONLY_ROLES = [ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN, ROLES.STOREKEEPER];

  it('allows all six roles every read', async () => {
    const team = await seedTeam();
    const created = await createItem(team.tokens.OWNER);
    const itemId = created.body.data.id;

    for (const role of Object.keys(team.tokens)) {
      const token = team.tokens[role];

      for (const path of ['/api/v1/categories', '/api/v1/menu-items', `/api/v1/menu-items/${itemId}`, '/api/v1/menu']) {
        const response = await request('GET', path, { token });
        assert.equal(response.status, 200, `${role} should read ${path}`);
      }
    }
  });

  it('allows only OWNER and MANAGER every write', async () => {
    const team = await seedTeam();
    const created = await createItem(team.tokens.OWNER);
    const itemId = created.body.data.id;
    const categoryId = created.body.data.categoryId;

    const writes = [
      ['POST', '/api/v1/categories', { name: 'Another' }],
      ['PATCH', `/api/v1/categories/${categoryId}`, { displayOrder: 5 }],
      ['PATCH', `/api/v1/categories/${categoryId}/active`, { isActive: true }],
      ['POST', '/api/v1/menu-items', null],
      ['PATCH', `/api/v1/menu-items/${itemId}`, { displayOrder: 5 }],
      ['PATCH', `/api/v1/menu-items/${itemId}/active`, { isActive: true }],
    ];

    for (const role of READ_ONLY_ROLES) {
      for (const [method, path, body] of writes) {
        const response = await request(method, path, {
          token: team.tokens[role],
          body: body ?? { categoryId, name: `X ${role}`, priceInPaise: 100, taxRateBps: 0 },
        });
        assert.equal(response.status, 403, `${role} must not ${method} ${path}`);
        assert.equal(response.body.error.code, 'FORBIDDEN');
      }
    }

    for (const role of WRITE_ROLES) {
      const response = await request('PATCH', `/api/v1/menu-items/${itemId}`, {
        token: team.tokens[role],
        body: { displayOrder: 7 },
      });
      assert.equal(response.status, 200, `${role} should be able to edit an item`);
    }
  });

  it('lets a WAITER toggle availability but not create an item', async () => {
    const team = await seedTeam();
    const created = await createItem(team.tokens.OWNER);
    const itemId = created.body.data.id;

    const create = await request('POST', '/api/v1/menu-items', {
      token: team.tokens.WAITER,
      body: {
        categoryId: created.body.data.categoryId,
        name: 'Waiter Special',
        priceInPaise: 100,
        taxRateBps: 0,
      },
    });
    assert.equal(create.status, 403);

    const toggle = await request('PATCH', `/api/v1/menu-items/${itemId}/availability`, {
      token: team.tokens.WAITER,
      body: { isAvailable: false },
    });
    assert.equal(toggle.status, 200);
    assert.equal(toggle.body.data.isAvailable, false);
  });

  it('rejects a price sent to the availability endpoint by a KITCHEN user', async () => {
    const team = await seedTeam();
    const created = await createItem(team.tokens.OWNER);

    const response = await request(
      'PATCH',
      `/api/v1/menu-items/${created.body.data.id}/availability`,
      { token: team.tokens.KITCHEN, body: { isAvailable: false, priceInPaise: 1 } },
    );

    // Rejected outright, not ignored. This endpoint is reachable by four roles
    // that must never reach a price.
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_FAILED');

    const unchanged = await MenuItem.findOne({
      restaurantId: created.body.data.restaurantId,
      _id: created.body.data.id,
    });
    assert.equal(unchanged.priceInPaise, 24000);
    assert.equal(unchanged.isAvailable, true);
  });
});

// ---------------------------------------------------------------------------

describe('money and tax', () => {
  it('rejects a fractional price', async () => {
    const team = await seedTeam();
    const response = await createItem(team.tokens.OWNER, { priceInPaise: 199.5 });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_FAILED');
    assert.match(response.body.error.fields.priceInPaise, /whole number/i);
  });

  it('rejects a negative price', async () => {
    const team = await seedTeam();
    const response = await createItem(team.tokens.OWNER, { priceInPaise: -1 });

    assert.equal(response.status, 400);
    assert.match(response.body.error.fields.priceInPaise, /negative/i);
  });

  it('rejects a tax rate over one hundred percent', async () => {
    const team = await seedTeam();
    const response = await createItem(team.tokens.OWNER, { taxRateBps: 10001 });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_FAILED');
  });

  it('accepts a zero tax rate, because some items are genuinely zero-rated', async () => {
    const team = await seedTeam();
    const response = await createItem(team.tokens.OWNER, { taxRateBps: 0 });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.taxRateBps, 0);
  });

  it('rejects a fractional variant price', async () => {
    const team = await seedTeam();
    const response = await createItem(team.tokens.OWNER, {
      variants: [{ name: 'Half', priceInPaise: 140.5 }],
    });

    assert.equal(response.status, 400);
  });
});

// ---------------------------------------------------------------------------

describe('name uniqueness', () => {
  it('treats a name as taken regardless of case, for categories', async () => {
    const team = await seedTeam();

    assert.equal((await createCategory(team.tokens.OWNER, { name: 'Starters' })).status, 201);

    const clash = await createCategory(team.tokens.OWNER, { name: 'starters' });
    assert.equal(clash.status, 409);
    assert.equal(clash.body.error.code, 'DUPLICATE_CATEGORY_NAME');
  });

  it('treats a name as taken regardless of case, for menu items', async () => {
    const team = await seedTeam();
    const categoryId = (await createCategory(team.tokens.OWNER)).body.data.id;

    assert.equal((await createItem(team.tokens.OWNER, { categoryId })).status, 201);

    const clash = await createItem(team.tokens.OWNER, { categoryId, name: 'paneer tikka' });
    assert.equal(clash.status, 409);
    assert.equal(clash.body.error.code, 'DUPLICATE_MENU_ITEM_NAME');
  });

  it('allows the same item name in a different restaurant', async () => {
    const a = await seedTeam({ name: 'Restaurant A' });
    const b = await seedTeam({ name: 'Restaurant B' });

    assert.equal((await createItem(a.tokens.OWNER)).status, 201);
    assert.equal((await createItem(b.tokens.OWNER)).status, 201);
  });
});

// ---------------------------------------------------------------------------

describe('variant id stability', () => {
  async function itemWithTwoVariants(token) {
    const created = await createItem(token, {
      variants: [
        { name: 'Half', priceInPaise: 14000 },
        { name: 'Full', priceInPaise: 24000 },
      ],
    });

    assert.equal(created.status, 201);
    return created.body.data;
  }

  it('keeps both ids byte-identical across a rename', async () => {
    const team = await seedTeam();
    const item = await itemWithTwoVariants(team.tokens.OWNER);
    const [half, full] = item.variants;

    const response = await request('PATCH', `/api/v1/menu-items/${item.id}`, {
      token: team.tokens.OWNER,
      body: {
        variants: [
          { id: half.id, name: 'Half Plate', priceInPaise: 14000 },
          { id: full.id, name: 'Full', priceInPaise: 24000 },
        ],
      },
    });

    assert.equal(response.status, 200);

    const updated = response.body.data.variants;
    assert.equal(updated[0].id, half.id);
    assert.equal(updated[1].id, full.id);
    assert.equal(updated[0].name, 'Half Plate');
  });

  it('keeps the kept id, drops the omitted one, and mints a fresh id for a new entry', async () => {
    const team = await seedTeam();
    const item = await itemWithTwoVariants(team.tokens.OWNER);
    const [half, full] = item.variants;

    const response = await request('PATCH', `/api/v1/menu-items/${item.id}`, {
      token: team.tokens.OWNER,
      body: {
        variants: [
          { id: half.id, name: 'Half', priceInPaise: 15000 },
          { name: 'Family', priceInPaise: 40000 },
        ],
      },
    });

    assert.equal(response.status, 200);

    const updated = response.body.data.variants;
    assert.equal(updated.length, 2);
    assert.equal(updated[0].id, half.id, 'the kept variant keeps its id');
    assert.equal(updated[0].priceInPaise, 15000);
    assert.equal(updated[1].name, 'Family');
    assert.notEqual(updated[1].id, full.id, 'the new variant is not handed the dropped id');
    assert.equal(
      updated.some((variant) => variant.id === full.id),
      false,
      'the omitted variant is gone',
    );
  });

  it('answers 404 for a variant id from another item, and writes nothing', async () => {
    const team = await seedTeam();
    const first = await itemWithTwoVariants(team.tokens.OWNER);

    const second = await createItem(team.tokens.OWNER, {
      categoryId: first.categoryId,
      name: 'Dal Makhani',
      variants: [{ name: 'Bowl', priceInPaise: 18000 }],
    });

    const stranger = second.body.data.variants[0].id;

    const response = await request('PATCH', `/api/v1/menu-items/${first.id}`, {
      token: team.tokens.OWNER,
      body: {
        variants: [
          { id: first.variants[0].id, name: 'Half', priceInPaise: 14000 },
          { id: stranger, name: 'Smuggled', priceInPaise: 1 },
        ],
      },
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'VARIANT_NOT_FOUND');

    // Nothing was created and nothing was renamed: the whole request is refused.
    const unchanged = await MenuItem.findOne({
      restaurantId: first.restaurantId,
      _id: first.id,
    });
    assert.equal(unchanged.variants.length, 2);
    assert.deepEqual(
      unchanged.variants.map((variant) => variant.name),
      ['Half', 'Full'],
    );
  });

  it('preserves a variant availability flag through a rename that omits it', async () => {
    const team = await seedTeam();
    const item = await itemWithTwoVariants(team.tokens.OWNER);
    const half = item.variants[0];

    await request('PATCH', `/api/v1/menu-items/${item.id}/availability`, {
      token: team.tokens.KITCHEN,
      body: { isAvailable: false, variantId: half.id },
    });

    const response = await request('PATCH', `/api/v1/menu-items/${item.id}`, {
      token: team.tokens.OWNER,
      body: { variants: [{ id: half.id, name: 'Half Plate', priceInPaise: 14000 }] },
    });

    // A rename must not put a variant the kitchen switched off back on the screen.
    assert.equal(response.body.data.variants[0].isAvailable, false);
  });

  it('applies the same rule to add-ons, with its own error code', async () => {
    const team = await seedTeam();
    const created = await createItem(team.tokens.OWNER, {
      addOns: [{ name: 'Extra cheese', priceInPaise: 4000 }],
    });

    const item = created.body.data;
    const addOnId = item.addOns[0].id;

    const kept = await request('PATCH', `/api/v1/menu-items/${item.id}`, {
      token: team.tokens.OWNER,
      body: { addOns: [{ id: addOnId, name: 'Extra Cheese', priceInPaise: 4500 }] },
    });
    assert.equal(kept.body.data.addOns[0].id, addOnId);

    const missing = await request('PATCH', `/api/v1/menu-items/${item.id}`, {
      token: team.tokens.OWNER,
      body: { addOns: [{ id: String(item.restaurantId), name: 'Ghost', priceInPaise: 1 }] },
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'ADDON_NOT_FOUND');
  });

  it('rejects two variants with the same name', async () => {
    const team = await seedTeam();
    const response = await createItem(team.tokens.OWNER, {
      variants: [
        { name: 'Half', priceInPaise: 14000 },
        { name: 'half', priceInPaise: 15000 },
      ],
    });

    assert.equal(response.status, 400);
  });
});

// ---------------------------------------------------------------------------

describe('serialisation', () => {
  it('never ships _id or __v, including inside variants and add-ons', async () => {
    const team = await seedTeam();
    const created = await createItem(team.tokens.OWNER, {
      variants: [{ name: 'Half', priceInPaise: 14000 }],
      addOns: [{ name: 'Extra cheese', priceInPaise: 4000 }],
    });

    const fetched = await request('GET', `/api/v1/menu-items/${created.body.data.id}`, {
      token: team.tokens.OWNER,
    });

    const body = JSON.stringify(fetched.body);
    assert.equal(body.includes('"_id"'), false, 'a subdocument leaked _id');
    assert.equal(body.includes('"__v"'), false);

    // The ids are still there, under the name the contract uses.
    assert.ok(fetched.body.data.id);
    assert.ok(fetched.body.data.variants[0].id);
    assert.ok(fetched.body.data.addOns[0].id);
  });

  it('never ships nameLower, on any endpoint this suite has called', async () => {
    const team = await seedTeam();
    await createItem(team.tokens.OWNER, { variants: [{ name: 'Half', priceInPaise: 14000 }] });

    await request('GET', '/api/v1/menu-items', { token: team.tokens.OWNER });
    await request('GET', '/api/v1/categories', { token: team.tokens.OWNER });
    await request('GET', '/api/v1/menu', { token: team.tokens.OWNER });

    for (const response of observedResponses) {
      assert.equal(
        JSON.stringify(response.body).includes('nameLower'),
        false,
        `nameLower leaked from ${response.method} ${response.path}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------

describe('deactivating a category', () => {
  async function categoryWithItem(token) {
    const categoryId = (await createCategory(token)).body.data.id;
    const item = await createItem(token, { categoryId });
    return { categoryId, itemId: item.body.data.id };
  }

  it('hides the items without writing to them, and restores them exactly', async () => {
    const team = await seedTeam();
    const { categoryId, itemId } = await categoryWithItem(team.tokens.OWNER);

    await request('PATCH', `/api/v1/categories/${categoryId}/active`, {
      token: team.tokens.OWNER,
      body: { isActive: false },
    });

    const hidden = await request('GET', '/api/v1/menu', { token: team.tokens.OWNER });
    assert.deepEqual(hidden.body.data, []);

    const hiddenList = await request('GET', '/api/v1/menu-items', { token: team.tokens.OWNER });
    assert.deepEqual(hiddenList.body.data, []);

    // The item itself was never touched. No cascade, nothing deleted.
    const stored = await MenuItem.findOne({ restaurantId: team.restaurant._id, _id: itemId });
    assert.equal(stored.isActive, true, 'the item own isActive must not be cascaded');
    assert.equal(stored.isAvailable, true);

    await request('PATCH', `/api/v1/categories/${categoryId}/active`, {
      token: team.tokens.OWNER,
      body: { isActive: true },
    });

    const restored = await request('GET', '/api/v1/menu', { token: team.tokens.OWNER });
    assert.equal(restored.body.data.length, 1);
    assert.equal(restored.body.data[0].items.length, 1);
    assert.equal(restored.body.data[0].items[0].id, itemId);
  });

  it('refuses a new item under an inactive category with 422, not 404', async () => {
    const team = await seedTeam();
    const categoryId = (await createCategory(team.tokens.OWNER)).body.data.id;

    await request('PATCH', `/api/v1/categories/${categoryId}/active`, {
      token: team.tokens.OWNER,
      body: { isActive: false },
    });

    const response = await createItem(team.tokens.OWNER, { categoryId, name: 'New Dish' });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'BUSINESS_RULE_VIOLATED');
  });

  it('answers 404 for a category id that does not exist', async () => {
    const team = await seedTeam();
    const response = await createItem(team.tokens.OWNER, {
      categoryId: String(team.restaurant._id),
      name: 'Orphan',
    });

    assert.equal(response.status, 404);
  });
});

// ---------------------------------------------------------------------------

describe('the menu tree', () => {
  it('excludes unavailable items by default and includes them on request', async () => {
    const team = await seedTeam();
    const created = await createItem(team.tokens.OWNER);
    const itemId = created.body.data.id;

    await request('PATCH', `/api/v1/menu-items/${itemId}/availability`, {
      token: team.tokens.KITCHEN,
      body: { isAvailable: false },
    });

    const byDefault = await request('GET', '/api/v1/menu', { token: team.tokens.WAITER });
    assert.equal(byDefault.body.data[0].items.length, 0, 'a sold-out dish is not orderable');

    const withUnavailable = await request('GET', '/api/v1/menu?includeUnavailable=true', {
      token: team.tokens.WAITER,
    });
    assert.equal(withUnavailable.body.data[0].items.length, 1);
    assert.equal(withUnavailable.body.data[0].items[0].isAvailable, false);
  });

  it('never returns an inactive item, whatever the query says', async () => {
    const team = await seedTeam();
    const created = await createItem(team.tokens.OWNER);

    await request('PATCH', `/api/v1/menu-items/${created.body.data.id}/active`, {
      token: team.tokens.OWNER,
      body: { isActive: false },
    });

    for (const path of ['/api/v1/menu', '/api/v1/menu?includeUnavailable=true']) {
      const response = await request('GET', path, { token: team.tokens.OWNER });
      assert.equal(response.body.data[0].items.length, 0, `${path} revealed an inactive item`);
    }
  });

  it('keeps an emptied category as a tab rather than dropping it', async () => {
    const team = await seedTeam();
    await createCategory(team.tokens.OWNER, { name: 'Desserts' });

    const response = await request('GET', '/api/v1/menu', { token: team.tokens.OWNER });

    assert.equal(response.body.data.length, 1);
    assert.deepEqual(response.body.data[0].items, []);
  });

  it('orders categories and items by displayOrder, then name', async () => {
    const team = await seedTeam();

    const second = await createCategory(team.tokens.OWNER, { name: 'Mains', displayOrder: 20 });
    const first = await createCategory(team.tokens.OWNER, { name: 'Starters', displayOrder: 10 });

    await createItem(team.tokens.OWNER, {
      categoryId: first.body.data.id,
      name: 'Zeera Soda',
      displayOrder: 5,
    });
    await createItem(team.tokens.OWNER, {
      categoryId: first.body.data.id,
      name: 'Aloo Tikki',
      displayOrder: 1,
    });

    const response = await request('GET', '/api/v1/menu', { token: team.tokens.OWNER });

    assert.deepEqual(
      response.body.data.map((category) => category.name),
      ['Starters', 'Mains'],
    );
    assert.deepEqual(
      response.body.data[0].items.map((item) => item.name),
      ['Aloo Tikki', 'Zeera Soda'],
    );
    assert.equal(response.body.data[1].id, second.body.data.id);
  });
});

// ---------------------------------------------------------------------------

describe('search', () => {
  it('matches a substring, case-insensitively', async () => {
    const team = await seedTeam();
    await createItem(team.tokens.OWNER);

    const response = await request('GET', '/api/v1/menu-items?search=paneer', {
      token: team.tokens.OWNER,
    });

    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].name, 'Paneer Tikka');
  });

  it('closes regex injection: ".*" matches nothing and does not error', async () => {
    const team = await seedTeam();
    await createItem(team.tokens.OWNER);
    await createItem(team.tokens.OWNER, {
      categoryId: (await createCategory(team.tokens.OWNER, { name: 'Mains' })).body.data.id,
      name: 'Dal Makhani',
    });

    const response = await request('GET', '/api/v1/menu-items?search=.*', {
      token: team.tokens.OWNER,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, [], 'an unescaped .* would have matched every row');
    assert.equal(response.body.meta.total, 0);
  });

  it('rejects a search string over the cap', async () => {
    const team = await seedTeam();
    const response = await request('GET', `/api/v1/menu-items?search=${'a'.repeat(61)}`, {
      token: team.tokens.OWNER,
    });

    assert.equal(response.status, 400);
  });
});

// ---------------------------------------------------------------------------

describe('the list endpoint', () => {
  it('filters by category and by availability', async () => {
    const team = await seedTeam();
    const starters = (await createCategory(team.tokens.OWNER)).body.data.id;
    const mains = (await createCategory(team.tokens.OWNER, { name: 'Mains' })).body.data.id;

    await createItem(team.tokens.OWNER, { categoryId: starters });
    const inMains = await createItem(team.tokens.OWNER, { categoryId: mains, name: 'Dal Makhani' });

    const byCategory = await request(`GET`, `/api/v1/menu-items?categoryId=${mains}`, {
      token: team.tokens.OWNER,
    });
    assert.equal(byCategory.body.data.length, 1);
    assert.equal(byCategory.body.data[0].name, 'Dal Makhani');

    await request('PATCH', `/api/v1/menu-items/${inMains.body.data.id}/availability`, {
      token: team.tokens.OWNER,
      body: { isAvailable: false },
    });

    const available = await request('GET', '/api/v1/menu-items?availableOnly=true', {
      token: team.tokens.OWNER,
    });
    assert.equal(available.body.data.length, 1);
    assert.equal(available.body.data[0].name, 'Paneer Tikka');
  });

  it('hides an inactive item by default and shows it with includeInactive', async () => {
    const team = await seedTeam();
    const created = await createItem(team.tokens.OWNER);

    await request('PATCH', `/api/v1/menu-items/${created.body.data.id}/active`, {
      token: team.tokens.OWNER,
      body: { isActive: false },
    });

    const byDefault = await request('GET', '/api/v1/menu-items', { token: team.tokens.OWNER });
    assert.equal(byDefault.body.data.length, 0);

    const included = await request('GET', '/api/v1/menu-items?includeInactive=true', {
      token: team.tokens.OWNER,
    });
    assert.equal(included.body.data.length, 1);
    assert.equal(included.body.data[0].isActive, false);
  });

  it('reads the string "false" as false, not as a truthy string', async () => {
    const team = await seedTeam();
    await createItem(team.tokens.OWNER);

    // z.coerce.boolean() would turn "false" into true here and quietly return
    // inactive rows. Logged as a decision from M0-C.
    const response = await request('GET', '/api/v1/menu-items?includeInactive=false', {
      token: team.tokens.OWNER,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 1);
  });
});

// ---------------------------------------------------------------------------

describe('categories', () => {
  it('hides inactive categories from the list by default', async () => {
    const team = await seedTeam();
    const id = (await createCategory(team.tokens.OWNER)).body.data.id;

    await request('PATCH', `/api/v1/categories/${id}/active`, {
      token: team.tokens.OWNER,
      body: { isActive: false },
    });

    assert.equal(
      (await request('GET', '/api/v1/categories', { token: team.tokens.OWNER })).body.data.length,
      0,
    );
    assert.equal(
      (await request('GET', '/api/v1/categories?includeInactive=true', { token: team.tokens.OWNER }))
        .body.data.length,
      1,
    );
  });

  it('refuses an empty update body', async () => {
    const team = await seedTeam();
    const id = (await createCategory(team.tokens.OWNER)).body.data.id;

    const response = await request('PATCH', `/api/v1/categories/${id}`, {
      token: team.tokens.OWNER,
      body: {},
    });

    assert.equal(response.status, 400);
  });

  it('refuses isActive on the general update endpoint, rather than ignoring it', async () => {
    const team = await seedTeam();
    const id = (await createCategory(team.tokens.OWNER)).body.data.id;

    const response = await request('PATCH', `/api/v1/categories/${id}`, {
      token: team.tokens.OWNER,
      body: { isActive: false },
    });

    assert.equal(response.status, 400);

    const stored = await Category.findOne({ restaurantId: team.restaurant._id, _id: id });
    assert.equal(stored.isActive, true);
  });

  it('answers 404 for a category in another restaurant on update', async () => {
    const a = await seedTeam({ name: 'Restaurant A' });
    const b = await seedTeam({ name: 'Restaurant B' });

    const id = (await createCategory(a.tokens.OWNER)).body.data.id;

    const response = await request('PATCH', `/api/v1/categories/${id}`, {
      token: b.tokens.OWNER,
      body: { name: 'Hijacked' },
    });

    assert.equal(response.status, 404);
  });
});

// ---------------------------------------------------------------------------

describe('authentication', () => {
  it('answers 401 to every menu route without a token', async () => {
    const paths = [
      ['GET', '/api/v1/categories'],
      ['POST', '/api/v1/categories'],
      ['GET', '/api/v1/menu-items'],
      ['POST', '/api/v1/menu-items'],
      ['GET', '/api/v1/menu'],
    ];

    for (const [method, path] of paths) {
      const response = await request(method, path, { body: method === 'GET' ? undefined : {} });
      assert.equal(response.status, 401, `${method} ${path} must require a token`);
    }
  });
});
