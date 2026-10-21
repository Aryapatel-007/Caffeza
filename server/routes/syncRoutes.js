/**
 * P63. Two-way sync, read and acknowledged by the owner and the manager.
 *
 *   GET  /sync/status
 *   GET  /sync/conflicts?seen=false
 *   POST /sync/conflicts/:conflictId/seen
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import { getSyncConflicts, getSyncStatus, postConflictSeen } from '../controllers/syncController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { conflictSeenSchema, syncConflictsSchema, syncStatusSchema } from '../validators/syncValidators.js';

const router = Router();
const managers = [authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER)];

router.get('/sync/status', ...managers, validate(syncStatusSchema), getSyncStatus);
router.get('/sync/conflicts', ...managers, validate(syncConflictsSchema), getSyncConflicts);
router.post('/sync/conflicts/:conflictId/seen', ...managers, validate(conflictSeenSchema), postConflictSeen);

export default router;
