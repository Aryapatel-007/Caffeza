/**
 * P63. Two-way sync, for the owner and the manager. API-CONTRACT "P63" section 4.
 */
import { api, requestWithMeta } from './client.js';

/** GET /sync/status. */
export function getSyncStatus() {
  return api.get('/sync/status');
}

/** GET /sync/conflicts: `{ data, meta }`, newest first. */
export function listSyncConflicts({ seen = false, page = 1, limit = 50 } = {}) {
  return requestWithMeta(`/sync/conflicts?seen=${seen ? 'true' : 'false'}&page=${page}&limit=${limit}`);
}

/** POST /sync/conflicts/:id/seen. */
export function markSyncConflictSeen(conflictId) {
  return api.post(`/sync/conflicts/${conflictId}/seen`, {});
}
