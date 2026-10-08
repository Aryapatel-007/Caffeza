/**
 * Table and counter tests.
 *
 * The interesting cases: occupancy being derived rather than stored, so it
 * cannot be stale; the sequence generator surviving concurrent callers, which
 * is the thing that would quietly produce two order number 43s on a Friday;
 * and a table refusing to be switched off while someone is sitting at it.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ROLES } from '../config/roles.js';
import { Counter, COUNTER_NAMES } from '../models/Counter.js';
import { nextNumber } from '../services/counterService.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { createTable, seedTeam } from './helpers/m2Fixtures.js';
import { seedFullRestaurant } from './helpers/seed.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

before(async () => {
  await startTestDatabase();
  await startTestServer();
  // The concurrency test below relies on the unique counter index, and index
  // builds are asynchronous: without waiting, twenty racing upserts can each
  // create their own counter before the index exists. Same fix as
  // billNumber.test.js.
  await Counter.init();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
});

// ---------------------------------------------------------------------------

describe('the sequence generator', () => {
  it('hands out consecutive numbers starting at 1', async () => {
    const { restaurant, branch } = await seedFullRestaurant();
    const args = { restaurantId: restaurant._id, branchId: branch._id, name: COUNTER_NAMES.ORDER };

    assert.equal(await nextNumber(args), 1);
    assert.equal(await nextNumber(args), 2);
    assert.equal(await nextNumber(args), 3);
  });

  it('never hands the same number to two concurrent callers', async () => {
    const { restaurant, branch } = await seedFullRestaurant();
    const args = { restaurantId: restaurant._id, branchId: branch._id, name: COUNTER_NAMES.ORDER };

    /**
     * The whole reason this is an atomic $inc rather than a read followed by a
     * write. Twenty simultaneous callers must produce twenty distinct numbers.
     */
    const issued = await Promise.all(Array.from({ length: 20 }, () => nextNumber(args)));

    assert.equal(new Set(issued).size, 20);
    assert.deepEqual([...issued].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('keeps a separate sequence per restaurant and per name', async () => {
    const a = await seedFullRestaurant({ name: 'A' });
    const b = await seedFullRestaurant({ name: 'B' });

    const orderA = { restaurantId: a.restaurant._id, branchId: a.branch._id, name: COUNTER_NAMES.ORDER };
    const kotA = { restaurantId: a.restaurant._id, branchId: a.branch._id, name: COUNTER_NAMES.KOT };
    const orderB = { restaurantId: b.restaurant._id, branchId: b.branch._id, name: COUNTER_NAMES.ORDER };

    await nextNumber(orderA);
    await nextNumber(orderA);

    // Neither the other sequence nor the other restaurant has moved.
    assert.equal(await nextNumber(kotA), 1);
    assert.equal(await nextNumber(orderB), 1);
    assert.equal(await nextNumber(orderA), 3);
  });
});

describe('creating a table', () => {
  it('creates one and defaults displayOrder to 0', async () => {
    const { tokens } = await seedTeam();

    const response = await createTable(tokens.OWNER, { section: 'Ground Floor', seats: 4 });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.name, 'T1');
    assert.equal(response.body.data.section, 'Ground Floor');
    assert.equal(response.body.data.seats, 4);
    assert.equal(response.body.data.displayOrder, 0);
    assert.equal(response.body.data.isActive, true);
  });

  it('refuses a duplicate name, compared case-insensitively', async () => {
    const { tokens } = await seedTeam();
    await createTable(tokens.OWNER, { name: 'T1' });

    const response = await createTable(tokens.OWNER, { name: 't1' });

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'DUPLICATE');
  });

  it('lets two restaurants each have a T1', async () => {
    const a = await seedTeam({ name: 'A' });
    const b = await seedTeam({ name: 'B' });

    assert.equal((await createTable(a.tokens.OWNER)).status, 201);
    assert.equal((await createTable(b.tokens.OWNER)).status, 201);
  });

  it('never leaks nameLower', async () => {
    const { tokens } = await seedTeam();
    const response = await createTable(tokens.OWNER);

    assert.equal('nameLower' in response.body.data, false);
    assert.equal(JSON.stringify(response.body).includes('_id'), false);
  });
});

