/**
 * Table and order API calls.
 *
 * Every fetch for M2's floor and order screens lives here. Components call
 * these and never touch the network themselves.
 *
 * Shapes come from Part 4 section M2 of docs/PROJECT-PLAN.md.
 *
 * The rule running through this file: the client never sends a price. A line is
 * described by ids and a quantity, and the server writes the money onto it. The
 * request schema refuses a price field outright rather than ignoring it, so
 * adding one here would produce a 400, not a discount.
 */
import { api, requestWithMeta } from './client.js';

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

/* --- tables --- */

/**
 * The floor view's read.
 *
 * Each table carries a derived `occupancy` block: whether an order is open on
 * it, which one, and its running total. That is computed by the server on every
 * request and stored nowhere, so it cannot be stale.
 *
 * `includeInactive` is for the table management screen, which has to see a
 * deactivated table in order to switch it back on.
 */
export function listTables({ section, isOccupied, includeInactive } = {}) {
  return api.get(`/tables${toQuery({ section, isOccupied, includeInactive })}`);
}

export function createTable({ name, section, seats, displayOrder }) {
  return api.post('/tables', { name, section, seats, displayOrder });
}

/** name, section, seats and displayOrder only. isActive has its own endpoint. */
export function updateTable(tableId, body) {
  return api.patch(`/tables/${tableId}`, body);
}

/** API-CONTRACT 11.6: removes a table no order has ever been on. A used table is turned off instead. */
export function deleteTable(tableId) {
  return api.delete(`/tables/${tableId}`);
}

/**
 * P19. One section's floor plan, saved together. Each entry is a table's place
 * `{ tableId, x, y, w, h, shape }`, or `{ tableId, layout: null }` to take it off.
 */
export function saveTableLayout({ section, tables }) {
  return api.patch('/tables/layout', { section, tables });
}

export function setTableActive(tableId, isActive) {
  return api.patch(`/tables/${tableId}/status`, { isActive });
}

/* --- orders --- */

/**
 * `status` takes a comma-separated string, for example "OPEN,READY_TO_BILL".
 * An unknown value is a 400 rather than being quietly dropped.
 */
export function listOrders({ status, orderType, tableId, page, limit } = {}) {
  return requestWithMeta(`/orders${toQuery({ status, orderType, tableId, page, limit })}`);
}

export function getOrder(orderId) {
  return api.get(`/orders/${orderId}`);
}

/**
 * A dine-in order names a table. A takeaway order names neither a table nor a
 * guest count, and may carry a customer instead. Sending the other branch's
 * fields is a 400, not a silent drop.
 */
export function createOrder(body) {
  return api.post('/orders', body);
}

/**
 * Every write below takes the `version` the client last read.
 *
 * If someone else has changed the order since, the server answers 409
 * VERSION_CONFLICT carrying `currentVersion`, and the screen reloads rather
 * than overwriting a colleague's work. See features/orders/errorCopy.js.
 */
export function addOrderLines(orderId, { version, lines }) {
  return api.post(`/orders/${orderId}/lines`, { version, lines });
}

/** Quantity and notes only, and only while the line is still PENDING. */
export function editOrderLine(orderId, lineId, { version, quantity, notes }) {
  const body = { version };
  if (quantity !== undefined) body.quantity = quantity;
  if (notes !== undefined) body.notes = notes;
  return api.patch(`/orders/${orderId}/lines/${lineId}`, body);
}

/**
 * `wasPrepared` is required when the line has been to the kitchen and must be
 * absent when it has not. The caller decides from the line's own status; the
 * server refuses the wrong shape either way.
 */
export function cancelOrderLine(orderId, lineId, { version, reasonCode, note, wasPrepared }) {
  const body = { version, reasonCode, note: note || null };
  if (wasPrepared !== undefined) body.wasPrepared = wasPrepared;
  return api.post(`/orders/${orderId}/lines/${lineId}/cancel`, body);
}

/** Sends every pending line as one new kitchen ticket. Returns { kot, order }. */
export function fireOrder(orderId, version) {
  return api.post(`/orders/${orderId}/fire`, { version });
}

/**
 * Only a READY line can be served. When the last live line is served the
 * server moves the order to READY_TO_BILL by itself; there is no call for that
 * and the client must never try to set it.
 */
export function markLineServed(orderId, lineId, version) {
  return api.patch(`/orders/${orderId}/lines/${lineId}/served`, { version });
}

export function moveOrderToTable(orderId, { version, tableId }) {
  return api.patch(`/orders/${orderId}/table`, { version, tableId });
}

/**
 * OWNER and MANAGER only, unlike cancelling a single line.
 *
 * Hiding the button for other roles is a convenience. The server is what
 * refuses it, and it refuses it because a whole-order cancel is how a table
 * disappears.
 */
export function cancelOrder(orderId, { version, reasonCode, note, wasPrepared }) {
  const body = { version, reasonCode, note: note || null };
  if (wasPrepared !== undefined) body.wasPrepared = wasPrepared;
  return api.post(`/orders/${orderId}/cancel`, body);
}

/**
 * P08. Closes the order with no bill and no invoice number: food given free.
 * OWNER and MANAGER. A fixed reason, and a note that is required for OTHER.
 */
export function giveNoCharge(orderId, { version, reasonCode, note }) {
  return api.post(`/orders/${orderId}/no-charge`, { version, reasonCode, note: note || null });
}
