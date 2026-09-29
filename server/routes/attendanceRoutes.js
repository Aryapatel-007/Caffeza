/**
 * Employee attendance routes.
 *
 * The clock endpoints are open to all six roles: every staff member clocks
 * their own shift. The register, corrections and summary are OWNER and MANAGER
 * only. The one rule that binds everyone, self-correction, is a 422 business
 * rule in the service, not a role check here.
 *
 * Middleware order is docs/CONVENTIONS.md section 8:
 * authenticate, tenant, permission, validate, controller.
 *
 * `POST /attendance/station/clock` is the shared-tablet PIN path. Any signed-in
 * session may reach it (it is the tablet's session); the PIN in the body is
 * what decides whose shift is written, checked by `authService.verifyPin`.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import {
  clockInSelf,
  clockOutSelf,
  correctEntry,
  createEntry,
  getMyAttendance,
  getSummary,
  listRegister,
  listUserHistory,
  stationClock,
  voidEntry,
} from '../controllers/attendanceController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  correctEntrySchema,
  createEntrySchema,
  registerSchema,
  stationClockSchema,
  summarySchema,
  userHistorySchema,
  voidEntrySchema,
} from '../validators/attendanceValidators.js';

const router = Router();

/** Every staff member. Clocking your own shift and reading your own hours. */
const anySignedIn = [
  authenticate,
  tenant,
  requireRole(
    ROLES.OWNER,
    ROLES.MANAGER,
    ROLES.CASHIER,
    ROLES.WAITER,
    ROLES.KITCHEN,
    ROLES.STOREKEEPER,
  ),
];

/** The register, corrections and the summary. */
const attendanceAdmin = [authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER)];

// Self-service. No params, query or body, so no validate().
router.post('/attendance/clock-in', ...anySignedIn, clockInSelf);
router.post('/attendance/clock-out', ...anySignedIn, clockOutSelf);
router.get('/attendance/me', ...anySignedIn, getMyAttendance);

// The shared tablet. The tablet's session gets in; the PIN in the body decides
// whose shift is written.
router.post(
  '/attendance/station/clock',
  ...anySignedIn,
  validate(stationClockSchema),
  stationClock,
);

// Manager reads and writes.
router.get('/attendance/summary', ...attendanceAdmin, validate(summarySchema), getSummary);
router.get('/attendance', ...attendanceAdmin, validate(registerSchema), listRegister);
router.get(
  '/users/:userId/attendance',
  ...attendanceAdmin,
  validate(userHistorySchema),
  listUserHistory,
);
router.post('/attendance', ...attendanceAdmin, validate(createEntrySchema), createEntry);
router.patch('/attendance/:entryId', ...attendanceAdmin, validate(correctEntrySchema), correctEntry);
router.patch(
  '/attendance/:entryId/void',
  ...attendanceAdmin,
  validate(voidEntrySchema),
  voidEntry,
);

// There is no DELETE. A wrong entry is voided with a reason and a user.

export default router;
