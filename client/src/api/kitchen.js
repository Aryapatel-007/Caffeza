/**
 * Kitchen display API calls.
 *
 * Shapes come from Part 4 section M2.4 of docs/PROJECT-PLAN.md.
 *
 * There is no create call here. A ticket is produced by firing an order, which
 * lives in api/orders.js, and never directly.
 */
import { requestWithMeta, api } from './client.js';

function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/**
 * The kitchen screen's read. Oldest ticket first, which is the order a kitchen
 * works in and the opposite of every other list in this product.
 *
 * `status` takes a comma-separated string of PENDING, IN_PROGRESS, COMPLETED.
 * Those are derived from the ticket's lines and stored nowhere. The server puts
 * "still to cook" into its query (a line still PENDING), so the board's page is
 * always the open tickets, however much history the kitchen has.
 */
export function listKots({ status, page, limit, stationId } = {}) {
  return requestWithMeta(`/kots${toQuery({ status, page, limit, stationId })}`);
}

/**
 * The ticket as plain text, laid out by the server at 32 or 48 characters.
 * P05. `reprint` adds a REPRINT line.
 */
export function getKotTicket(kotId, { width = 48, reprint = false } = {}) {
  return api.get(`/kots/${kotId}/ticket${toQuery({ width, reprint: reprint ? 'true' : undefined })}`);
}

export function getKot(kotId) {
  return api.get(`/kots/${kotId}`);
}

/**
 * Marks one dish ready, and the matching order line with it.
 *
 * No version. A ticket is append-only from the kitchen's side and two cooks
 * marking the same dish ready is harmless, so the person at the pass is not
 * asked to hold a number in their head.
 */
export function markKotLineReady(kotId, lineId) {
  return api.patch(`/kots/${kotId}/lines/${lineId}/ready`, undefined);
}

/** The whole ticket in one tap, for when a table's food goes out together. */
export function markKotReady(kotId) {
  return api.patch(`/kots/${kotId}/ready`, undefined);
}

/**
 * P29 Part E. Takes back a ready tick made by mistake: the dish goes back to
 * the kitchen. Refused once the table is billed. The answer carries
 * `platformAlreadyTold` for a platform order told before the undo.
 */
export function undoKotLineReady(kotId, lineId) {
  return api.post(`/kots/${kotId}/lines/${lineId}/undo-ready`, undefined);
}

/** P29 Part E. Every ready dish on the ticket, back to the kitchen. */
export function undoKotReady(kotId) {
  return api.post(`/kots/${kotId}/undo-ready`, undefined);
}
