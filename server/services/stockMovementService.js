/**
 * The ledger, and the two events that write to it automatically: a KOT fire
 * deducting stock, and a cancelled fired line returning it.
 *
 * `recordMovement` is the one function in this project that writes to
 * `stockmovements` and to `ingredients.currentQtyInBase` together, and every
 * other function in this file is a caller of it. Read that one first.
 */
import mongoose from 'mongoose';

import { Ingredient } from '../models/Ingredient.js';
import { MOVEMENT_TYPES, SOURCE_TYPES, StockMovement } from '../models/StockMovement.js';
import { NotFoundError } from '../utils/errors.js';
import { scoped, scopedForAggregate } from '../utils/scopedQuery.js';
import { businessDateRangeToUtc, nowUtc } from '../utils/time.js';
import { resolveRecipe } from './recipeService.js';

/** Mongo's duplicate key error. */
const DUPLICATE_KEY = 11000;

/**
 * Applies one signed quantity change to one ingredient and records it,
 * exactly once, no matter how many times this is called with the same
 * `eventKey`.
 *
 * The order matters and is why this function is not two independent steps a
 * caller could reorder:
 *
 *   1. `$inc` the ingredient FIRST, atomically, and read back the value that
 *      results. This is what makes `resultingQtyInBase` a true point-in-time
 *      snapshot even while other movements are hitting the same ingredient
 *      concurrently -- MongoDB serialises concurrent `$inc`s on one document,
 *      so there is no read-modify-write race here to guard against by hand.
 *
 *   2. THEN try to insert the movement, carrying that value, claiming
 *      `eventKey`. If this is a genuine retry -- the same event reaching here
 *      a second time -- the unique index on `{ restaurantId, eventKey }`
 *      refuses the insert. Because step 1 already ran, that increment is now
 *      wrong and has to be undone: a second, compensating `$inc` of the exact
 *      opposite sign, then the existing movement is read back and returned as
 *      if this call had done nothing, because functionally it did.
 *
 * This is also why the test that matters most for this file calls it twice
 * with the same eventKey and asserts the ingredient moved once, not that the
 * function merely avoided throwing.
 */
export async function recordMovement(
  req,
  { ingredientId, qtyInBase, type, eventKey, sourceType, orderId = null, orderLineId = null, reason = null, at },
  session = null,
) {
  const options = session ? { session } : {};

  const ingredient = await Ingredient.findOneAndUpdate(
    { ...scoped(req), _id: ingredientId },
    { $inc: { currentQtyInBase: qtyInBase } },
    { new: true, ...options },
  );
  if (!ingredient) throw new NotFoundError('Ingredient not found.');

  try {
    const [movement] = await StockMovement.create(
      [
        {
          ...scoped(req),
          ingredientId,
          qtyInBase,
          type,
          eventKey,
          sourceType,
          orderId,
          orderLineId,
          reason,
          resultingQtyInBase: ingredient.currentQtyInBase,
          actorId: req.user.id,
          at,
        },
      ],
      options,
    );
    return { movement, ingredient, wasNew: true };
  } catch (error) {
    if (error?.code !== DUPLICATE_KEY) throw error;

    // The eventKey was already claimed. Undo the increment this call made --
    // it never happened as far as the ledger is concerned -- and hand back
    // what is actually there.
    const reverted = await Ingredient.findOneAndUpdate(
      { ...scoped(req), _id: ingredientId },
      { $inc: { currentQtyInBase: -qtyInBase } },
      { new: true, ...options },
    );

    const existing = await StockMovement.findOne({ ...scoped(req), eventKey }).setOptions(options);
    return { movement: existing, ingredient: reverted, wasNew: false };
  }
}

/**
 * Deducts stock for every line just fired to the kitchen.
 *
 * Called from inside `kitchenService.fireOrder`'s own transaction -- this is
 * the "same transaction that writes the KOT" the spec asks for -- with the
 * lines that were just moved to FIRED. One order line can touch several
 * ingredients; one `DEDUCTION` movement is written per ingredient.
 *
 * A line whose recipe does not resolve deducts nothing and is not an error.
 * Blocking a sale over half-configured inventory is worse than a wrong stock
 * number the storekeeper can see and fix; GET /inventory/unmapped is the
 * honest surface for it, computed live rather than flagged here.
 *
 * `at` is the one instant for the whole batch -- the ticket's own `firedAt`,
 * not read off each line, because the lines passed in are the pre-update
 * in-memory copies from before this fire and do not carry it themselves yet.
 */
export async function deductForFiredLines(req, { lines, orderId, at = nowUtc() }, session = null) {
  for (const line of lines) {
    const recipe = await resolveRecipe(
      req,
      { menuItemId: line.menuItemId, variantId: line.variantId ?? null },
      session,
    );
    if (!recipe) continue;

    for (const item of recipe.items) {
      await recordMovement(
        req,
        {
          ingredientId: item.ingredientId,
          qtyInBase: -(item.qtyInBase * line.quantity),
          type: MOVEMENT_TYPES.DEDUCTION,
          eventKey: `${line._id}:${item.ingredientId}:${MOVEMENT_TYPES.DEDUCTION}`,
          sourceType: SOURCE_TYPES.ORDER_LINE,
          orderId,
          orderLineId: line._id,
          // One shared instant for the whole batch: everything in `lines`
          // just left the shelf on the same fire, the same reason a KOT has
          // one firedAt for the whole ticket rather than one per line.
          at,
        },
        session,
      );
    }
  }
}

