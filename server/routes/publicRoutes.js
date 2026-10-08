/**
 * The public page. P23 (M14), API-CONTRACT M14 section 2.
 *
 * Never behind `authenticate`. The order on every route: a public limiter,
 * then `resolvePublicSite`, which sets the tenant from the page address, then
 * validation, then the controller. The general limiter skips these paths.
 */
import { Router } from 'express';

import { getLogo } from '../controllers/brandController.js';
import {
  getMenu,
  getOrder,
  getReservation,
  getSite,
  getSlots,
  postCancelOrder,
  postCancelReservation,
  postOrder,
  postQuote,
  postReservation,
} from '../controllers/publicController.js';
import { publicPhoneLimiter, publicReadLimiter, publicWriteLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { resolvePublicSite } from '../services/publicSiteService.js';
import {
  publicLogoSchema,
  publicPlaceOrderSchema,
  publicQuoteSchema,
  publicRequestReservationSchema,
  publicSiteSchema,
  publicSlotsSchema,
  publicStatusSchema,
} from '../validators/onlineValidators.js';

const router = Router();

const read = [publicReadLimiter, resolvePublicSite];
const write = [publicWriteLimiter, resolvePublicSite];
const place = [publicWriteLimiter, publicPhoneLimiter, resolvePublicSite];

router.get('/public/:slug', ...read, validate(publicSiteSchema), getSite);
router.get('/public/:slug/menu', ...read, validate(publicSiteSchema), getMenu);
router.get('/public/:slug/logo/:slot', ...read, validate(publicLogoSchema), getLogo);
// A quote writes nothing, so it counts as a read.
router.post('/public/:slug/quote', ...read, validate(publicQuoteSchema), postQuote);

router.post('/public/:slug/orders', ...place, validate(publicPlaceOrderSchema), postOrder);
router.get('/public/:slug/orders/:id', ...read, validate(publicStatusSchema), getOrder);
router.post('/public/:slug/orders/:id/cancel', ...write, validate(publicStatusSchema), postCancelOrder);

router.get('/public/:slug/reservations/slots', ...read, validate(publicSlotsSchema), getSlots);
router.post('/public/:slug/reservations', ...place, validate(publicRequestReservationSchema), postReservation);
router.get('/public/:slug/reservations/:id', ...read, validate(publicStatusSchema), getReservation);
router.post('/public/:slug/reservations/:id/cancel', ...write, validate(publicStatusSchema), postCancelReservation);

export default router;
