/**
 * Ingredients: creating, listing, updating and deactivating a raw material.
 *
 * Every business rule an ingredient endpoint needs is in this file, the
 * userPermissionService.js / billPermissionService.js shape. `currentQtyInBase`
 * never appears on the writable side of anything here -- it changes through
 * `stockMovementService.js` and nowhere else, or the ledger stops being the
 * truth.
 */
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { Ingredient } from '../models/Ingredient.js';
import { MOVEMENT_TYPES, StockMovement } from '../models/StockMovement.js';
import {
  BaseUnitImmutableError,
  BusinessRuleError,
  DuplicateError,
  IngredientInUseError,
  NotFoundError,
} from '../utils/errors.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { scoped } from '../utils/scopedQuery.js';
import { recordAudit } from './auditService.js';
import { countRecipesUsingIngredient } from './recipeService.js';
import { getSetting } from './settingsService.js';
import { recordManualMovement } from './stockMovementService.js';

/** Duplicate key on the (restaurantId, branchId, nameLower) unique index. */
const DUPLICATE_KEY = 11000;

/**
 * The three states a stock list shows. Computed on read against the
 * ingredient's own threshold, never stored -- there is no job runner in this
 * project and adding one for this is out of scope.
 *
 * `OUT` includes negative: a shortfall the system caused by allowing negative
 * stock is still an ingredient the kitchen has zero of.
 */
export function stockStateOf(ingredient) {
  if (ingredient.currentQtyInBase <= 0) return 'OUT';
  if (ingredient.currentQtyInBase <= ingredient.lowStockThresholdInBase) return 'LOW';
  return 'IN_STOCK';
}

/** The ingredient as the API describes it, with the derived state filled in. */
export function serialiseIngredient(ingredient) {
  const json = ingredient.toJSON ? ingredient.toJSON() : ingredient;
  json.stockState = stockStateOf(json);
  return json;
}

/**
 * Creates an ingredient. `openingQtyInBase`, when given, writes one RECEIVED
 * movement rather than setting the quantity directly, so the ledger explains
 * the opening balance the same way it explains every later change.
 */
export async function createIngredient(req, body) {
  const { openingQtyInBase, ...fields } = body;

  let ingredient;
  try {
    ingredient = await Ingredient.create({ ...scoped(req), ...fields, currentQtyInBase: 0 });
  } catch (error) {
    if (error?.code === DUPLICATE_KEY) {
      throw new DuplicateError('An ingredient with that name already exists in this branch.');
    }
    throw error;
  }

  if (openingQtyInBase) {
    const { ingredient: updated } = await recordManualMovement(req, {
      ingredientId: ingredient._id,
      type: MOVEMENT_TYPES.RECEIVED,
      qtyInBase: openingQtyInBase,
      reason: 'Opening balance',
    });
    return updated;
  }

  return ingredient;
}