describe('table permissions', () => {
  it('lets an owner and a manager create, and refuses the other four', async () => {
    const { tokens } = await seedTeam();

    assert.equal((await createTable(tokens.OWNER, { name: 'A1' })).status, 201);
    assert.equal((await createTable(tokens.MANAGER, { name: 'A2' })).status, 201);

    for (const role of [ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN, ROLES.STOREKEEPER]) {
      const response = await createTable(tokens[role], { name: `X-${role}` });
      assert.equal(response.status, 403, `${role} should not create a table`);
      assert.equal(response.body.error.code, 'FORBIDDEN');
    }
  });

  it('lets all six roles read the floor', async () => {
    const { tokens } = await seedTeam();
    await createTable(tokens.OWNER);

    for (const role of Object.keys(tokens)) {
      const response = await request('GET', '/api/v1/tables', { token: tokens[role] });
      assert.equal(response.status, 200, `${role} should read tables`);
      assert.equal(response.body.data.length, 1);
    }
  });

  it('refuses an unauthenticated caller', async () => {
    const response = await request('GET', '/api/v1/tables');
    assert.equal(response.status, 401);
  });
});

describe('tenancy', () => {
  it('answers 404, not 403, for a table in another restaurant', async () => {
    const a = await seedTeam({ name: 'A' });
    const b = await seedTeam({ name: 'B' });

    const id = (await createTable(a.tokens.OWNER)).body.data.id;

    const response = await request('PATCH', `/api/v1/tables/${id}`, {
      token: b.tokens.OWNER,
      body: { seats: 8 },
    });

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'NOT_FOUND');
    assert.equal(JSON.stringify(response.body).includes(id), false);
  });

  it('shows restaurant B none of restaurant A tables', async () => {
    const a = await seedTeam({ name: 'A' });
    const b = await seedTeam({ name: 'B' });

    await createTable(a.tokens.OWNER);

    const response = await request('GET', '/api/v1/tables', { token: b.tokens.OWNER });
    assert.deepEqual(response.body.data, []);
  });
});

describe('listing tables', () => {
  it('reports every table as free when nothing is open', async () => {
    const { tokens } = await seedTeam();
    await createTable(tokens.OWNER);

    const response = await request('GET', '/api/v1/tables', { token: tokens.WAITER });
    const [table] = response.body.data;

    // P19 widened the block, on purpose: the floor state and its figures, null when free.
    // P23 added the upcoming booking.
    assert.deepEqual(table.occupancy, {
      isOccupied: false,
      orderId: null,
      orderNumber: null,
      openedAt: null,
      runningTotalInPaise: null,
      state: 'FREE',
      guestCount: null,
      isLong: false,
      captainName: null,
      itemTotalInPaise: null,
      billId: null,
      billNumber: null,
      billTotalInPaise: null,
      // P23. A confirmed booking soon, or null.
      upcomingReservation: null,
    });
  });

  it('sorts by displayOrder then name', async () => {
    const { tokens } = await seedTeam();
    await createTable(tokens.OWNER, { name: 'Z', displayOrder: 1 });
    await createTable(tokens.OWNER, { name: 'B', displayOrder: 2 });
    await createTable(tokens.OWNER, { name: 'A', displayOrder: 2 });

    const response = await request('GET', '/api/v1/tables', { token: tokens.OWNER });

    assert.deepEqual(
      response.body.data.map((table) => table.name),
      ['Z', 'A', 'B'],
    );
  });

  it('filters by section without treating the value as a pattern', async () => {
    const { tokens } = await seedTeam();
    await createTable(tokens.OWNER, { name: 'T1', section: 'Terrace' });
    await createTable(tokens.OWNER, { name: 'T2', section: 'AC Hall' });

    const matched = await request('GET', '/api/v1/tables?section=Terrace', { token: tokens.OWNER });
    assert.deepEqual(matched.body.data.map((table) => table.name), ['T1']);

    // A regular expression in the query string matches nothing, rather than
    // everything, which is what an unescaped filter would do.
    const injected = await request('GET', '/api/v1/tables?section=.%2A', { token: tokens.OWNER });
    assert.deepEqual(injected.body.data, []);
  });

  it('hides deactivated tables unless asked for them', async () => {
    const { tokens } = await seedTeam();
    const id = (await createTable(tokens.OWNER)).body.data.id;
    await request('PATCH', `/api/v1/tables/${id}/status`, {
      token: tokens.OWNER,
      body: { isActive: false },
    });

    const floor = await request('GET', '/api/v1/tables', { token: tokens.OWNER });
    assert.deepEqual(floor.body.data, []);

    const management = await request('GET', '/api/v1/tables?includeInactive=true', {
      token: tokens.OWNER,
    });
    assert.equal(management.body.data.length, 1);
    assert.equal(management.body.data[0].isActive, false);
  });
});

