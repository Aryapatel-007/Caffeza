/**
 * M19 report routes. Built in P14. Every report in the registry is mounted at
 * GET /api/v1/reports/v2/{name} with its own roles. The M6 routes in
 * reportRoutes.js stay where they are until P18 replaces their screens.
 */
import { Router } from 'express';

import { getBillDetail, getReport } from '../controllers/reportV2Controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { REPORTS, REPORTS_BY_NAME } from '../services/reports/registry.js';

const router = Router();

router.get(
  '/reports/v2/bills/:billId',
  authenticate,
  tenant,
  requireRole(...REPORTS_BY_NAME.bills.roles),
  getBillDetail,
);

for (const definition of REPORTS) {
  router.get(`/reports/v2/${definition.name}`, authenticate, tenant, requireRole(...definition.roles), getReport(definition));
}

export default router;
