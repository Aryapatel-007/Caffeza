/**
 * Feature switches. P02.
 *
 * A restaurant can switch inventory and attendance off. The server refuses
 * every route of a switched-off module with 403 FEATURE_DISABLED, for every
 * role including an owner, and a switched-off inventory stops firing and
 * cancelling from writing stock movements. Hiding links in React is tidiness;
 * these tests are about the part that is enforcement.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { AuditLog } from '../models/AuditLog.js';
import { StockMovement } from '../models/StockMovement.js';
import { fireOrder, openOrder, readOrder, seedFloor, seedTeam } from './helpers/m2Fixtures.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
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

const someId = '0'.repeat(24);
const range = 'from=2026-09-01&to=2026-09-30';

const switchFeature = (token, feature, on) =>
  request('PATCH', '/api/v1/settings', {
    token,
    body: { reason: 'Not used at this restaurant', features: { [feature]: on } },
  });

/** Every inventory route, plus the stock report. Bodies do not matter: the switch runs first. */
const INVENTORY_ROUTES = [
  ['POST', '/api/v1/ingredients'],
  ['GET', '/api/v1/ingredients'],
  ['PATCH', `/api/v1/ingredients/${someId}`],
  ['PATCH', `/api/v1/ingredients/${someId}/active`],
  ['PUT', '/api/v1/recipes'],
  ['GET', '/api/v1/recipes'],
  ['DELETE', `/api/v1/recipes/${someId}`],
  ['GET', `/api/v1/ingredients/${someId}/movements`],
  ['POST', `/api/v1/ingredients/${someId}/movements`],
  ['GET', '/api/v1/inventory/unmapped'],
  ['GET', `/api/v1/inventory/consumption?${range}`],
  ['GET', `/api/v1/reports/stock-consumption?${range}`],
];

/** Every attendance route, the station clock included, plus the labour report. */
const ATTENDANCE_ROUTES = [
  ['POST', '/api/v1/attendance/clock-in'],
  ['POST', '/api/v1/attendance/clock-out'],
  ['GET', '/api/v1/attendance/me'],
  ['POST', '/api/v1/attendance/station/clock'],
  ['GET', `/api/v1/attendance/summary?${range}`],
  ['GET', '/api/v1/attendance'],
  ['GET', `/api/v1/users/${someId}/attendance`],
  ['POST', '/api/v1/attendance'],
  ['PATCH', `/api/v1/attendance/${someId}`],
  ['PATCH', `/api/v1/attendance/${someId}/void`],
  ['GET', `/api/v1/reports/labour-hours?${range}`],
];

describe('inventory switched off', () => {
  it('refuses every inventory route and the stock report, even to an owner', async () => {
    const { tokens } = await seedTeam();
    assert.equal((await switchFeature(tokens.OWNER, 'inventory', false)).status, 200);

    for (const [method, path] of INVENTORY_ROUTES) {
      const response = await request(method, path, { token: tokens.OWNER, body: {} });
      assert.equal(response.status, 403, `${method} ${path}`);
      assert.equal(response.body.error.code, 'FEATURE_DISABLED', `${method} ${path}`);
      assert.equal(
        response.body.error.message,
        'Inventory is switched off for this restaurant. An owner can switch it on in Settings.',
      );
    }
  });

  it('tells a waiter the feature is off, not that the role is wrong', async () => {
    const { tokens } = await seedTeam();
    await switchFeature(tokens.OWNER, 'inventory', false);

    // POST /ingredients is not open to a waiter. The switch answers first.
    const response = await request('POST', '/api/v1/ingredients', { token: tokens.WAITER, body: {} });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'FEATURE_DISABLED');
  });

  it('leaves the other restaurant untouched', async () => {
    const first = await seedTeam();
    const second = await seedTeam();
    await switchFeature(first.tokens.OWNER, 'inventory', false);

    const response = await request('GET', '/api/v1/ingredients', { token: second.tokens.OWNER });
    assert.equal(response.status, 200);
  });

  it('serves the routes again once switched back on', async () => {
    const { tokens } = await seedTeam();
    await switchFeature(tokens.OWNER, 'inventory', false);
    await switchFeature(tokens.OWNER, 'inventory', true);

    const response = await request('GET', '/api/v1/ingredients', { token: tokens.OWNER });
    assert.equal(response.status, 200);
  });
});

describe('attendance switched off', () => {
  it('refuses every attendance route and the labour report', async () => {
    const { tokens } = await seedTeam();
    assert.equal((await switchFeature(tokens.OWNER, 'attendance', false)).status, 200);

    for (const [method, path] of ATTENDANCE_ROUTES) {
      const response = await request(method, path, { token: tokens.OWNER, body: {} });
      assert.equal(response.status, 403, `${method} ${path}`);
      assert.equal(response.body.error.code, 'FEATURE_DISABLED', `${method} ${path}`);
      assert.match(response.body.error.message, /^Attendance is switched off/);
    }
  });

  it('refuses the clock to a cook as well', async () => {
    const { tokens } = await seedTeam();
    await switchFeature(tokens.OWNER, 'attendance', false);

    const response = await request('POST', '/api/v1/attendance/clock-in', { token: tokens.KITCHEN });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'FEATURE_DISABLED');
  });
});

