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
 * Those are derived from the ticket's lines and stored nowhere, which is why
 * the server filters them after reading rather than in the query, and why a
 * page can come back shorter than its limit.
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
