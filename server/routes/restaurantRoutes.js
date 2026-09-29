/**
 * Restaurant routes.
 *
 * No id in any path. The restaurant is the one in the token.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import { getRestaurant, updateRestaurant } from '../controllers/restaurantController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { updateRestaurantSchema } from '../validators/restaurantValidators.js';

const router = Router();

router.get('/restaurant', authenticate, tenant, getRestaurant);

// OWNER only. A manager runs the floor, not the company details on the invoice.
router.patch(
  '/restaurant',
  authenticate,
  tenant,
  requireRole(ROLES.OWNER),
  validate(updateRestaurantSchema),
  updateRestaurant,
);

export default router;
