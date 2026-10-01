/**
 * Cash drawer and Day Close routes. P10.
 *
 * The till records the float and cash paid in; taking cash out is manager
 * work, checked in cashService because one endpoint takes all three types.
 * Closing a day and reading a close are for the owner and manager; only the
 * owner reopens a closed day.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import {
  getCash,
  getDay,
  getDayPrint,
  getDays,
  postCash,
  postCloseDay,
  postReopenDay,
  postVoidCash,
} from '../controllers/dayCloseController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  closeDaySchema,
  listCashSchema,
  listDaysSchema,
  printDaySchema,
  readDaySchema,
  recordCashSchema,
  reopenDaySchema,
  voidCashSchema,
} from '../validators/dayCloseValidators.js';

const router = Router();

const base = [authenticate, tenant];
const owner = [...base, requireRole(ROLES.OWNER)];
const managers = [...base, requireRole(ROLES.OWNER, ROLES.MANAGER)];
const till = [...base, requireRole(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER)];

router.get('/cash-movements', ...till, validate(listCashSchema), getCash);
router.post('/cash-movements', ...till, validate(recordCashSchema), postCash);
router.post('/cash-movements/:movementId/void', ...managers, validate(voidCashSchema), postVoidCash);

router.get('/day-close', ...managers, validate(listDaysSchema), getDays);
router.post('/day-close', ...managers, validate(closeDaySchema), postCloseDay);
router.get('/day-close/:businessDate', ...managers, validate(readDaySchema), getDay);
router.get('/day-close/:businessDate/print', ...managers, validate(printDaySchema), getDayPrint);
router.post('/day-close/:businessDate/reopen', ...owner, validate(reopenDaySchema), postReopenDay);

export default router;
