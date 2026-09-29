/**
 * Billing routes.
 *
 * Reading one bill and its receipt is open to all six roles, because a waiter
 * carries the bill to the table. Creating one and taking payment is the
 * cashier's job.
 *
 * Discounting and voiding are NOT, and that is the whole point of this module.
 * BUILD-PLAN section 7 names voids and discounts as the events an owner is
 * losing money to, so both need a manager's credentials and both land on the
 * audit trail. Do not widen either to CASHIER to make this file look
 * consistent; the asymmetry is the feature.
 *
 * Middleware order is docs/CONVENTIONS.md section 8:
 * authenticate, tenant, permission, validate, controller.
 *
 * There is no DELETE here and there will not be one. A bill is voided, with a
 * reason and an actor, and its number stays spent.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import {
  getBill,
  getReceipt,
  getSummary,
  listBills,
  postBill,
  postDiscount,
  postPayment,
  postVoid,
} from '../controllers/billController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  applyDiscountSchema,
  billSummarySchema,
  createBillSchema,
  listBillsSchema,
  readBillSchema,
  receiptSchema,
  recordPaymentSchema,
  voidBillSchema,
} from '../validators/billValidators.js';

const router = Router();

const base = [authenticate, tenant];

/** Owner and manager. Discounting, voiding and the summary. */
const managers = [...base, requireRole(ROLES.OWNER, ROLES.MANAGER)];

/** The people who work the till. */
const till = [...base, requireRole(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER)];

/** Everyone signed in. A waiter reads the bill they are carrying. */
const anySignedIn = [
  ...base,
  requireRole(
    ROLES.OWNER,
    ROLES.MANAGER,
    ROLES.CASHIER,
    ROLES.WAITER,
    ROLES.KITCHEN,
    ROLES.STOREKEEPER,
  ),
];

/**
 * Before /bills/:billId, or "summary" is parsed as an id and answers 404 for a
 * malformed ObjectId instead of running.
 */
router.get('/bills/summary', ...managers, validate(billSummarySchema), getSummary);

router.post('/bills', ...till, validate(createBillSchema), postBill);
router.get('/bills', ...till, validate(listBillsSchema), listBills);
router.get('/bills/:billId', ...anySignedIn, validate(readBillSchema), getBill);
router.get('/bills/:billId/receipt', ...anySignedIn, validate(receiptSchema), getReceipt);

router.post('/bills/:billId/payments', ...till, validate(recordPaymentSchema), postPayment);

router.post('/bills/:billId/discount', ...managers, validate(applyDiscountSchema), postDiscount);
router.post('/bills/:billId/void', ...managers, validate(voidBillSchema), postVoid);

export default router;
