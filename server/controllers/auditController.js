/**
 * The audit trail, read. M8, built in P17. docs/API-CONTRACT.md "M8".
 */
import { auditSummary, entityHistory, listAudit } from '../services/auditReadService.js';
import { assertRange } from '../services/reportRangeService.js';
import { sendList, sendSuccess } from '../utils/response.js';

/** GET /audit */
export async function getAudit(req, res) {
  const { from, to, action, entityType, actorId, page, limit } = req.query;
  assertRange({ from, to });
  const { lines, total } = await listAudit(req, { from, to, action, entityType, actorId, page, limit });
  return sendList(res, lines, { page, limit, total });
}

/** GET /audit/entity/:entityType/:entityId */
export async function getEntityHistory(req, res) {
  const { entityType, entityId } = req.params;
  return sendSuccess(res, await entityHistory(req, entityType, entityId));
}

/** GET /audit/summary */
export async function getAuditSummary(req, res) {
  const { from, to } = req.query;
  assertRange({ from, to });
  return sendSuccess(res, await auditSummary(req, { from, to }));
}
