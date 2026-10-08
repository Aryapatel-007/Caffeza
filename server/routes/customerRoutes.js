/**
 * Customers. P27, API-CONTRACT M22. OWNER and MANAGER; the download is the
 * owner's. Search is a POST, so a phone never sits in a URL.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import { getCustomer, getCustomers, getCustomersExport, patchCustomer, postSearchCustomers } from '../controllers/customerController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { exportCustomersSchema, listCustomersSchema, readCustomerSchema, searchCustomersSchema, updateCustomerSchema } from '../validators/customerValidators.js';

const router = Router();
const managers = [authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER)];
const owner = [authenticate, tenant, requireRole(ROLES.OWNER)];

router.get('/customers', ...managers, validate(listCustomersSchema), getCustomers);
router.post('/customers/search', ...managers, validate(searchCustomersSchema), postSearchCustomers);
router.get('/customers/export', ...owner, validate(exportCustomersSchema), getCustomersExport);
router.get('/customers/:customerId', ...managers, validate(readCustomerSchema), getCustomer);
router.patch('/customers/:customerId', ...managers, validate(updateCustomerSchema), patchCustomer);

export default router;
