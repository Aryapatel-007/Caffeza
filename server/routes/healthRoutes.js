/**
 * Health routes.
 *
 * No authentication, no tenant, no permission check. A monitor cannot log in.
 */
import { Router } from 'express';

import { getHealth } from '../controllers/healthController.js';

const router = Router();

router.get('/health', getHealth);

export default router;