describe('updating a table', () => {
  it('changes the fields it is given and leaves the rest alone', async () => {
    const { tokens } = await seedTeam();
    const id = (await createTable(tokens.OWNER, { section: 'Terrace', seats: 4 })).body.data.id;

    const response = await request('PATCH', `/api/v1/tables/${id}`, {
      token: tokens.MANAGER,
      body: { seats: 6 },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.seats, 6);
    assert.equal(response.body.data.section, 'Terrace');
  });

  it('refuses isActive, rather than ignoring it', async () => {
    const { tokens } = await seedTeam();
    const id = (await createTable(tokens.OWNER)).body.data.id;

    const response = await request('PATCH', `/api/v1/tables/${id}`, {
      token: tokens.OWNER,
      body: { isActive: false },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_FAILED');
    assert.match(response.body.error.fields.isActive, /own endpoint/);
  });

  it('refuses an empty body', async () => {
    const { tokens } = await seedTeam();
    const id = (await createTable(tokens.OWNER)).body.data.id;

    const response = await request('PATCH', `/api/v1/tables/${id}`, { token: tokens.OWNER, body: {} });
    assert.equal(response.status, 400);
  });
});

describe('deactivating a table', () => {
  it('switches it off and back on', async () => {
    const { tokens } = await seedTeam();
    const id = (await createTable(tokens.OWNER)).body.data.id;

    const off = await request('PATCH', `/api/v1/tables/${id}/status`, {
      token: tokens.OWNER,
      body: { isActive: false },
    });
    assert.equal(off.status, 200);
    assert.equal(off.body.data.isActive, false);

    const on = await request('PATCH', `/api/v1/tables/${id}/status`, {
      token: tokens.OWNER,
      body: { isActive: true },
    });
    assert.equal(on.body.data.isActive, true);
  });
});

describe('editing and deleting a table (2 October 2026)', () => {
  it('edits name, section and seats together, and clears seats with null', async () => {
    const { tokens } = await seedTeam();
    const table = (await createTable(tokens.OWNER, { name: 'T9', section: 'Cafe', seats: 4 })).body.data;
    const edited = await request('PATCH', `/api/v1/tables/${table.id}`, {
      token: tokens.MANAGER,
      body: { name: 'T10', section: 'Terrace', seats: null },
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.name, 'T10');
    assert.equal(edited.body.data.section, 'Terrace');
    assert.equal(edited.body.data.seats, null);
  });

  it('deletes a table no order was ever on, refuses a used one, and refuses a waiter', async () => {
    const { tokens } = await seedTeam();
    const unused = (await createTable(tokens.OWNER, { name: 'Mistake' })).body.data;
    assert.equal((await request('DELETE', `/api/v1/tables/${unused.id}`, { token: tokens.WAITER })).status, 403);
    const deleted = await request('DELETE', `/api/v1/tables/${unused.id}`, { token: tokens.MANAGER });
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body.data, { id: unused.id, deleted: true });
    assert.equal((await request('DELETE', `/api/v1/tables/${unused.id}`, { token: tokens.OWNER })).status, 404);

    const used = (await createTable(tokens.OWNER, { name: 'T1' })).body.data;
    const menu = await request('POST', '/api/v1/categories', { token: tokens.OWNER, body: { name: 'Coffee' } });
    const item = await request('POST', '/api/v1/menu-items', {
      token: tokens.OWNER,
      body: { categoryId: menu.body.data.id, name: 'Latte', priceInPaise: 22000, taxRateBps: 500 },
    });
    const order = await request('POST', '/api/v1/orders', {
      token: tokens.WAITER,
      body: { orderType: 'DINE_IN', tableId: used.id, lines: [{ menuItemId: item.body.data.id, quantity: 1 }] },
    });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    const refused = await request('DELETE', `/api/v1/tables/${used.id}`, { token: tokens.OWNER });
    assert.equal(refused.status, 422);
    assert.match(refused.body.error.message, /orders in its history, so it cannot be deleted\. Turn it off instead/);

    const other = await seedTeam();
    assert.equal((await request('DELETE', `/api/v1/tables/${used.id}`, { token: other.tokens.OWNER })).status, 404);
  });
});
