/**
 * Payment method routes. M10, built in P08.
 *
 * Reading is open to all six, because the payment panel draws one button per
 * method. Configuring methods is the owner's: a method carries the Tally code
 * the accountant's import depends on and the commission payouts are checked
 * against.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import {
  getPaymentMethods,
  patchPaymentMethod,
  postPaymentMethod,
} from '../controllers/paymentMethodController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  createPaymentMethodSchema,
  listPaymentMethodsSchema,
  updatePaymentMethodSchema,
} from '../validators/paymentMethodValidators.js';

const router = Router();

const anySignedIn = [
  authenticate,
  tenant,
  requireRole(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN, ROLES.STOREKEEPER),
];
const owner = [authenticate, tenant, requireRole(ROLES.OWNER)];

router.get('/payment-methods', ...anySignedIn, validate(listPaymentMethodsSchema), getPaymentMethods);
router.post('/payment-methods', ...owner, validate(createPaymentMethodSchema), postPaymentMethod);
router.patch(
  '/payment-methods/:methodId',
  ...owner,
  validate(updatePaymentMethodSchema),
  patchPaymentMethod,
);

export default router;
