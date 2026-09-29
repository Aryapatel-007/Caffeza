/**
 * Recipes: the join between M1's menu and M4's stock.
 *
 * The one thing every caller of `resolveRecipe` needs to understand is the
 * fallback order, because getting it backwards over-deducts a half plate
 * against a full plate's recipe. See the function itself.
 */
import { Ingredient } from '../models/Ingredient.js';
import { MenuItem } from '../models/MenuItem.js';
import { Order } from '../models/Order.js';
import { Recipe } from '../models/Recipe.js';
import { BusinessRuleError, DuplicateRecipeIngredientError, NotFoundError } from '../utils/errors.js';
import { businessDateRangeToUtc } from '../utils/time.js';
import { scoped } from '../utils/scopedQuery.js';

/**
 * Finds the recipe that applies to one order line, or null.
 *
 * Tried in this order:
 *
 *   1. A recipe for this exact `menuItemId` AND `variantId`.
 *   2. Failing that, the item-level recipe (`variantId: null`).
 *   3. Failing that, null -- the caller deducts nothing and the sale
 *      succeeds. Nothing here raises for a missing recipe; that would defeat
 *      the whole point of the fallback.
 *
 * Step 1 before step 2, always. If step 2 ran first, a half plate would
 * deduct as though it were a full plate whenever only the full plate had its
 * own recipe, which is over-deduction disguised as a working feature.
 *
 * An inactive recipe does not resolve. Deactivating a recipe (there is no
 * such flag reachable from the API today, but the field exists on the model
 * for exactly this) is meant to behave like the recipe not existing.
 */
export async function resolveRecipe(req, { menuItemId, variantId }, session = null) {
  const options = session ? { session } : {};

  if (variantId) {
    const exact = await Recipe.findOne({
      ...scoped(req),
      menuItemId,
      variantId,
      isActive: true,
    }).setOptions(options);
    if (exact) return exact;
  }

  return Recipe.findOne({
    ...scoped(req),
    menuItemId,
    variantId: null,
    isActive: true,
  }).setOptions(options);
}

/**
 * Creates or replaces the recipe for one menu item, or one of its variants.
 *
 * The one PUT in this project. Identified by what it is attached to
 * (`menuItemId` + `variantId`), not by its own id, so writing the same body
 * twice leaves the same single recipe rather than creating a second one.
 */
export async function putRecipe(req, { menuItemId, variantId, items }) {
  const ids = items.map((item) => item.ingredientId);
  const uniqueIds = new Set(ids.map(String));
  if (uniqueIds.size !== ids.length) {
    throw new DuplicateRecipeIngredientError();
  }

  const menuItem = await MenuItem.findOne({ ...scoped(req), _id: menuItemId, isActive: true });
  if (!menuItem) throw new NotFoundError('Menu item not found.');

  if (variantId) {
    const variant = menuItem.variants.id(variantId);
    if (!variant) throw new NotFoundError('Variant not found on this item.');
  }

  if (ids.length > 0) {
    const found = await Ingredient.find({ ...scoped(req), _id: { $in: ids } }).select(
      '_id isActive',
    );
    const foundIds = new Set(found.map((doc) => String(doc._id)));
    const missing = ids.filter((id) => !foundIds.has(String(id)));
    if (missing.length > 0) throw new NotFoundError('One or more ingredients were not found.');

    const inactive = found.filter((doc) => doc.isActive === false);
    if (inactive.length > 0) {
      throw new BusinessRuleError(
        'This recipe uses an ingredient that has been switched off. Reactivate it first, or remove it from the recipe.',
      );
    }
  }

  const existing = await Recipe.findOne({ ...scoped(req), menuItemId, variantId: variantId ?? null });

  if (existing) {
    existing.items = items;
    existing.isActive = true;
    await existing.save();
    return { recipe: existing, created: false };
  }

  const recipe = await Recipe.create({
    ...scoped(req),
    menuItemId,
    variantId: variantId ?? null,
    items,
  });
  return { recipe, created: true };
}

