/**
 * The ledger and its idempotency guarantee.
 *
 * These test the service layer directly, the same choice billNumber.test.js
 * made: the guarantee lives in how recordMovement interacts with a unique
 * index and a real ingredient document, not in any HTTP behaviour, so there is
 * no need to route it through a server.
 *
 * The test in the second describe block is the single most important one in
 * M4, per docs/DB-SCHEMA.md section 16: call a deduction twice and prove the
 * stock level moved once, not merely that the second call did not throw.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { Ingredient } from '../models/Ingredient.js';
import { Recipe } from '../models/Recipe.js';
import { StockMovement } from '../models/StockMovement.js';
import {
  deductForFiredLines,
  recordManualMovement,
  recordMovement,
  returnStockForCancelledLine,
} from '../services/stockMovementService.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';

const restaurantId = new mongoose.Types.ObjectId();
const branchId = new mongoose.Types.ObjectId();
const actorId = new mongoose.Types.ObjectId();

const req = { restaurantId, branchId, user: { id: actorId } };

function seedIngredient(overrides = {}) {
  return Ingredient.create({
    restaurantId,
    branchId,
    name: overrides.name ?? 'Paneer',
    baseUnit: overrides.baseUnit ?? 'G',
    currentQtyInBase: overrides.currentQtyInBase ?? 5000,
    unitsPerBase: overrides.unitsPerBase ?? 1000,
    ...overrides,
  });
}

before(async () => {
  await startTestDatabase();
  await StockMovement.init();
});

after(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
});

describe('recordMovement', () => {
  it('applies the signed quantity and snapshots the resulting balance', async () => {
    const ingredient = await seedIngredient({ currentQtyInBase: 5000 });

    const { movement, ingredient: updated } = await recordMovement(req, {
      ingredientId: ingredient._id,
      qtyInBase: -150,
      type: 'DEDUCTION',
      eventKey: 'line1:ing1:DEDUCTION',
      sourceType: 'ORDER_LINE',
      at: new Date(),
    });

    assert.equal(updated.currentQtyInBase, 4850);
    assert.equal(movement.resultingQtyInBase, 4850);
    assert.equal(movement.qtyInBase, -150);
  });

  it('allows stock to go negative, and never blocks', async () => {
    const ingredient = await seedIngredient({ currentQtyInBase: 100 });

    const { ingredient: updated } = await recordMovement(req, {
      ingredientId: ingredient._id,
      qtyInBase: -500,
      type: 'DEDUCTION',
      eventKey: 'line2:ing1:DEDUCTION',
      sourceType: 'ORDER_LINE',
      at: new Date(),
    });

    assert.equal(updated.currentQtyInBase, -400);
  });

  it('THE MOST IMPORTANT TEST: calling it twice with the same eventKey moves stock once', async () => {
    const ingredient = await seedIngredient({ currentQtyInBase: 5000 });
    const call = () =>
      recordMovement(req, {
        ingredientId: ingredient._id,
        qtyInBase: -150,
        type: 'DEDUCTION',
        eventKey: 'retry-line:ing1:DEDUCTION',
        sourceType: 'ORDER_LINE',
        at: new Date(),
      });

    const first = await call();
    const second = await call();

    assert.equal(first.wasNew, true);
    assert.equal(second.wasNew, false, 'the second call recognised the retry');
    assert.equal(first.movement.id, second.movement.id, 'both calls point at the one movement');

    const stored = await Ingredient.findOne({ _id: ingredient._id, restaurantId });
    assert.equal(stored.currentQtyInBase, 4850, 'moved once, not twice');

    const rows = await StockMovement.find({ restaurantId, eventKey: 'retry-line:ing1:DEDUCTION' });
    assert.equal(rows.length, 1, 'exactly one row exists, not two');
  });

  it('is safe under real concurrency, not only when called one after another', async () => {
    const ingredient = await seedIngredient({ currentQtyInBase: 5000 });
    const call = () =>
      recordMovement(req, {
        ingredientId: ingredient._id,
        qtyInBase: -150,
        type: 'DEDUCTION',
        eventKey: 'concurrent-line:ing1:DEDUCTION',
        sourceType: 'ORDER_LINE',
        at: new Date(),
      });

    const results = await Promise.all([call(), call(), call(), call(), call()]);
    const newOnes = results.filter((r) => r.wasNew);
    assert.equal(newOnes.length, 1, 'exactly one of five concurrent callers actually deducted');

    const stored = await Ingredient.findOne({ _id: ingredient._id, restaurantId });
    assert.equal(stored.currentQtyInBase, 4850);
  });
});

describe('deductForFiredLines', () => {
  it('writes one DEDUCTION per ingredient in a multi-ingredient recipe', async () => {
    /**
     * THE REGRESSION TEST for the eventKey bug found while writing this file:
     * the first draft of the spec keyed a movement on the order line and the
     * type alone, with no ingredient in the key, so a recipe touching more
     * than one ingredient would have its second ingredient's insert collide
     * with its first's and be silently treated as a duplicate.
     */
    const paneer = await seedIngredient({ name: 'Paneer', currentQtyInBase: 5000 });
    const oil = await seedIngredient({ name: 'Oil', currentQtyInBase: 2000 });
    const menuItemId = new mongoose.Types.ObjectId();

    await Recipe.create({
      restaurantId,
      branchId,
      menuItemId,
      variantId: null,
      items: [
        { ingredientId: paneer._id, qtyInBase: 150 },
        { ingredientId: oil._id, qtyInBase: 20 },
      ],
    });

    const orderId = new mongoose.Types.ObjectId();
    const line = {
      _id: new mongoose.Types.ObjectId(),
      menuItemId,
      variantId: null,
      quantity: 2,
      firedAt: new Date(),
    };

    await deductForFiredLines(req, { lines: [line], orderId });

    const paneerAfter = await Ingredient.findOne({ _id: paneer._id, restaurantId });
    const oilAfter = await Ingredient.findOne({ _id: oil._id, restaurantId });

    // 150 * 2 quantity = 300 g of paneer; 20 * 2 = 40 g of oil. Both deducted.
    assert.equal(paneerAfter.currentQtyInBase, 5000 - 300);
    assert.equal(oilAfter.currentQtyInBase, 2000 - 40);

    const movements = await StockMovement.find({ restaurantId, orderLineId: line._id });
    assert.equal(movements.length, 2, 'one movement per ingredient, not one shared row');
    assert.deepEqual(
      movements.map((m) => String(m.ingredientId)).sort(),
      [String(oil._id), String(paneer._id)].sort(),
    );
  });

  it('deducts nothing and does not throw when no recipe resolves', async () => {
    const menuItemId = new mongoose.Types.ObjectId();
    const line = {
      _id: new mongoose.Types.ObjectId(),
      menuItemId,
      variantId: null,
      quantity: 1,
      firedAt: new Date(),
    };

    await assert.doesNotReject(() => deductForFiredLines(req, { lines: [line], orderId: new mongoose.Types.ObjectId() }));

    const movements = await StockMovement.find({ restaurantId, orderLineId: line._id });
    assert.equal(movements.length, 0);
  });

  it('falls back to the item-level recipe when the variant has none of its own', async () => {
    const paneer = await seedIngredient({ currentQtyInBase: 5000 });
    const menuItemId = new mongoose.Types.ObjectId();
    const variantId = new mongoose.Types.ObjectId();

    await Recipe.create({
      restaurantId,
      branchId,
      menuItemId,
      variantId: null,
      items: [{ ingredientId: paneer._id, qtyInBase: 150 }],
    });

    const line = {
      _id: new mongoose.Types.ObjectId(),
      menuItemId,
      variantId,
      quantity: 1,
      firedAt: new Date(),
    };

    await deductForFiredLines(req, { lines: [line], orderId: new mongoose.Types.ObjectId() });

    const after = await Ingredient.findOne({ _id: paneer._id, restaurantId });
    assert.equal(after.currentQtyInBase, 5000 - 150, 'the item-level recipe was used');
  });

  it('prefers the exact variant recipe over the item-level one, so a half plate does not over-deduct', async () => {
    const paneer = await seedIngredient({ currentQtyInBase: 5000 });
    const menuItemId = new mongoose.Types.ObjectId();
    const variantId = new mongoose.Types.ObjectId();

    await Recipe.create({
      restaurantId,
      branchId,
      menuItemId,
      variantId: null,
      items: [{ ingredientId: paneer._id, qtyInBase: 300 }], // the full plate
    });
    await Recipe.create({
      restaurantId,
      branchId,
      menuItemId,
      variantId,
      items: [{ ingredientId: paneer._id, qtyInBase: 150 }], // the half plate
    });

    const line = {
      _id: new mongoose.Types.ObjectId(),
      menuItemId,
      variantId,
      quantity: 1,
      firedAt: new Date(),
    };

    await deductForFiredLines(req, { lines: [line], orderId: new mongoose.Types.ObjectId() });

    const after = await Ingredient.findOne({ _id: paneer._id, restaurantId });
    assert.equal(after.currentQtyInBase, 5000 - 150, 'the half plate deducted its own recipe, not the full plate');
  });
});

