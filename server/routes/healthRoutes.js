/**
 * Health routes.
 *
 * No authentication, no tenant, no permission check. A monitor cannot log in.
 */
import { Router } from 'express';

import { getHealth, getWake } from '../controllers/healthController.js';
import { wakeLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.get('/health', getHealth);
// P30. What the pingers call: no database, its own limiter, never cached.
router.get('/wake', wakeLimiter, getWake);

export default router;
