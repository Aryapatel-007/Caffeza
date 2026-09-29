/**
 * Ingredient, recipe and stock movement API calls.
 *
 * Shapes come from docs/API-CONTRACT.md sections 16 to 18.
 *
 * The client never sends `currentQtyInBase` directly and never computes a
 * signed quantity for anything but RECOUNT: the server applies WASTAGE and
 * SPILLAGE's sign itself (API-CONTRACT.md 18.2), so this file sends the
 * positive magnitude the storekeeper typed and nothing more.
 */
import { api, requestWithMeta } from './client.js';

function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/* --- ingredients --- */

export function listIngredients({ search, lowStockOnly, includeInactive, page, limit } = {}) {
  return requestWithMeta(
    `/ingredients${toQuery({ search, lowStockOnly, includeInactive, page, limit })}`,
  );
}

export function createIngredient(body) {
  return api.post('/ingredients', body);
}

export function updateIngredient(ingredientId, body) {
  return api.patch(`/ingredients/${ingredientId}`, body);
}

/** This is the delete. */
export function setIngredientActive(ingredientId, isActive) {
  return api.patch(`/ingredients/${ingredientId}/active`, { isActive });
}

/* --- stock movements --- */

export function listMovements(ingredientId, { from, to, page, limit } = {}) {
  return requestWithMeta(
    `/ingredients/${ingredientId}/movements${toQuery({ from, to, page, limit })}`,
  );
}

/** `qtyInBase` is always the positive magnitude except for RECOUNT, which is signed. */
export function adjustStock(ingredientId, { type, qtyInBase, reason }) {
  return api.post(`/ingredients/${ingredientId}/movements`, { type, qtyInBase, reason });
}

/* --- recipes --- */

export function listRecipes({ menuItemId, page, limit } = {}) {
  return requestWithMeta(`/recipes${toQuery({ menuItemId, page, limit })}`);
}

/** The one PUT in the project. Same body twice leaves the same one recipe. */
export function putRecipe({ menuItemId, variantId, items }) {
  return api.put('/recipes', { menuItemId, variantId: variantId ?? null, items });
}

/** The one hard delete in the project. */
export function deleteRecipe(recipeId) {
  return api.delete(`/recipes/${recipeId}`);
}

/* --- reports --- */

export function getUnmappedDishes({ from, to } = {}) {
  return api.get(`/inventory/unmapped${toQuery({ from, to })}`);
}

export function getConsumption({ from, to }) {
  return api.get(`/inventory/consumption${toQuery({ from, to })}`);
}
