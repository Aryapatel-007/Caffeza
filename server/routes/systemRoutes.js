/**
 * System routes. P30.
 *
 * The record of server starts is about the server, which every restaurant
 * shares, and it says when the server slept. It is the owner's to read.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import { getServerStarts } from '../controllers/systemController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { serverStartsSchema } from '../validators/systemValidators.js';

const router = Router();

router.get('/system/starts', authenticate, tenant, requireRole(ROLES.OWNER), validate(serverStartsSchema), getServerStarts);

export default router;
