/**
 * Recipe and unmapped-dish endpoints.
 *
 * Shapes come from docs/API-CONTRACT.md section 17.
 */
import { deleteRecipe, findUnmappedDishes, listRecipes, putRecipe } from '../services/recipeService.js';
import { sendList, sendSuccess } from '../utils/response.js';

/** PUT /recipes. The one PUT in this project: create or replace, idempotent. */
export async function putRecipeHandler(req, res) {
  const { menuItemId, variantId, items } = req.body;
  const { recipe, created } = await putRecipe(req, {
    menuItemId,
    variantId: variantId ?? null,
    items,
  });
  return sendSuccess(res, recipe, created ? 201 : 200);
}

/** GET /recipes */
export async function getRecipes(req, res) {
  const { page, limit, menuItemId } = req.query;
  const { recipes, total } = await listRecipes(req, { page, limit, menuItemId });
  return sendList(res, recipes, { page, limit, total });
}

/** DELETE /recipes/:recipeId. The one hard delete in the project. */
export async function deleteRecipeHandler(req, res) {
  await deleteRecipe(req, req.params.recipeId);
  return sendSuccess(res, { deleted: true });
}

/** GET /inventory/unmapped */
export async function getUnmapped(req, res) {
  const { from, to } = req.query;
  return sendSuccess(res, await findUnmappedDishes(req, { from, to }));
}
