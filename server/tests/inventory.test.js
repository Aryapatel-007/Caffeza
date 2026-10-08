/**
 * M4 endpoint tests: ingredients, recipes, stock movements, and the two
 * reports.
 *
 * Three describe blocks matter most and are marked in their names: the
 * end-to-end fire-then-deduct-then-cancel-then-return path, which is the
 * whole reason this module exists; the multi-ingredient idempotency
 * regression (stockMovements.test.js already covers the service directly,
 * this covers it through the real fire endpoint); and negative stock never
 * blocking a sale.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ROLES } from '../config/roles.js';
import { AuditLog } from '../models/AuditLog.js';
import { Ingredient } from '../models/Ingredient.js';
import { StockMovement } from '../models/StockMovement.js';
import {
  createMenuItem,
  fireOrder,
  openOrder,
  readOrder,
  seedFloor,
  seedTeam,
} from './helpers/m2Fixtures.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));

const createIngredient = (token, body = {}) =>
  request('POST', '/api/v1/ingredients', {
    token,
    body: { name: 'Paneer', baseUnit: 'G', unitsPerBase: 1000, purchaseUnitName: 'kg', ...body },
  });

const listIngredients = (token, query = '') =>
  request('GET', `/api/v1/ingredients${query}`, { token });

const patchIngredient = (token, ingredientId, body) =>
  request('PATCH', `/api/v1/ingredients/${ingredientId}`, { token, body });

const setIngredientActive = (token, ingredientId, isActive) =>
  request('PATCH', `/api/v1/ingredients/${ingredientId}/active`, { token, body: { isActive } });

const putRecipe = (token, body) => request('PUT', '/api/v1/recipes', { token, body });

const listRecipes = (token, query = '') => request('GET', `/api/v1/recipes${query}`, { token });

const deleteRecipe = (token, recipeId) =>
  request('DELETE', `/api/v1/recipes/${recipeId}`, { token });

const postMovement = (token, ingredientId, body) =>
  request('POST', `/api/v1/ingredients/${ingredientId}/movements`, { token, body });

const listMovements = (token, ingredientId, query = '') =>
  request('GET', `/api/v1/ingredients/${ingredientId}/movements${query}`, { token });

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

describe('creating an ingredient', () => {
  it('creates one with the given base unit and starts it at zero stock', async () => {
    const { tokens } = await seedTeam();
    const response = await createIngredient(tokens.OWNER, { name: 'Paneer' });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.baseUnit, 'G');
    assert.equal(response.body.data.currentQtyInBase, 0);
    assert.equal(response.body.data.stockState, 'OUT', '0 <= threshold(0) is OUT, not IN_STOCK');
  });

  it('records an opening quantity as one RECEIVED movement, not a direct assignment', async () => {
    const { tokens } = await seedTeam();
    const response = await createIngredient(tokens.OWNER, { openingQtyInBase: 5000 });

    assert.equal(response.body.data.currentQtyInBase, 5000);

    const movements = await StockMovement.find({
      restaurantId: response.body.data.restaurantId,
    });
    assert.equal(movements.length, 1);
    assert.equal(movements[0].type, 'RECEIVED');
    assert.equal(movements[0].qtyInBase, 5000);
  });

  it('lets owner, manager and storekeeper create; refuses the other three', async () => {
    const { tokens } = await seedTeam();
    for (const role of [ROLES.OWNER, ROLES.MANAGER, ROLES.STOREKEEPER]) {
      const response = await createIngredient(tokens[role], { name: `Paneer ${role}` });
      assert.equal(response.status, 201, `${role} should be allowed`);
    }
    for (const role of [ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN]) {
      const response = await createIngredient(tokens[role], { name: `Nope ${role}` });
      assert.equal(response.status, 403, `${role} should be refused`);
    }
  });

  it('refuses a duplicate name in the branch, compared case-insensitively', async () => {
    const { tokens } = await seedTeam();
    await createIngredient(tokens.OWNER, { name: 'Paneer' });
    const response = await createIngredient(tokens.OWNER, { name: 'PANEER' });
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'DUPLICATE');
  });

  it('refuses a baseUnit that is not G, ML or PIECE', async () => {
    const { tokens } = await seedTeam();
    const response = await createIngredient(tokens.OWNER, { baseUnit: 'KG' });
    assert.equal(response.status, 400);
  });
});

describe('listing ingredients', () => {
  it('is open to all six roles', async () => {
    const { tokens } = await seedTeam();
    await createIngredient(tokens.OWNER, { name: 'Paneer' });

    for (const role of Object.values(ROLES)) {
      const response = await listIngredients(tokens[role]);
      assert.equal(response.status, 200, `${role} should be able to read the stock list`);
    }
  });

  it('computes stockState from the threshold, one definition for every row', async () => {
    const { tokens } = await seedTeam();
    // openingQtyInBase is a positive quantity by design (0 is not a
    // meaningful "movement"), and 0 is already the default for a fresh
    // ingredient, so this one is created with none at all.
    const out = (await createIngredient(tokens.OWNER, { name: 'Out' })).body.data;
    const low = (
      await createIngredient(tokens.OWNER, {
        name: 'Low',
        lowStockThresholdInBase: 2000,
        openingQtyInBase: 1500,
      })
    ).body.data;
    const inStock = (
      await createIngredient(tokens.OWNER, {
        name: 'InStock',
        lowStockThresholdInBase: 500,
        openingQtyInBase: 5000,
      })
    ).body.data;

    const response = await listIngredients(tokens.OWNER);
    const byId = Object.fromEntries(response.body.data.map((row) => [row.id, row]));

    assert.equal(byId[out.id].stockState, 'OUT');
    assert.equal(byId[low.id].stockState, 'LOW');
    assert.equal(byId[inStock.id].stockState, 'IN_STOCK');
  });

  it('lowStockOnly excludes IN_STOCK rows', async () => {
    const { tokens } = await seedTeam();
    await createIngredient(tokens.OWNER, {
      name: 'Low',
      lowStockThresholdInBase: 2000,
      openingQtyInBase: 1500,
    });
    await createIngredient(tokens.OWNER, {
      name: 'Fine',
      lowStockThresholdInBase: 500,
      openingQtyInBase: 5000,
    });

    const response = await listIngredients(tokens.OWNER, '?lowStockOnly=true');
    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].name, 'Low');
  });

  it('escapes search input rather than treating it as a pattern', async () => {
    const { tokens } = await seedTeam();
    await createIngredient(tokens.OWNER, { name: 'Paneer' });

    const response = await listIngredients(tokens.OWNER, '?search=' + encodeURIComponent('.*'));
    assert.deepEqual(response.body.data, []);
  });

  it('hides deactivated ingredients unless asked for them', async () => {
    const { tokens } = await seedTeam();
    const ingredient = (await createIngredient(tokens.OWNER, { name: 'Old Stock' })).body.data;
    await setIngredientActive(tokens.OWNER, ingredient.id, false);

    const hidden = await listIngredients(tokens.OWNER);
    assert.deepEqual(hidden.body.data, []);

    const shown = await listIngredients(tokens.OWNER, '?includeInactive=true');
    assert.equal(shown.body.data.length, 1);
  });
});

describe('updating an ingredient', () => {
  it('refuses currentQtyInBase, rather than silently ignoring it', async () => {
    const { tokens } = await seedTeam();
    const ingredient = (await createIngredient(tokens.OWNER, { openingQtyInBase: 100 })).body.data;

    const response = await patchIngredient(tokens.OWNER, ingredient.id, { currentQtyInBase: 99999 });
    assert.equal(response.status, 400);

    const stored = await Ingredient.findOne({ _id: ingredient.id, restaurantId: ingredient.restaurantId });
    assert.equal(stored.currentQtyInBase, 100, 'unchanged: stock only moves through a movement');
  });

  it('allows baseUnit while no movement exists, and refuses it once one does', async () => {
    const { tokens } = await seedTeam();
    const freshlyMade = (await createIngredient(tokens.OWNER, { name: 'Fresh' })).body.data;

    const beforeAnyMovement = await patchIngredient(tokens.OWNER, freshlyMade.id, { baseUnit: 'ML' });
    assert.equal(beforeAnyMovement.status, 200);

    const used = (await createIngredient(tokens.OWNER, { name: 'Used', openingQtyInBase: 10 })).body
      .data;
    const afterAMovement = await patchIngredient(tokens.OWNER, used.id, { baseUnit: 'ML' });
    assert.equal(afterAMovement.status, 422);
    assert.equal(afterAMovement.body.error.code, 'BASE_UNIT_IMMUTABLE');
  });
});

describe('deactivating an ingredient', () => {
  it('is the delete, and is refused while an active recipe still uses it', async () => {
    const { tokens } = await seedTeam();
    const item = (await createMenuItem(tokens.OWNER)).body.data;
    const paneer = (await createIngredient(tokens.OWNER, { name: 'Paneer' })).body.data;

    await putRecipe(tokens.OWNER, {
      menuItemId: item.id,
      items: [{ ingredientId: paneer.id, qtyInBase: 150 }],
    });

    const blocked = await setIngredientActive(tokens.OWNER, paneer.id, false);
    assert.equal(blocked.status, 422);
    assert.equal(blocked.body.error.code, 'INGREDIENT_IN_USE');

    await deleteRecipe(tokens.OWNER, (await listRecipes(tokens.OWNER)).body.data[0].id);
    const allowed = await setIngredientActive(tokens.OWNER, paneer.id, false);
    assert.equal(allowed.status, 200);
  });
});

describe('recipes', () => {
  it('PUT is idempotent: the same body twice leaves one recipe, not two', async () => {
    const { tokens } = await seedTeam();
    const item = (await createMenuItem(tokens.OWNER)).body.data;
    const paneer = (await createIngredient(tokens.OWNER, { name: 'Paneer' })).body.data;
    const body = { menuItemId: item.id, items: [{ ingredientId: paneer.id, qtyInBase: 150 }] };

    const first = await putRecipe(tokens.OWNER, body);
    assert.equal(first.status, 201);
    const second = await putRecipe(tokens.OWNER, body);
    assert.equal(second.status, 200);
    assert.equal(second.body.data.id, first.body.data.id);

    const listed = await listRecipes(tokens.OWNER);
    assert.equal(listed.body.data.length, 1);
  });

  it('refuses the same ingredient listed twice in one recipe', async () => {
    const { tokens } = await seedTeam();
    const item = (await createMenuItem(tokens.OWNER)).body.data;
    const paneer = (await createIngredient(tokens.OWNER, { name: 'Paneer' })).body.data;

    const response = await putRecipe(tokens.OWNER, {
      menuItemId: item.id,
      items: [
        { ingredientId: paneer.id, qtyInBase: 150 },
        { ingredientId: paneer.id, qtyInBase: 50 },
      ],
    });
    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'DUPLICATE_RECIPE_INGREDIENT');
  });

  it('refuses an inactive ingredient', async () => {
    const { tokens } = await seedTeam();
    const item = (await createMenuItem(tokens.OWNER)).body.data;
    const paneer = (await createIngredient(tokens.OWNER, { name: 'Paneer' })).body.data;
    await setIngredientActive(tokens.OWNER, paneer.id, false);

    const response = await putRecipe(tokens.OWNER, {
      menuItemId: item.id,
      items: [{ ingredientId: paneer.id, qtyInBase: 150 }],
    });
    assert.equal(response.status, 422);
  });

  it('answers 404 for a menu item, variant or ingredient in another restaurant', async () => {
    const a = await seedTeam({ name: 'Restaurant A' });
    const b = await seedTeam({ name: 'Restaurant B' });
    const itemB = (await createMenuItem(b.tokens.OWNER)).body.data;
    const paneerB = (await createIngredient(b.tokens.OWNER, { name: 'Paneer' })).body.data;

    const response = await putRecipe(a.tokens.OWNER, {
      menuItemId: itemB.id,
      items: [{ ingredientId: paneerB.id, qtyInBase: 150 }],
    });
    assert.equal(response.status, 404);
  });

  it('is refused to everyone but owner and manager', async () => {
    const { tokens } = await seedTeam();
    const item = (await createMenuItem(tokens.OWNER)).body.data;

    for (const role of [ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN, ROLES.STOREKEEPER]) {
      const response = await putRecipe(tokens[role], { menuItemId: item.id, items: [] });
      assert.equal(response.status, 403, `${role} should not write a recipe`);
    }
  });

  it('DELETE removes it: the one hard delete in the project', async () => {
    const { tokens } = await seedTeam();
    const item = (await createMenuItem(tokens.OWNER)).body.data;
    const paneer = (await createIngredient(tokens.OWNER, { name: 'Paneer' })).body.data;
    await putRecipe(tokens.OWNER, {
      menuItemId: item.id,
      items: [{ ingredientId: paneer.id, qtyInBase: 150 }],
    });
    const recipeId = (await listRecipes(tokens.OWNER)).body.data[0].id;

    const response = await deleteRecipe(tokens.OWNER, recipeId);
    assert.equal(response.status, 200);

    const remaining = await listRecipes(tokens.OWNER);
    assert.equal(remaining.body.data.length, 0);
  });
});

describe('stock movements: manual adjustments', () => {
  it('WASTAGE, SPILLAGE and RETURN are subtracted; RECEIVED is added', async () => {
    const { tokens } = await seedTeam();
    const ingredient = (await createIngredient(tokens.OWNER, { openingQtyInBase: 5000 })).body.data;

    const wastage = await postMovement(tokens.STOREKEEPER, ingredient.id, {
      type: 'WASTAGE',
      qtyInBase: 300,
      reason: 'Spoiled overnight',
    });
    assert.equal(wastage.status, 201);
    assert.equal(wastage.body.data.ingredient.currentQtyInBase, 5000 - 300);
  });

  it('RECOUNT accepts a signed difference; every other type must be positive', async () => {
    const { tokens } = await seedTeam();
    const ingredient = (await createIngredient(tokens.OWNER, { openingQtyInBase: 5000 })).body.data;

    const recount = await postMovement(tokens.STOREKEEPER, ingredient.id, {
      type: 'RECOUNT',
      qtyInBase: -200,
      reason: 'Physical count was lower',
    });
    assert.equal(recount.status, 201);
    assert.equal(recount.body.data.ingredient.currentQtyInBase, 4800);

    const negativeWastage = await postMovement(tokens.STOREKEEPER, ingredient.id, {
      type: 'WASTAGE',
      qtyInBase: -50,
      reason: 'Should be refused',
    });
    assert.equal(negativeWastage.status, 400);
  });

  it('refuses DEDUCTION and CANCELLATION_RETURN: those are system-written only', async () => {
    const { tokens } = await seedTeam();
    const ingredient = (await createIngredient(tokens.OWNER, { openingQtyInBase: 5000 })).body.data;

    for (const type of ['DEDUCTION', 'CANCELLATION_RETURN']) {
      const response = await postMovement(tokens.STOREKEEPER, ingredient.id, {
        type,
        qtyInBase: 100,
        reason: 'Should be refused',
      });
      assert.equal(response.status, 400, `${type} should be refused from the API`);
    }
  });

  it('requires a reason on every manual movement', async () => {
    const { tokens } = await seedTeam();
    const ingredient = (await createIngredient(tokens.OWNER, { openingQtyInBase: 5000 })).body.data;

    const response = await postMovement(tokens.STOREKEEPER, ingredient.id, {
      type: 'WASTAGE',
      qtyInBase: 100,
    });
    assert.equal(response.status, 400);
  });

  it('writes an audit row with who, why and how much', async () => {
    const { tokens } = await seedTeam();
    const ingredient = (await createIngredient(tokens.OWNER, { openingQtyInBase: 5000 })).body.data;

    await postMovement(tokens.STOREKEEPER, ingredient.id, {
      type: 'WASTAGE',
      qtyInBase: 300,
      reason: 'Spoiled overnight',
    });

    const entries = await AuditLog.find({ restaurantId: ingredient.restaurantId, action: 'STOCK_ADJUSTED' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].reason, 'Spoiled overnight');
    assert.equal(entries[0].entityLabel, ingredient.name);
  });

  it('is refused to everyone but owner, manager and storekeeper', async () => {
    const { tokens } = await seedTeam();
    const ingredient = (await createIngredient(tokens.OWNER, { openingQtyInBase: 5000 })).body.data;

    for (const role of [ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN]) {
      const response = await postMovement(tokens[role], ingredient.id, {
        type: 'WASTAGE',
        qtyInBase: 100,
        reason: 'Should be refused',
      });
      assert.equal(response.status, 403, `${role} should not adjust stock`);
    }
  });

  it('the ledger reads back newest first, with a running balance on each row', async () => {
    const { tokens } = await seedTeam();
    const ingredient = (await createIngredient(tokens.OWNER, { openingQtyInBase: 1000 })).body.data;

    await postMovement(tokens.STOREKEEPER, ingredient.id, {
      type: 'RECEIVED',
      qtyInBase: 500,
      reason: 'Top-up',
    });
    await postMovement(tokens.STOREKEEPER, ingredient.id, {
      type: 'WASTAGE',
      qtyInBase: 200,
      reason: 'Dropped',
    });

    const response = await listMovements(tokens.OWNER, ingredient.id);
    assert.equal(response.body.data.length, 3, 'the opening RECEIVED plus the two just made');
    assert.equal(response.body.data[0].type, 'WASTAGE', 'newest first');
    assert.equal(response.body.data[0].resultingQtyInBase, 1300);
  });
});

describe('END TO END: fire deducts stock, cancel-before-made returns it', () => {
  it('fires a line, deducts, cancels it unmade, and returns exactly what was taken', async () => {
    const floor = await seedFloor();
    const { tokens, table, item } = floor;

    const paneer = (await createIngredient(tokens.OWNER, { name: 'Paneer', openingQtyInBase: 5000 }))
      .body.data;
    const oil = (await createIngredient(tokens.OWNER, { name: 'Oil', openingQtyInBase: 2000 })).body
      .data;
    await putRecipe(tokens.OWNER, {
      menuItemId: item.id,
      items: [
        { ingredientId: paneer.id, qtyInBase: 150 },
        { ingredientId: oil.id, qtyInBase: 20 },
      ],
    });

    const opened = (
      await openOrder(tokens.WAITER, { tableId: table.id, lines: [{ menuItemId: item.id, quantity: 2 }] })
    ).body.data;

    // Firing is the moment stock leaves the shelf.
    await fireOrder(tokens.WAITER, opened.id, opened.version);

    const afterFire = await listIngredients(tokens.OWNER);
    const byName = Object.fromEntries(afterFire.body.data.map((row) => [row.name, row]));
    assert.equal(byName.Paneer.currentQtyInBase, 5000 - 150 * 2);
    assert.equal(byName.Oil.currentQtyInBase, 2000 - 20 * 2);

    // Now cancel it, answering "no, it was never made".
    const current = (await readOrder(tokens.WAITER, opened.id)).body.data;
    const cancelResponse = await request(
      'POST',
      `/api/v1/orders/${opened.id}/lines/${current.lines[0].id}/cancel`,
      {
        token: tokens.MANAGER,
        body: { version: current.version, reasonCode: 'OTHER', note: 'Kitchen ran out mid-cook', wasPrepared: false },
      },
    );
    assert.equal(cancelResponse.status, 200);

    const afterReturn = await listIngredients(tokens.OWNER);
    const byNameAfter = Object.fromEntries(afterReturn.body.data.map((row) => [row.name, row]));
    assert.equal(byNameAfter.Paneer.currentQtyInBase, 5000, 'exactly back to where it started');
    assert.equal(byNameAfter.Oil.currentQtyInBase, 2000);
  });

  it('wasPrepared: true leaves the deduction standing -- the food was made and eaten', async () => {
    const floor = await seedFloor();
    const { tokens, table, item } = floor;
    const paneer = (await createIngredient(tokens.OWNER, { name: 'Paneer', openingQtyInBase: 5000 }))
      .body.data;
    await putRecipe(tokens.OWNER, {
      menuItemId: item.id,
      items: [{ ingredientId: paneer.id, qtyInBase: 150 }],
    });

    const opened = (
      await openOrder(tokens.WAITER, { tableId: table.id, lines: [{ menuItemId: item.id, quantity: 1 }] })
    ).body.data;
    await fireOrder(tokens.WAITER, opened.id, opened.version);

    const current = (await readOrder(tokens.WAITER, opened.id)).body.data;
    await request('POST', `/api/v1/orders/${opened.id}/lines/${current.lines[0].id}/cancel`, {
      token: tokens.MANAGER,
      body: { version: current.version, reasonCode: 'OTHER', note: 'Walked out', wasPrepared: true },
    });

    const after = await listIngredients(tokens.OWNER);
    const paneerAfter = after.body.data.find((row) => row.id === paneer.id);
    assert.equal(paneerAfter.currentQtyInBase, 5000 - 150, 'the deduction stands');
  });

  it('a line cancelled while still PENDING deducted nothing and returns nothing', async () => {
    const floor = await seedFloor();
    const { tokens, table, item } = floor;
    const paneer = (await createIngredient(tokens.OWNER, { name: 'Paneer', openingQtyInBase: 5000 }))
      .body.data;
    await putRecipe(tokens.OWNER, {
      menuItemId: item.id,
      items: [{ ingredientId: paneer.id, qtyInBase: 150 }],
    });

    const opened = (
      await openOrder(tokens.WAITER, { tableId: table.id, lines: [{ menuItemId: item.id, quantity: 1 }] })
    ).body.data;

    // Never fired.
    await request('POST', `/api/v1/orders/${opened.id}/lines/${opened.lines[0].id}/cancel`, {
      token: tokens.WAITER,
      body: { version: opened.version, reasonCode: 'OTHER', note: 'Changed their mind' },
    });

    const after = await listIngredients(tokens.OWNER);
    const paneerAfter = after.body.data.find((row) => row.id === paneer.id);
    assert.equal(paneerAfter.currentQtyInBase, 5000, 'untouched: nothing was ever deducted');
  });

  it('a missing recipe deducts nothing and the sale still succeeds', async () => {
    const floor = await seedFloor();
    const { tokens, table, item } = floor; // no recipe attached at all

    const opened = (
      await openOrder(tokens.WAITER, { tableId: table.id, lines: [{ menuItemId: item.id, quantity: 3 }] })
    ).body.data;

    const fired = await fireOrder(tokens.WAITER, opened.id, opened.version);
    assert.equal(fired.status, 200, 'firing succeeds even with no recipe configured');
  });

  it('negative stock is allowed and never blocks a fire', async () => {
    const floor = await seedFloor();
    const { tokens, table, item } = floor;
    const paneer = (await createIngredient(tokens.OWNER, { name: 'Paneer', openingQtyInBase: 100 }))
      .body.data;
    await putRecipe(tokens.OWNER, {
      menuItemId: item.id,
      items: [{ ingredientId: paneer.id, qtyInBase: 150 }], // more than is in stock
    });

    const opened = (
      await openOrder(tokens.WAITER, { tableId: table.id, lines: [{ menuItemId: item.id, quantity: 1 }] })
    ).body.data;

    const fired = await fireOrder(tokens.WAITER, opened.id, opened.version);
    assert.equal(fired.status, 200, 'the kitchen cooked it whether or not the system agreed there was enough');

    const after = await listIngredients(tokens.OWNER);
    const paneerAfter = after.body.data.find((row) => row.id === paneer.id);
    assert.equal(paneerAfter.currentQtyInBase, -50);
    assert.equal(paneerAfter.stockState, 'OUT');
  });

  it('a half plate uses its own recipe and does not over-deduct against the full plate', async () => {
    const floor = await seedFloor();
    const { tokens, table } = floor;
    const paneer = (await createIngredient(tokens.OWNER, { name: 'Paneer', openingQtyInBase: 5000 }))
      .body.data;

    // A different name from seedFloor's own default item, or this collides
    // with it on the case-insensitive unique name index.
    const itemResponse = await createMenuItem(tokens.OWNER, {
      name: 'Paneer Tikka Half-Full',
      variants: [
        { name: 'Half', priceInPaise: 14000 },
        { name: 'Full', priceInPaise: 24000 },
      ],
    });
    assert.equal(itemResponse.status, 201, JSON.stringify(itemResponse.body));
    const item = itemResponse.body.data;
    const half = item.variants.find((v) => v.name === 'Half');

    await putRecipe(tokens.OWNER, {
      menuItemId: item.id,
      items: [{ ingredientId: paneer.id, qtyInBase: 300 }],
    }); // full plate / item level
    await putRecipe(tokens.OWNER, {
      menuItemId: item.id,
      variantId: half.id,
      items: [{ ingredientId: paneer.id, qtyInBase: 150 }],
    }); // half plate

    const opened = (
      await openOrder(tokens.WAITER, {
        tableId: table.id,
        lines: [{ menuItemId: item.id, variantId: half.id, quantity: 1 }],
      })
    ).body.data;
    await fireOrder(tokens.WAITER, opened.id, opened.version);

    const after = await listIngredients(tokens.OWNER);
    const paneerAfter = after.body.data.find((row) => row.id === paneer.id);
    assert.equal(paneerAfter.currentQtyInBase, 5000 - 150, 'the half plate, not the full plate, was deducted');
  });
});

describe('GET /inventory/unmapped', () => {
  it('lists a dish that fired with no resolvable recipe, and drops it once one is added', async () => {
    const floor = await seedFloor();
    const { tokens, table, item } = floor;

    const opened = (
      await openOrder(tokens.WAITER, { tableId: table.id, lines: [{ menuItemId: item.id, quantity: 1 }] })
    ).body.data;
    await fireOrder(tokens.WAITER, opened.id, opened.version);

    const before = await request('GET', '/api/v1/inventory/unmapped', { token: tokens.OWNER });
    assert.equal(before.body.data.length, 1);
    assert.equal(before.body.data[0].itemName, item.name);
    assert.equal(before.body.data[0].fireCount, 1);

    const paneer = (await createIngredient(tokens.OWNER, { name: 'Paneer' })).body.data;
    await putRecipe(tokens.OWNER, {
      menuItemId: item.id,
      items: [{ ingredientId: paneer.id, qtyInBase: 150 }],
    });

    const after = await request('GET', '/api/v1/inventory/unmapped', { token: tokens.OWNER });
    assert.equal(after.body.data.length, 0, 'fixing the recipe removes it from the list');
  });
});

describe('the tenant guard escape hatch, after M4', () => {
  it('adds no new use', () => {
    const files = readdirSync(SERVER_DIR, { recursive: true, encoding: 'utf8' })
      .map((name) => name.split(sep).join('/'))
      .filter(
        (name) =>
          name.endsWith('.js') &&
          !name.includes('node_modules') &&
          !name.startsWith('tests/') &&
          name !== 'models/plugins/tenantGuard.js',
      );

    const counts = {};
    for (const name of files) {
      const contents = readFileSync(join(SERVER_DIR, name), 'utf8');
      const uses = contents.match(/skipTenantGuard/g)?.length ?? 0;
      if (uses > 0) counts[name] = uses;
    }

    assert.deepEqual(counts, {
      'services/authService.js': 3,
      // P23. Finding a public page's branch by its address, before any tenant is known.
      'services/publicSiteService.js': 1,
      // P25 Part G. A webhook's connection by its key's hash, and the job runner's claim.
      'services/integrations/jobRunner.js': 1,
      'services/integrations/webhookService.js': 1,
      'services/integrations/tally/bridgeService.js': 1,
      'services/tokenService.js': 1,
    });
  });

  it('answers 404, not 403, for an ingredient in another restaurant', async () => {
    const a = await seedTeam({ name: 'Restaurant A' });
    const b = await seedTeam({ name: 'Restaurant B' });
    const ingredientB = (await createIngredient(b.tokens.OWNER, { name: 'Paneer' })).body.data;

    const response = await patchIngredient(a.tokens.OWNER, ingredientB.id, { name: 'Renamed' });
    assert.equal(response.status, 404);
  });

  it('shows restaurant B none of restaurant A ingredients', async () => {
    await createIngredient((await seedTeam({ name: 'Restaurant A' })).tokens.OWNER, { name: 'Paneer' });
    const b = await seedTeam({ name: 'Restaurant B' });

    const response = await listIngredients(b.tokens.OWNER);
    assert.deepEqual(response.body.data, []);
  });

  it('refuses an unauthenticated caller', async () => {
    const response = await listIngredients(undefined);
    assert.equal(response.status, 401);
  });
});

describe('GET /inventory/consumption', () => {
  it('nets DEDUCTION against CANCELLATION_RETURN', async () => {
    const floor = await seedFloor();
    const { tokens, table, item } = floor;
    const paneer = (await createIngredient(tokens.OWNER, { name: 'Paneer', openingQtyInBase: 5000 }))
      .body.data;
    await putRecipe(tokens.OWNER, {
      menuItemId: item.id,
      items: [{ ingredientId: paneer.id, qtyInBase: 150 }],
    });

    const opened = (
      await openOrder(tokens.WAITER, { tableId: table.id, lines: [{ menuItemId: item.id, quantity: 2 }] })
    ).body.data;
    await fireOrder(tokens.WAITER, opened.id, opened.version);
    const current = (await readOrder(tokens.WAITER, opened.id)).body.data;
    // One of the two lines... actually quantity 2 is one line with quantity 2.
    // Cancel it unmade to create a CANCELLATION_RETURN and prove netting.
    await request('POST', `/api/v1/orders/${opened.id}/lines/${current.lines[0].id}/cancel`, {
      token: tokens.MANAGER,
      body: { version: current.version, reasonCode: 'OTHER', note: 'Kitchen ran out', wasPrepared: false },
    });

    const today = new Date().toISOString().slice(0, 10);
    const response = await request(
      'GET',
      `/api/v1/inventory/consumption?from=${today}&to=${today}`,
      { token: tokens.OWNER },
    );

    // Deducted 300 (150 * 2), then all of it returned: net consumption is 0,
    // so the ingredient should not appear at all.
    const row = response.body.data.find((r) => r.ingredientId === paneer.id);
    assert.equal(row, undefined, 'net zero consumption does not appear');
  });

  it('is refused to a storekeeper: this one report is owner/manager only', async () => {
    const { tokens } = await seedTeam();
    const today = new Date().toISOString().slice(0, 10);
    const response = await request(
      'GET',
      `/api/v1/inventory/consumption?from=${today}&to=${today}`,
      { token: tokens.STOREKEEPER },
    );
    assert.equal(response.status, 403);
  });
});
