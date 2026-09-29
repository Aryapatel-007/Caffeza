/**
 * Request schemas for M4: ingredients, recipes, stock movements.
 *
 * Shapes come from docs/API-CONTRACT.md sections 16 to 18.
 *
 * Every quantity here is an integer in the ingredient's own base unit, never
 * a float, the same rule money follows in paise. The client converts from a
 * purchase unit before it ever reaches this file; `server/utils/units.js` is
 * the only place on the server that would do that conversion, and nothing
 * here does it.
 */
import { z } from 'zod';

import { BASE_UNIT_VALUES } from '../models/Ingredient.js';
import { MANUAL_MOVEMENT_TYPES } from '../models/StockMovement.js';
import { businessDate, nonEmptyString, objectId, paginationQuery, queryBoolean } from './common.js';

const ingredientIdParam = z.object({ ingredientId: objectId });
const recipeIdParam = z.object({ recipeId: objectId });

const MAX_BASE_QTY = 1_000_000_000;

/** A whole number of base units. Never negative on its own -- see qtyInBase below for the RECOUNT exception. */
const nonNegativeBaseQty = z
  .number({ error: 'Must be a whole number.' })
  .int('Must be a whole number in the base unit.')
  .min(0, 'Cannot be negative.')
  .max(MAX_BASE_QTY, 'That is too large to be a real quantity.');

const positiveBaseQty = nonNegativeBaseQty.refine((value) => value > 0, 'Must be more than zero.');

const ingredientName = nonEmptyString.max(80, 'Cannot be longer than 80 characters.');
const purchaseUnitName = z
  .union([z.string().trim().max(20, 'Cannot be longer than 20 characters.'), z.null()])
  .optional();

// ---------------------------------------------------------------------------
// Ingredients
// ---------------------------------------------------------------------------

export const createIngredientSchema = z.object({
  body: z
    .object({
      name: ingredientName,
      baseUnit: z.enum(BASE_UNIT_VALUES, { error: 'Must be G, ML or PIECE.' }),
      purchaseUnitName,
      unitsPerBase: z
        .number({ error: 'Must be a whole number.' })
        .int('Must be a whole number.')
        .min(1, 'Must be 1 or more.')
        .optional(),
      lowStockThresholdInBase: nonNegativeBaseQty.optional(),
      openingQtyInBase: positiveBaseQty.optional(),
    })
    .strict('Is not a field you can set here.'),
});

export const listIngredientsSchema = z.object({
  query: paginationQuery.extend({
    search: z.string().trim().max(60, 'Cannot be longer than 60 characters.').optional(),
    lowStockOnly: queryBoolean,
    includeInactive: queryBoolean,
  }),
});

/**
 * `currentQtyInBase` is refused with 400 always: stock changes through a
 * movement, never by assignment. `baseUnit` is otherwise updatable here; the
 * once-any-movement-exists rule is a business rule checked in the service,
 * because whether it applies depends on the ledger, not on the shape of this
 * request.
 */
export const updateIngredientSchema = z.object({
  params: ingredientIdParam,
  body: z
    .object({
      name: ingredientName.optional(),
      baseUnit: z.enum(BASE_UNIT_VALUES, { error: 'Must be G, ML or PIECE.' }).optional(),
      purchaseUnitName,
      unitsPerBase: z
        .number({ error: 'Must be a whole number.' })
        .int('Must be a whole number.')
        .min(1, 'Must be 1 or more.')
        .optional(),
      lowStockThresholdInBase: nonNegativeBaseQty.optional(),
      currentQtyInBase: z
        .never({ error: 'Stock changes through a movement, never by assignment.' })
        .optional(),
    })
    .strict('Is not a field you can set here.')
    .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change.'),
});

export const setIngredientActiveSchema = z.object({
  params: ingredientIdParam,
  body: z
    .object({ isActive: z.boolean({ error: 'Must be true or false.' }) })
    .strict('Is not a field you can set here.'),
});

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

const recipeItem = z
  .object({
    ingredientId: objectId,
    qtyInBase: positiveBaseQty,
  })
  .strict('Is not a field you can set on a recipe line.');

export const putRecipeSchema = z.object({
  body: z
    .object({
      menuItemId: objectId,
      variantId: z.union([objectId, z.null()]).optional(),
      items: z.array(recipeItem).max(50, 'A recipe cannot have more than 50 ingredients.'),
    })
    .strict('Is not a field you can set here.'),
});

export const listRecipesSchema = z.object({
  query: paginationQuery.extend({
    menuItemId: objectId.optional(),
  }),
});

export const deleteRecipeSchema = z.object({ params: recipeIdParam });

export const unmappedSchema = z.object({
  query: z
    .object({ from: businessDate.optional(), to: businessDate.optional() })
    .refine((q) => Boolean(q.from) === Boolean(q.to), 'Send both from and to, or neither.'),
});

// ---------------------------------------------------------------------------
// Stock movements
// ---------------------------------------------------------------------------

export const listMovementsSchema = z.object({
  params: ingredientIdParam,
  query: paginationQuery.extend({
    from: businessDate.optional(),
    to: businessDate.optional(),
  }),
});

/**
 * `type` is restricted to the manual set at the schema level: DEDUCTION and
 * CANCELLATION_RETURN are refused here with 400 before the request even
 * reaches the service, because those two are written by the fire and cancel
 * paths and by nothing else.
 *
 * `qtyInBase` is a positive integer for every manual type except RECOUNT,
 * where it is the signed difference a physical count found and may be
 * negative -- checked with a refinement because the legal sign depends on
 * `type`, which a plain field validator cannot see.
 */
export const adjustStockSchema = z.object({
  params: ingredientIdParam,
  body: z
    .object({
      type: z.enum(MANUAL_MOVEMENT_TYPES, { error: 'Is not a type you can request directly.' }),
      qtyInBase: z
        .number({ error: 'Must be a whole number.' })
        .int('Must be a whole number in the base unit.')
        .max(MAX_BASE_QTY, 'That is too large to be a real quantity.')
        .min(-MAX_BASE_QTY, 'That is too large to be a real quantity.')
        .refine((value) => value !== 0, 'Cannot be zero -- that is not a movement.'),
      reason: nonEmptyString.max(200, 'Cannot be longer than 200 characters.'),
    })
    .strict('Is not a field you can set here.')
    .refine(
      (body) => body.type === 'RECOUNT' || body.qtyInBase > 0,
      { error: 'Must be a positive number for this type. Only a recount can be negative.', path: ['qtyInBase'] },
    ),
});

export const consumptionSchema = z.object({
  query: z.object({ from: businessDate, to: businessDate }),
});
