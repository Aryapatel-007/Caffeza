/**
 * Inventory routes: ingredients, recipes, stock movements.
 *
 * STOREKEEPER is the role this module exists for, and it is the first module
 * where that role does real work: receiving, counting and recording wastage.
 * They own movements and can maintain ingredients. They do NOT write recipes
 * -- a recipe changes what every future sale deducts -- and they do not
 * deactivate an ingredient, because that stops deduction silently.
 *
 * Reading the ingredient list is open to all six: a cook who can see paneer
 * is out marks the dish unavailable in M1, which is the loop these two
 * modules close together.
 *
 * Middleware order is docs/CONVENTIONS.md section 8:
 * authenticate, tenant, feature switch, permission, validate, controller.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import {
  getIngredients,
  getInventoryConsumption,
  getMovements,
  patchIngredient,
  patchIngredientActive,
  postIngredient,
  postMovement,
} from '../controllers/ingredientController.js';
import {
  deleteRecipeHandler,
  getRecipes,
  getUnmapped,
  putRecipeHandler,
} from '../controllers/recipeController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  adjustStockSchema,
  consumptionSchema,
  createIngredientSchema,
  deleteRecipeSchema,
  listIngredientsSchema,
  listMovementsSchema,
  listRecipesSchema,
  putRecipeSchema,
  setIngredientActiveSchema,
  unmappedSchema,
  updateIngredientSchema,
} from '../validators/inventoryValidators.js';

const router = Router();

/**
 * Every route here is refused with 403 FEATURE_DISABLED when the restaurant has
 * switched inventory off (P02). Before the role check, so a cook is told the
 * feature is off rather than that their role is not allowed.
 */
const base = [authenticate, tenant, requireFeature('inventory')];

/** OWNER, MANAGER, STOREKEEPER: the people who touch physical stock. */
const stockKeepers = [...base, requireRole(ROLES.OWNER, ROLES.MANAGER, ROLES.STOREKEEPER)];

/** Recipes change what every sale deducts. Back office only. */
const recipeWriters = [...base, requireRole(ROLES.OWNER, ROLES.MANAGER)];

/** Deactivating an ingredient stops deduction silently. Back office only. */
const managers = [...base, requireRole(ROLES.OWNER, ROLES.MANAGER)];

/** Everyone. A cook who sees paneer is out marks the dish unavailable in M1. */
const anySignedIn = [
  ...base,
  requireRole(
    ROLES.OWNER,
    ROLES.MANAGER,
    ROLES.CASHIER,
    ROLES.WAITER,
    ROLES.KITCHEN,
    ROLES.STOREKEEPER,
  ),
];

// ---------------------------------------------------------------------------
// Ingredients
// ---------------------------------------------------------------------------

router.post('/ingredients', ...stockKeepers, validate(createIngredientSchema), postIngredient);
router.get('/ingredients', ...anySignedIn, validate(listIngredientsSchema), getIngredients);
router.patch(
  '/ingredients/:ingredientId',
  ...stockKeepers,
  validate(updateIngredientSchema),
  patchIngredient,
);
router.patch(
  '/ingredients/:ingredientId/active',
  ...managers,
  validate(setIngredientActiveSchema),
  patchIngredientActive,
);

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

router.put('/recipes', ...recipeWriters, validate(putRecipeSchema), putRecipeHandler);
router.get('/recipes', ...stockKeepers, validate(listRecipesSchema), getRecipes);
router.delete('/recipes/:recipeId', ...recipeWriters, validate(deleteRecipeSchema), deleteRecipeHandler);

// ---------------------------------------------------------------------------
// Stock movements
// ---------------------------------------------------------------------------

router.get(
  '/ingredients/:ingredientId/movements',
  ...stockKeepers,
  validate(listMovementsSchema),
  getMovements,
);
router.post(
  '/ingredients/:ingredientId/movements',
  ...stockKeepers,
  validate(adjustStockSchema),
  postMovement,
);

// ---------------------------------------------------------------------------
// Reports. Neither takes a `restaurantId` or personal data in the query
// string -- only a business-date range, matching CONVENTIONS section 3.
// ---------------------------------------------------------------------------

router.get('/inventory/unmapped', ...stockKeepers, validate(unmappedSchema), getUnmapped);
router.get(
  '/inventory/consumption',
  ...managers,
  validate(consumptionSchema),
  getInventoryConsumption,
);

// There is no DELETE on ingredients or the ledger. PATCH .../active is the
// ingredient delete, and a movement is never deleted or edited -- a mistake
// is a new, compensating movement. DELETE /recipes/:id is the one exception
// in the whole project: a recipe is configuration, not a record of something
// that happened.

export default router;
