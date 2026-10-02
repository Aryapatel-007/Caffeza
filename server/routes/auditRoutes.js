/**
 * Audit trail routes. M8, built in P17.
 *
 * The feed and one record's history are for the owner and, restricted in the
 * query to the actions a manager runs, the manager. The summary is the
 * owner's alone. Nothing here writes: an audit line is never edited.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import { getAudit, getAuditSummary, getEntityHistory } from '../controllers/auditController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { auditSummarySchema, entityHistorySchema, listAuditSchema } from '../validators/auditValidators.js';

const router = Router();

const base = [authenticate, tenant];
const ownerAndManager = [...base, requireRole(ROLES.OWNER, ROLES.MANAGER)];
const ownerOnly = [...base, requireRole(ROLES.OWNER)];

router.get('/audit/summary', ...ownerOnly, validate(auditSummarySchema), getAuditSummary);
router.get('/audit/entity/:entityType/:entityId', ...ownerAndManager, validate(entityHistorySchema), getEntityHistory);
router.get('/audit', ...ownerAndManager, validate(listAuditSchema), getAudit);

export default router;
