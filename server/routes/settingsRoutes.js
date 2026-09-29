/**
 * Settings routes. Two of them.
 *
 * Read is OWNER and MANAGER. Write is OWNER ONLY, and that asymmetry is
 * deliberate: this object holds the GST pricing mode, which is a legally
 * significant choice, and the business day boundary, which silently moves which
 * day every future sale lands on. Neither is a thing a manager should change on
 * a Tuesday afternoon. A manager still needs to read them to know what the
 * restaurant is configured to do.
 *
 * Middleware order is docs/CONVENTIONS.md section 8:
 * authenticate, tenant, permission, validate, controller.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import {
  getRestaurantSettings,
  updateRestaurantSettings,
} from '../controllers/settingsController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { getSettingsSchema, updateSettingsSchema } from '../validators/settingsValidators.js';

const router = Router();

const base = [authenticate, tenant];

router.get(
  '/settings',
  ...base,
  requireRole(ROLES.OWNER, ROLES.MANAGER),
  validate(getSettingsSchema),
  getRestaurantSettings,
);

router.patch(
  '/settings',
  ...base,
  requireRole(ROLES.OWNER),
  validate(updateSettingsSchema),
  updateRestaurantSettings,
);

export default router;
