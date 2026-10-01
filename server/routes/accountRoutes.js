/**
 * On Hold accounts and platform payouts. P09.
 *
 * Money that arrives later. A cashier may see the accounts and record a
 * collection at the till; charging a bill to an account is manager work until
 * Caffeza says otherwise, and adjusting a balance is the owner's. Payouts are
 * back-office work for the owner and manager, and only the owner voids one.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import {
  getAccounts,
  getPayouts,
  getStatement,
  patchAccount,
  postAccount,
  postAdjustment,
  postChargeToAccount,
  postCollection,
  postPayout,
  postVoidPayout,
} from '../controllers/accountController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  adjustmentSchema,
  chargeToAccountSchema,
  collectionSchema,
  createAccountSchema,
  listAccountsSchema,
  listPayoutsSchema,
  recordPayoutSchema,
  statementSchema,
  updateAccountSchema,
  voidPayoutSchema,
} from '../validators/accountValidators.js';

const router = Router();

const base = [authenticate, tenant];
const owner = [...base, requireRole(ROLES.OWNER)];
const managers = [...base, requireRole(ROLES.OWNER, ROLES.MANAGER)];
const till = [...base, requireRole(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER)];

router.get('/accounts', ...till, validate(listAccountsSchema), getAccounts);
router.post('/accounts', ...managers, validate(createAccountSchema), postAccount);
router.patch('/accounts/:accountId', ...managers, validate(updateAccountSchema), patchAccount);
router.post('/accounts/:accountId/collections', ...till, validate(collectionSchema), postCollection);
router.post('/accounts/:accountId/adjustments', ...owner, validate(adjustmentSchema), postAdjustment);
router.get('/accounts/:accountId/statement', ...managers, validate(statementSchema), getStatement);

router.post(
  '/bills/:billId/charge-to-account',
  ...managers,
  validate(chargeToAccountSchema),
  postChargeToAccount,
);

router.get('/platform-payouts', ...managers, validate(listPayoutsSchema), getPayouts);
router.post('/platform-payouts', ...managers, validate(recordPayoutSchema), postPayout);
router.post('/platform-payouts/:payoutId/void', ...owner, validate(voidPayoutSchema), postVoidPayout);

export default router;
