/**
 * Staff endpoints for online takeaway and bookings. P23 (M14),
 * API-CONTRACT M14 section 3 and its permission summary.
 *
 * authenticate, tenant, requireFeature('online'), permission, validate,
 * controller.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import {
  acceptOnlineOrder,
  cancelReservation,
  confirmReservation,
  createReservation,
  declineOnlineOrder,
  declineReservation,
  getInbox,
  getOnlineOrder,
  getReservation,
  listOnlineOrders,
  listReservations,
  noShowReservation,
  pause,
  resume,
  seatReservation,
  updateSite,
} from '../controllers/onlineController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  acceptOnlineOrderSchema,
  cancelReservationSchema,
  confirmReservationSchema,
  createPhoneReservationSchema,
  declineSchema,
  inboxSchema,
  listOnlineOrdersSchema,
  listReservationsSchema,
  noShowSchema,
  onlineIdSchema,
  pauseSchema,
  resumeSchema,
  seatReservationSchema,
  siteSchema,
} from '../validators/onlineValidators.js';

const router = Router();

const online = [authenticate, tenant, requireFeature('online')];
const { OWNER, MANAGER, CASHIER, WAITER } = ROLES;

/** Reading the inbox and lists, and seating a booking: everyone on the floor. */
const floor = [...online, requireRole(OWNER, MANAGER, CASHIER, WAITER)];
/** Deciding: the till. */
const till = [...online, requireRole(OWNER, MANAGER, CASHIER)];

router.get('/online/inbox', ...floor, validate(inboxSchema), getInbox);

router.get('/online/orders', ...floor, validate(listOnlineOrdersSchema), listOnlineOrders);
router.get('/online/orders/:id', ...floor, validate(onlineIdSchema), getOnlineOrder);
router.post('/online/orders/:id/accept', ...till, validate(acceptOnlineOrderSchema), acceptOnlineOrder);
router.post('/online/orders/:id/decline', ...till, validate(declineSchema), declineOnlineOrder);

router.get('/online/reservations', ...floor, validate(listReservationsSchema), listReservations);
router.post('/online/reservations', ...till, validate(createPhoneReservationSchema), createReservation);
router.get('/online/reservations/:id', ...floor, validate(onlineIdSchema), getReservation);
router.post('/online/reservations/:id/confirm', ...till, validate(confirmReservationSchema), confirmReservation);
router.post('/online/reservations/:id/decline', ...till, validate(declineSchema), declineReservation);
router.post('/online/reservations/:id/seat', ...floor, validate(seatReservationSchema), seatReservation);
router.post('/online/reservations/:id/no-show', ...till, validate(noShowSchema), noShowReservation);
router.post('/online/reservations/:id/cancel', ...till, validate(cancelReservationSchema), cancelReservation);

router.post('/online/pause', ...till, validate(pauseSchema), pause);
router.post('/online/resume', ...till, validate(resumeSchema), resume);

// The page address is the owner's, like every setting. The feature switch is
// not required here, so an owner can set the address before switching it on.
router.patch('/online/site', authenticate, tenant, requireRole(OWNER), validate(siteSchema), updateSite);

export default router;
