/**
 * P63. Two-way sync, for the owner and the manager: status, the conflicts, and
 * marking one seen. docs/API-CONTRACT.md "P63".
 */
import { listConflicts, markConflictSeen, syncStatus } from '../services/sync/statusService.js';
import { sendList, sendSuccess } from '../utils/response.js';

export async function getSyncStatus(req, res) {
  return sendSuccess(res, await syncStatus(req.restaurantId));
}

export async function getSyncConflicts(req, res) {
  const { seen, page, limit } = req.query;
  const { rows, total } = await listConflicts(req.restaurantId, { seen: seen === 'true', page, limit });
  return sendList(res, rows, { page, limit, total });
}

export async function postConflictSeen(req, res) {
  return sendSuccess(res, await markConflictSeen(req.restaurantId, req.params.conflictId, req.user.id));
}