describe('returnStockForCancelledLine', () => {
  it('reverses every ingredient a deduction touched, exactly', async () => {
    const paneer = await seedIngredient({ name: 'Paneer', currentQtyInBase: 5000 });
    const oil = await seedIngredient({ name: 'Oil', currentQtyInBase: 2000 });
    const menuItemId = new mongoose.Types.ObjectId();
    const orderId = new mongoose.Types.ObjectId();

    await Recipe.create({
      restaurantId,
      branchId,
      menuItemId,
      variantId: null,
      items: [
        { ingredientId: paneer._id, qtyInBase: 150 },
        { ingredientId: oil._id, qtyInBase: 20 },
      ],
    });

    const line = {
      _id: new mongoose.Types.ObjectId(),
      menuItemId,
      variantId: null,
      quantity: 1,
      firedAt: new Date(),
    };
    await deductForFiredLines(req, { lines: [line], orderId });

    await returnStockForCancelledLine(req, { orderLineId: line._id, orderId });

    const paneerAfter = await Ingredient.findOne({ _id: paneer._id, restaurantId });
    const oilAfter = await Ingredient.findOne({ _id: oil._id, restaurantId });
    assert.equal(paneerAfter.currentQtyInBase, 5000, 'back to where it started');
    assert.equal(oilAfter.currentQtyInBase, 2000);

    const returns = await StockMovement.find({
      restaurantId,
      orderLineId: line._id,
      type: 'CANCELLATION_RETURN',
    });
    assert.equal(returns.length, 2);
  });

  it('is a no-op for a line that was never fired, because there is nothing to return', async () => {
    const orderLineId = new mongoose.Types.ObjectId();
    await assert.doesNotReject(() =>
      returnStockForCancelledLine(req, { orderLineId, orderId: new mongoose.Types.ObjectId() }),
    );
    const movements = await StockMovement.find({ restaurantId, orderLineId });
    assert.equal(movements.length, 0);
  });

  it('is itself idempotent: calling it twice does not double the return', async () => {
    const paneer = await seedIngredient({ currentQtyInBase: 5000 });
    const menuItemId = new mongoose.Types.ObjectId();
    const orderId = new mongoose.Types.ObjectId();

    await Recipe.create({
      restaurantId,
      branchId,
      menuItemId,
      variantId: null,
      items: [{ ingredientId: paneer._id, qtyInBase: 150 }],
    });

    const line = { _id: new mongoose.Types.ObjectId(), menuItemId, variantId: null, quantity: 1, firedAt: new Date() };
    await deductForFiredLines(req, { lines: [line], orderId });

    await returnStockForCancelledLine(req, { orderLineId: line._id, orderId });
    await returnStockForCancelledLine(req, { orderLineId: line._id, orderId }); // e.g. a retried undo

    const after = await Ingredient.findOne({ _id: paneer._id, restaurantId });
    assert.equal(after.currentQtyInBase, 5000, 'still exactly back to where it started, not over-returned');
  });
});

