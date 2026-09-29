/**
 * Staff management routes.
 *
 * Every one is OWNER or MANAGER. The finer restrictions on what a manager may
 * do to an owner are not expressible as a role list, so they live in
 * services/userPermissionService.js and run inside the controller.
 *
 * Middleware order is docs/CONVENTIONS.md section 8:
 * authenticate, tenant, permission, validate, controller.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import {
  createUser,
  getUser,
  listUsers,
  resetUserPassword,
  setUserPin,
  updateStatus,
  updateUser,
} from '../controllers/userController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  createUserSchema,
  listUsersSchema,
  readUserSchema,
  resetPasswordSchema,
  setPinSchema,
  updateStatusSchema,
  updateUserSchema,
} from '../validators/userValidators.js';

const router = Router();

const staffAdmin = [authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER)];

router.post('/users', ...staffAdmin, validate(createUserSchema), createUser);
router.get('/users', ...staffAdmin, validate(listUsersSchema), listUsers);
router.get('/users/:userId', ...staffAdmin, validate(readUserSchema), getUser);
router.patch('/users/:userId', ...staffAdmin, validate(updateUserSchema), updateUser);
router.patch('/users/:userId/status', ...staffAdmin, validate(updateStatusSchema), updateStatus);
router.patch('/users/:userId/password', ...staffAdmin, validate(resetPasswordSchema), resetUserPassword);
router.patch('/users/:userId/pin', ...staffAdmin, validate(setPinSchema), setUserPin);

// There is no DELETE. Deactivation replaces it, so M5 attendance history keeps
// a user record to link to.

export default router;