export async function listIngredients(req, { page, limit, search, lowStockOnly, includeInactive }) {
  const filter = { ...scoped(req) };
  if (!includeInactive) filter.isActive = true;
  if (search) {
    filter.nameLower = new RegExp(escapeRegex(search.toLowerCase()));
  }

  const [all, total] = await Promise.all([
    Ingredient.find(filter)
      .sort({ isActive: -1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Ingredient.countDocuments(filter),
  ]);

  const serialised = all.map(serialiseIngredient);

  /**
   * `lowStockAlertsEnabled: false` empties the low-stock read, added by M7.
   *
   * Only the filtered read. The plain list still shows every ingredient with
   * its real quantity, because the setting switches off the surfacing of an
   * alert, not the data behind it. Nothing about the stock itself changes.
   */
  if (lowStockOnly && !(await getSetting(req.restaurantId, 'inventory.lowStockAlertsEnabled', { req }))) {
    return { ingredients: [], total: 0 };
  }

  const rows = lowStockOnly ? serialised.filter((row) => row.stockState !== 'IN_STOCK') : serialised;

  return { ingredients: rows, total };
}

export async function loadIngredientInTenant(req, ingredientId) {
  const ingredient = await Ingredient.findOne({ ...scoped(req), _id: ingredientId });
  if (!ingredient) throw new NotFoundError('Ingredient not found.');
  return ingredient;
}

/**
 * `baseUnit` is refused once any movement exists for this ingredient.
 * Changing it later would reinterpret every historical quantity in the ledger
 * -- 500 g of paneer becoming 500 ml -- with no way to detect that afterwards.
 */
export async function updateIngredient(req, ingredientId, changes) {
  const ingredient = await loadIngredientInTenant(req, ingredientId);

  if (changes.baseUnit !== undefined && changes.baseUnit !== ingredient.baseUnit) {
    const hasMovements = await StockMovement.exists({ ...scoped(req), ingredientId });
    if (hasMovements) throw new BaseUnitImmutableError();
  }

  Object.assign(ingredient, changes);

  try {
    await ingredient.save();
  } catch (error) {
    if (error?.code === DUPLICATE_KEY) {
      throw new DuplicateError('An ingredient with that name already exists in this branch.');
    }
    throw error;
  }

  return ingredient;
}

/**
 * This is the delete. Refused while an active recipe still references the
 * ingredient, because deactivating it would silently stop deducting for
 * every dish that recipe belongs to.
 */
export async function setIngredientActive(req, ingredientId, isActive) {
  const ingredient = await loadIngredientInTenant(req, ingredientId);

  if (isActive === false) {
    const count = await countRecipesUsingIngredient(req, ingredientId);
    if (count > 0) {
      throw new IngredientInUseError(
        `${count} active recipe${count === 1 ? '' : 's'} still use${count === 1 ? 's' : ''} this ingredient.`,
      );
    }
  }

  ingredient.isActive = isActive;
  await ingredient.save();
  return ingredient;
}

/** POST /ingredients/:id/movements. The manual adjustment screen's write. */
/**
 * Which direction each manual type moves stock. API-CONTRACT.md section 18.2:
 * "The sign is applied by the server from the type, so a storekeeper never
 * types a minus sign." The validator already requires `qtyInBase` to be a
 * positive magnitude for every type but RECOUNT, so this only ever flips a
 * positive number negative for the two consuming types; RECOUNT's signed
 * difference passes through exactly as the caller sent it.
 */
const MANUAL_TYPE_SIGN = Object.freeze({
  [MOVEMENT_TYPES.RECEIVED]: 1,
  [MOVEMENT_TYPES.RETURN]: 1,
  [MOVEMENT_TYPES.WASTAGE]: -1,
  [MOVEMENT_TYPES.SPILLAGE]: -1,
  [MOVEMENT_TYPES.RECOUNT]: 1, // the client's own sign is the truth here
});

export async function adjustStock(req, ingredientId, { type, qtyInBase, reason }) {
  await loadIngredientInTenant(req, ingredientId); // 404 before anything else

  if (type === MOVEMENT_TYPES.DEDUCTION || type === MOVEMENT_TYPES.CANCELLATION_RETURN) {
    // The validator already refuses these with 400; this is the belt to its
    // braces in case a future caller reaches this function directly.
    throw new BusinessRuleError('That movement type is written by the system, not requested.');
  }

  const signedQtyInBase = qtyInBase * (MANUAL_TYPE_SIGN[type] ?? 1);

  const { movement, ingredient } = await recordManualMovement(req, {
    ingredientId,
    type,
    qtyInBase: signedQtyInBase,
    reason,
  });

  // BUILD-PLAN section 7: an audit trail on anything that involves stock.
  // Every manual adjustment is who, when, why and how much, the same as a
  // discount or a void in M3.
  await recordAudit(req, {
    action: AUDIT_ACTIONS.STOCK_ADJUSTED,
    entityType: AUDIT_ENTITY_TYPES.STOCK,
    entityId: ingredient._id,
    entityLabel: ingredient.name,
    reason,
    details: { type, qtyInBase },
  });

  return { movement, ingredient: serialiseIngredient(ingredient) };
}

export default {
  adjustStock,
  createIngredient,
  listIngredients,
  loadIngredientInTenant,
  serialiseIngredient,
  setIngredientActive,
  stockStateOf,
  updateIngredient,
};
