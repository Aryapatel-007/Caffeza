/**
 * Report routes. Every one is a GET.
 *
 * There is no write verb in this file and there will not be one. M6 owns no
 * collection.
 *
 * Reports are OWNER and MANAGER by default. Two exceptions, both deliberate:
 *
 * `payment-methods` is OWNER ONLY. The cash figure is the number a dishonest
 * manager most wants to see and most wants to control, so the one report that
 * breaks it down by method is the one report a manager does not get. This is
 * the same instinct as M3 keeping discount and void away from a cashier.
 *
 * `stock-consumption` additionally allows STOREKEEPER, because it is the read
 * their job depends on -- the same reason M4 gives them the ingredient list
 * and the ledger.
 *
 * Middleware order is docs/CONVENTIONS.md section 8:
 * authenticate, tenant, permission, validate, controller.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import {
  getDashboard,
  getDiscounts,
  getHourly,
  getLabourHours,
  getPaymentMethods,
  getSalesByDay,
  getSalesSummary,
  getStockConsumption,
  getTaxSummary,
  getTopItems,
} from '../controllers/reportController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  dashboardSchema,
  discountsSchema,
  hourlySchema,
  labourHoursSchema,
  paymentMethodsSchema,
  salesByDaySchema,
  salesSummarySchema,
  stockConsumptionSchema,
  taxSummarySchema,
  topItemsSchema,
} from '../validators/reportValidators.js';

const router = Router();

const base = [authenticate, tenant];

/** The default for a report: the two roles who run the place. */
const managers = [...base, requireRole(ROLES.OWNER, ROLES.MANAGER)];

/** The cash breakdown. One role. */
const ownerOnly = [...base, requireRole(ROLES.OWNER)];

/** Plus the storekeeper, whose job this read is. */
const stockReaders = [...base, requireRole(ROLES.OWNER, ROLES.MANAGER, ROLES.STOREKEEPER)];

router.get('/reports/dashboard', ...managers, validate(dashboardSchema), getDashboard);
router.get('/reports/sales-summary', ...managers, validate(salesSummarySchema), getSalesSummary);
router.get('/reports/sales-by-day', ...managers, validate(salesByDaySchema), getSalesByDay);
router.get('/reports/hourly', ...managers, validate(hourlySchema), getHourly);
router.get('/reports/top-items', ...managers, validate(topItemsSchema), getTopItems);
router.get('/reports/tax-summary', ...managers, validate(taxSummarySchema), getTaxSummary);
router.get('/reports/discounts', ...managers, validate(discountsSchema), getDiscounts);
router.get('/reports/labour-hours', ...managers, validate(labourHoursSchema), getLabourHours);

router.get(
  '/reports/payment-methods',
  ...ownerOnly,
  validate(paymentMethodsSchema),
  getPaymentMethods,
);

router.get(
  '/reports/stock-consumption',
  ...stockReaders,
  validate(stockConsumptionSchema),
  getStockConsumption,
);

export default router;