describe('stock movements follow the inventory switch', () => {
  /** A dish with a recipe, set up while inventory is still on. */
  async function mappedFloor() {
    const floor = await seedFloor();
    const { tokens, item } = floor;
    const paneer = (
      await request('POST', '/api/v1/ingredients', {
        token: tokens.OWNER,
        body: { name: 'Paneer', baseUnit: 'G', unitsPerBase: 1000, purchaseUnitName: 'kg', openingQtyInBase: 5000 },
      })
    ).body.data;
    const recipe = await request('PUT', '/api/v1/recipes', {
      token: tokens.OWNER,
      body: { menuItemId: item.id, items: [{ ingredientId: paneer.id, qtyInBase: 150 }] },
    });
    assert.equal(recipe.status, 200, JSON.stringify(recipe.body));
    return { ...floor, paneer };
  }

  const saleMovements = (restaurantId) =>
    StockMovement.countDocuments({
      restaurantId,
      type: { $in: ['DEDUCTION', 'CANCELLATION_RETURN'] },
    });

  async function fireAndCancel({ tokens, table, item }) {
    const opened = (
      await openOrder(tokens.WAITER, { tableId: table.id, lines: [{ menuItemId: item.id, quantity: 2 }] })
    ).body.data;
    const fired = await fireOrder(tokens.WAITER, opened.id, opened.version);
    assert.equal(fired.status, 200, JSON.stringify(fired.body));

    const current = (await readOrder(tokens.WAITER, opened.id)).body.data;
    return { opened, current };
  }

  it('writes no movement on fire or on cancel when inventory is off', async () => {
    const floor = await mappedFloor();
    const { tokens, restaurant } = floor;
    await switchFeature(tokens.OWNER, 'inventory', false);

    const { opened, current } = await fireAndCancel(floor);
    assert.equal(await saleMovements(restaurant._id), 0, 'firing deducted nothing');

    const cancelled = await request(
      'POST',
      `/api/v1/orders/${opened.id}/lines/${current.lines[0].id}/cancel`,
      {
        token: tokens.MANAGER,
        body: { version: current.version, reasonCode: 'WRONG_ITEM', wasPrepared: false },
      },
    );
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(await saleMovements(restaurant._id), 0, 'cancelling returned nothing');
  });

  it('writes the same movements as before when inventory is on', async () => {
    const floor = await mappedFloor();
    const { tokens, restaurant } = floor;

    const { opened, current } = await fireAndCancel(floor);
    assert.equal(
      await StockMovement.countDocuments({ restaurantId: restaurant._id, type: 'DEDUCTION' }),
      1,
    );

    await request('POST', `/api/v1/orders/${opened.id}/lines/${current.lines[0].id}/cancel`, {
      token: tokens.MANAGER,
      body: { version: current.version, reasonCode: 'WRONG_ITEM', wasPrepared: false },
    });
    assert.equal(
      await StockMovement.countDocuments({ restaurantId: restaurant._id, type: 'CANCELLATION_RETURN' }),
      1,
    );
  });
});

describe('the dashboard with features off', () => {
  it('keeps its shape: an empty lowStock and a null staffOnShift', async () => {
    const { tokens } = await seedTeam();
    await switchFeature(tokens.OWNER, 'inventory', false);
    await switchFeature(tokens.OWNER, 'attendance', false);

    const response = await request('GET', '/api/v1/reports/dashboard', { token: tokens.OWNER });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data.lowStock, []);
    assert.equal(response.body.data.staffOnShift, null);
    assert.ok('sales' in response.body.data);
  });
});

describe('GET /auth/me carries the feature switches', () => {
  it('returns features to a waiter and a cook', async () => {
    const { tokens } = await seedTeam();
    await switchFeature(tokens.OWNER, 'attendance', false);

    for (const role of ['WAITER', 'KITCHEN']) {
      const response = await request('GET', '/api/v1/auth/me', { token: tokens[role] });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data.features, { inventory: true, attendance: false }, role);
    }
  });
});

describe('switching a feature is audited', () => {
  it('writes one SETTINGS_CHANGED line with the field path', async () => {
    const { tokens, restaurant } = await seedTeam();
    await switchFeature(tokens.OWNER, 'inventory', false);

    const entries = await AuditLog.find({ restaurantId: restaurant._id });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, 'SETTINGS_CHANGED');
    assert.equal(entries[0].entityLabel, 'features.inventory');
    assert.deepEqual(entries[0].details, {
      field: 'features.inventory',
      previousValue: 'true',
      newValue: 'false',
    });
  });

  it('refuses a feature switch that is not a boolean', async () => {
    const { tokens } = await seedTeam();
    const response = await request('PATCH', '/api/v1/settings', {
      token: tokens.OWNER,
      body: { reason: 'x', features: { inventory: 'no' } },
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_FAILED');
  });
});