/** Recipes for the editor, with ingredient names and base units resolved. */
export async function listRecipes(req, { menuItemId, page, limit }) {
  const filter = { ...scoped(req) };
  if (menuItemId) filter.menuItemId = menuItemId;

  const [recipes, total] = await Promise.all([
    Recipe.find(filter)
      .sort({ menuItemId: 1, variantId: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Recipe.countDocuments(filter),
  ]);

  const allIngredientIds = [
    ...new Set(recipes.flatMap((recipe) => recipe.items.map((item) => String(item.ingredientId)))),
  ];
  const ingredients = await Ingredient.find({ ...scoped(req), _id: { $in: allIngredientIds } }).select(
    'name baseUnit',
  );
  const byId = new Map(ingredients.map((doc) => [String(doc._id), doc]));

  const resolved = recipes.map((recipe) => {
    const json = recipe.toJSON();
    json.items = json.items.map((item) => {
      const ingredient = byId.get(String(item.ingredientId));
      return {
        ...item,
        ingredientName: ingredient?.name ?? null,
        baseUnit: ingredient?.baseUnit ?? null,
      };
    });
    return json;
  });

  return { recipes: resolved, total };
}

/** The one hard delete in the project. A recipe is configuration, not history. */
export async function deleteRecipe(req, recipeId) {
  const recipe = await Recipe.findOneAndDelete({ ...scoped(req), _id: recipeId });
  if (!recipe) throw new NotFoundError('Recipe not found.');
}

/** How many active recipes still reference this ingredient. For the deactivation guard. */
export function countRecipesUsingIngredient(req, ingredientId) {
  return Recipe.countDocuments({
    ...scoped(req),
    isActive: true,
    'items.ingredientId': ingredientId,
  });
}

/**
 * Menu items that have been fired with no recipe CURRENTLY resolvable,
 * newest first, with how many times.
 *
 * "Currently" is a deliberate reading of the spec's "has sold with no recipe
 * resolvable": this recomputes against today's recipes on every call rather
 * than remembering a flag from the moment of firing, the same "computed on
 * read, no job runner" rule the rest of M4 follows. A menu item a manager just
 * fixed drops off this list the next time it is read, which is the point --
 * this exists to prompt a fix, not to keep score of past gaps.
 *
 * Reads `orders` directly rather than `kots`: a KOT line has no `menuItemId`
 * of its own (only a name snapshot), and the order line it came from is the
 * one place that id and its variant live.
 */
export async function findUnmappedDishes(req, { from, to } = {}) {
  // Undefined when no range was given, so every line that has ever fired is
  // in scope -- the Mongo-side filter below is skipped the same way.
  const range = from && to ? businessDateRangeToUtc(from, to) : null;

  const match = { ...scoped(req), 'lines.firedAt': { $ne: null } };
  if (range) match['lines.firedAt'] = { $ne: null, $gte: range.start, $lt: range.end };

  // Matching a query against an array field only requires ONE element to
  // satisfy it, so an order returned here can still hold other lines outside
  // the range -- hence the same check is repeated per line below.
  const orders = await Order.find(match).select('lines');

  const groups = new Map();
  for (const order of orders) {
    for (const line of order.lines) {
      if (!line.firedAt) continue;
      if (range && (line.firedAt < range.start || line.firedAt >= range.end)) continue;

      const key = `${line.menuItemId}:${line.variantId ?? ''}`;
      const entry = groups.get(key) ?? {
        menuItemId: line.menuItemId,
        variantId: line.variantId ?? null,
        itemName: line.itemName,
        variantName: line.variantName ?? null,
        fireCount: 0,
      };
      entry.fireCount += 1;
      groups.set(key, entry);
    }
  }

  if (groups.size === 0) return [];

  const candidates = [...groups.values()];
  const resolvable = await Promise.all(
    candidates.map((candidate) =>
      resolveRecipe(req, { menuItemId: candidate.menuItemId, variantId: candidate.variantId }),
    ),
  );

  return candidates
    .filter((_candidate, index) => !resolvable[index])
    .sort((a, b) => b.fireCount - a.fireCount);
}

export default {
  countRecipesUsingIngredient,
  deleteRecipe,
  findUnmappedDishes,
  listRecipes,
  putRecipe,
  resolveRecipe,
};