/**
 * Returns stock for one cancelled line that was never actually made.
 *
 * Keyed on whether a DEDUCTION movement genuinely exists for this line, not
 * on `wasPrepared` alone: a line cancelled while still PENDING never reached
 * the kitchen and has nothing to return regardless of what any flag says, and
 * the ledger -- not the flag -- is what this reads to decide. One
 * `CANCELLATION_RETURN` is written per ingredient the original deduction
 * touched, by finding those DEDUCTION rows and reversing each one exactly.
 */
export async function returnStockForCancelledLine(req, { orderLineId, orderId }, session = null) {
  const options = session ? { session } : {};

  const deductions = await StockMovement.find({
    ...scoped(req),
    orderLineId,
    type: MOVEMENT_TYPES.DEDUCTION,
  }).setOptions(options);

  const now = nowUtc();

  for (const deduction of deductions) {
    await recordMovement(
      req,
      {
        ingredientId: deduction.ingredientId,
        qtyInBase: -deduction.qtyInBase, // the deduction was negative; the return is its exact opposite
        type: MOVEMENT_TYPES.CANCELLATION_RETURN,
        eventKey: `${orderLineId}:${deduction.ingredientId}:${MOVEMENT_TYPES.CANCELLATION_RETURN}`,
        sourceType: SOURCE_TYPES.ORDER_LINE,
        orderId,
        orderLineId,
        at: now,
      },
      session,
    );
  }
}

/**
 * A manual adjustment: received, wastage, spillage, a recount, a return to a
 * supplier. Its eventKey is a fresh ObjectId every call, on purpose -- a
 * manual entry has no natural repeat-request identity the way firing a KOT
 * line does, so nothing here is meant to be idempotent against a retry. Two
 * taps of "record" from a storekeeper are two real movements.
 */
export async function recordManualMovement(req, { ingredientId, type, qtyInBase, reason }) {
  const { movement, ingredient } = await recordMovement(req, {
    ingredientId,
    qtyInBase,
    type,
    eventKey: `MANUAL:${new mongoose.Types.ObjectId()}`,
    sourceType: SOURCE_TYPES.MANUAL,
    reason,
    at: nowUtc(),
  });
  return { movement, ingredient };
}

/** One ingredient's movements, newest first, for the ledger read. */
export async function listMovements(req, ingredientId, { from, to, page, limit }) {
  const filter = { ...scoped(req), ingredientId };
  if (from || to) {
    filter.at = {};
    if (from) filter.at.$gte = new Date(from);
    if (to) filter.at.$lt = new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000);
  }

  const [movements, total] = await Promise.all([
    StockMovement.find(filter)
      .sort({ at: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    StockMovement.countDocuments(filter),
  ]);
  return { movements, total };
}

/**
 * Quantity consumed per ingredient over a range of business days, deductions
 * net of cancellation returns. This is the read M6's "stock consumed" report
 * aggregates from, the same relationship M3's bill summary has with M6's
 * sales report.
 *
 * "Net of returns" is why this sums `DEDUCTION` and `CANCELLATION_RETURN`
 * together rather than reading `DEDUCTION` alone: a `CANCELLATION_RETURN` is
 * always a positive quantity reversing a specific negative `DEDUCTION`, so the
 * sum is exactly what was actually consumed once every reversal is accounted
 * for, and the sign arithmetic falls out on its own -- no separate case for
 * "this ingredient had a return" is needed.
 */
export async function getConsumption(req, { from, to }) {
  const { start, end } = businessDateRangeToUtc(from, to);

  const rows = await StockMovement.aggregate([
    {
      $match: {
        ...scopedForAggregate(req),
        type: { $in: [MOVEMENT_TYPES.DEDUCTION, MOVEMENT_TYPES.CANCELLATION_RETURN] },
        at: { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: '$ingredientId',
        consumedInBase: { $sum: { $multiply: ['$qtyInBase', -1] } },
      },
    },
    { $match: { consumedInBase: { $ne: 0 } } },
    { $sort: { consumedInBase: -1 } },
  ]);

  const ingredientIds = rows.map((row) => row._id);
  const ingredients = await Ingredient.find({ ...scoped(req), _id: { $in: ingredientIds } }).select(
    'name baseUnit',
  );
  const byId = new Map(ingredients.map((doc) => [String(doc._id), doc]));

  return rows.map((row) => {
    const ingredient = byId.get(String(row._id));
    return {
      ingredientId: String(row._id),
      ingredientName: ingredient?.name ?? null,
      baseUnit: ingredient?.baseUnit ?? null,
      consumedInBase: row.consumedInBase,
    };
  });
}

export default {
  deductForFiredLines,
  getConsumption,
  listMovements,
  recordManualMovement,
  recordMovement,
  returnStockForCancelledLine,
};
