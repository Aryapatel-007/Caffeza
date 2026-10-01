/**
 * Kitchen station routes. M18, built in P05.
 *
 * Reading the list is open to all six, because the kitchen screen's station
 * picker needs it. Changing stations is back-office work.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import { createStation, listStations, updateStation } from '../controllers/stationController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  createStationSchema,
  listStationsSchema,
  updateStationSchema,
} from '../validators/stationValidators.js';

const router = Router();

const anySignedIn = [
  authenticate,
  tenant,
  requireRole(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN, ROLES.STOREKEEPER),
];
const managers = [authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER)];

router.get('/stations', ...anySignedIn, validate(listStationsSchema), listStations);
router.post('/stations', ...managers, validate(createStationSchema), createStation);
router.patch('/stations/:stationId', ...managers, validate(updateStationSchema), updateStation);

export default router;
