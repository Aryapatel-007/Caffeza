/**
 * Menu API calls.
 *
 * Every fetch for M1 lives here. Components call these and never touch the
 * network themselves.
 *
 * Shapes come from docs/API-CONTRACT.md sections 4 to 6.
 */
import { api, downloadFile, requestWithMeta } from './client.js';

/** Builds a query string, leaving out anything empty. */
function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/* --- categories --- */

export function listCategories({ includeInactive = false } = {}) {
  return api.get(`/categories${toQuery({ includeInactive })}`);
}

export function createCategory({ name, displayOrder }) {
  return api.post('/categories', { name, displayOrder });
}

/** name and displayOrder only. isActive has its own endpoint. */
export function updateCategory(categoryId, { name, displayOrder, stationId }) {
  const body = {};
  if (name !== undefined) body.name = name;
  if (displayOrder !== undefined) body.displayOrder = displayOrder;
  // P05. A station id, or null for the default station.
  if (stationId !== undefined) body.stationId = stationId;
  return api.patch(`/categories/${categoryId}`, body);
}

/**
 * Turning a category off does not cascade to its items. They keep their own
 * isActive and come back untouched when the category does.
 */
export function setCategoryActive(categoryId, isActive) {
  return api.patch(`/categories/${categoryId}/active`, { isActive });
}

/* --- menu items --- */

export function listMenuItems({
  categoryId,
  search,
  availableOnly,
  includeInactive,
  page,
  limit,
} = {}) {
  return requestWithMeta(
    `/menu-items${toQuery({ categoryId, search, availableOnly, includeInactive, page, limit })}`,
  );
}

export function getMenuItem(menuItemId) {
  return api.get(`/menu-items/${menuItemId}`);
}

export function createMenuItem(body) {
  return api.post('/menu-items', body);
}

/**
 * Only the fields the contract allows. isActive and isAvailable are refused
 * here by the server, each having its own endpoint.
 *
 * A variant or add-on entry carrying an `id` updates that subdocument in place
 * and keeps its id. One without an id becomes new. One whose id is not on the
 * item is a 404, never a silent create. Send ids back exactly as they came.
 */
export function updateMenuItem(menuItemId, body) {
  return api.patch(`/menu-items/${menuItemId}`, body);
}

/**
 * The one M1 write open to all six roles.
 *
 * variantId null or absent sets the item. A supplied variantId sets that
 * variant and leaves the item alone.
 */
export function setAvailability(menuItemId, { isAvailable, variantId = null }) {
  return api.patch(`/menu-items/${menuItemId}/availability`, { isAvailable, variantId });
}

/** This is the delete. There is no DELETE verb in M1. */
export function setMenuItemActive(menuItemId, isActive) {
  return api.patch(`/menu-items/${menuItemId}/active`, { isActive });
}

/* --- the menu tree --- */

/**
 * The whole sellable menu in one request.
 *
 * Inactive categories and inactive items never appear here under any query, so
 * this cannot drive the builder, which has to show them to switch them back on.
 * The builder reads categories and menu-items directly. This is the
 * availability board's read.
 */
export function getMenuTree({ includeUnavailable = true } = {}) {
  return api.get(`/menu${toQuery({ includeUnavailable })}`);
}

/* P24. Dish photos. The image is a base64 data URL, resized on the device first. */
export function setMenuPhoto(menuItemId, image) {
  return api.put(`/menu-items/${menuItemId}/photo`, { image });
}

export function removeMenuPhoto(menuItemId) {
  return api.delete(`/menu-items/${menuItemId}/photo`, { body: {} });
}

/** The stored photo as an object URL, through the signed-in session. */
export async function menuPhotoUrl(menuItemId) {
  const { blob } = await downloadFile(`/menu-items/${menuItemId}/photo`);
  return URL.createObjectURL(blob);
}
