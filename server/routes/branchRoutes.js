/**
 * Branch routes. Read only in version 1.
 */
import { Router } from 'express';
import { z } from 'zod';

import { listBranches } from '../controllers/branchController.js';
import { authenticate } from '../middleware/authenticate.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { paginationQuery } from '../validators/common.js';

const router = Router();

router.get(
  '/branches',
  authenticate,
  tenant,
  validate(z.object({ query: paginationQuery })),
  listBranches,
);

export default router;
