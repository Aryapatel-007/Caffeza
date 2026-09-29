/**
 * Ingredient and stock movement endpoints.
 *
 * Shapes come from docs/API-CONTRACT.md sections 16 and 18.
 *
 * Every business rule is in services/ingredientService.js and
 * services/stockMovementService.js. This file reads the request, calls one of
 * those, and sends the answer.
 */
import {
  adjustStock,
  createIngredient,
  listIngredients,
  loadIngredientInTenant,
  serialiseIngredient,
  setIngredientActive,
  updateIngredient,
} from '../services/ingredientService.js';
import { getConsumption, listMovements } from '../services/stockMovementService.js';
import { sendList, sendSuccess } from '../utils/response.js';

/** POST /ingredients */
export async function postIngredient(req, res) {
  const ingredient = await createIngredient(req, req.body);
  return sendSuccess(res, serialiseIngredient(ingredient), 201);
}

/** GET /ingredients */
export async function getIngredients(req, res) {
  const { page, limit, search, lowStockOnly, includeInactive } = req.query;
  const { ingredients, total } = await listIngredients(req, {
    page,
    limit,
    search,
    lowStockOnly,
    includeInactive,
  });
  return sendList(res, ingredients, { page, limit, total });
}

/** PATCH /ingredients/:ingredientId */
export async function patchIngredient(req, res) {
  const ingredient = await updateIngredient(req, req.params.ingredientId, req.body);
  return sendSuccess(res, serialiseIngredient(ingredient));
}

/** PATCH /ingredients/:ingredientId/active. This is the delete. */
export async function patchIngredientActive(req, res) {
  const ingredient = await setIngredientActive(req, req.params.ingredientId, req.body.isActive);
  return sendSuccess(res, serialiseIngredient(ingredient));
}

/** GET /ingredients/:ingredientId/movements */
export async function getMovements(req, res) {
  await loadIngredientInTenant(req, req.params.ingredientId); // 404 before anything else
  const { page, limit, from, to } = req.query;
  const { movements, total } = await listMovements(req, req.params.ingredientId, {
    page,
    limit,
    from,
    to,
  });
  return sendList(res, movements, { page, limit, total });
}

/** POST /ingredients/:ingredientId/movements */
export async function postMovement(req, res) {
  const { movement, ingredient } = await adjustStock(req, req.params.ingredientId, req.body);
  return sendSuccess(res, { movement, ingredient }, 201);
}

/** GET /inventory/consumption */
export async function getInventoryConsumption(req, res) {
  const { from, to } = req.query;
  return sendSuccess(res, await getConsumption(req, { from, to }));
}
