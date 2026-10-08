/**
 * Online payment and dish photos. P24, API-CONTRACT M14 sections 4 and 5.
 *
 * The photo upload parses its own larger body, after the role check, like the
 * logo upload: nobody else can make the server read 450 KB.
 */
import express, { Router } from 'express';

import { ROLES } from '../config/roles.js';
import {
  deleteGateway,
  deletePhoto,
  getGateway,
  getPhoto,
  postApplyAdvance,
  postRetryRefund,
  putGateway,
  putPhoto,
} from '../controllers/paymentController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  applyAdvanceSchema,
  connectGatewaySchema,
  disconnectGatewaySchema,
  getGatewaySchema,
  photoSchema,
  putPhotoSchema,
  retryRefundSchema,
} from '../validators/paymentValidators.js';

/** The photo upload path, matched before the general body parser runs. */
export const PHOTO_UPLOAD_PATH = /^\/api\/v1\/menu-items\/[^/]+\/photo\/?$/;
export const PHOTO_UPLOAD_BODY_LIMIT = '450kb';

const router = Router();
const { OWNER, MANAGER, CASHIER } = ROLES;
const signedIn = [authenticate, tenant];
const smallBody = express.json({ limit: '100kb' });

router.get('/settings/payments/gateway', ...signedIn, requireRole(OWNER), validate(getGatewaySchema), getGateway);
router.put('/settings/payments/gateway', ...signedIn, requireRole(OWNER), validate(connectGatewaySchema), putGateway);
router.delete('/settings/payments/gateway', ...signedIn, requireRole(OWNER), validate(disconnectGatewaySchema), deleteGateway);

router.post('/bills/:billId/apply-advance', ...signedIn, requireRole(OWNER, MANAGER, CASHIER), validate(applyAdvanceSchema), postApplyAdvance);
router.post(
  '/online/payments/:id/refund',
  ...signedIn,
  requireFeature('online'),
  requireRole(OWNER, MANAGER),
  validate(retryRefundSchema),
  postRetryRefund,
);

router.put(
  '/menu-items/:itemId/photo',
  ...signedIn,
  requireRole(OWNER, MANAGER),
  express.json({ limit: PHOTO_UPLOAD_BODY_LIMIT }),
  validate(putPhotoSchema),
  putPhoto,
);
router.delete('/menu-items/:itemId/photo', ...signedIn, requireRole(OWNER, MANAGER), smallBody, validate(photoSchema), deletePhoto);
router.get('/menu-items/:itemId/photo', ...signedIn, validate(photoSchema), getPhoto);

export default router;