describe('the ledger reconciles with the cache', () => {
  it('summing every movement equals the cached currentQtyInBase', async () => {
    /**
     * docs/DB-SCHEMA.md section 14: "There is a test that recomputes every
     * ingredient's quantity by summing its movements and asserts it equals
     * the cached value. If that test ever fails the cache is wrong and the
     * ledger is right."
     */
    const ingredient = await seedIngredient({ currentQtyInBase: 5000 });

    await recordManualMovement(req, {
      ingredientId: ingredient._id,
      type: 'RECEIVED',
      qtyInBase: 2000,
      reason: 'Delivery',
    });
    await recordManualMovement(req, {
      ingredientId: ingredient._id,
      type: 'WASTAGE',
      qtyInBase: -300,
      reason: 'Spoiled',
    });
    await recordMovement(req, {
      ingredientId: ingredient._id,
      qtyInBase: -150,
      type: 'DEDUCTION',
      eventKey: 'reconcile-line:ing1:DEDUCTION',
      sourceType: 'ORDER_LINE',
      at: new Date(),
    });

    const stored = await Ingredient.findOne({ _id: ingredient._id, restaurantId });

    const movements = await StockMovement.find({ restaurantId, ingredientId: ingredient._id });
    const summed = movements.reduce((total, movement) => total + movement.qtyInBase, 5000);

    assert.equal(stored.currentQtyInBase, summed);
    assert.equal(stored.currentQtyInBase, 5000 + 2000 - 300 - 150);
  });
});
