/**
 * Authentication routes.
 *
 * Middleware order is the one in docs/CONVENTIONS.md section 8:
 * rate limiter, authenticate, tenant, permission, validate, controller.
 */
import { Router } from 'express';

import {
  changePassword,
  login,
  logout,
  logoutAll,
  me,
  refresh,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authLimiter, refreshLimiter } from '../middleware/rateLimit.js';
import { requireCsrfHeader } from '../middleware/requireCsrfHeader.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { changePasswordSchema, loginSchema } from '../validators/authValidators.js';

const router = Router();

// Public. The strict limiter keys on IP plus the submitted phone, hashed.
router.post('/auth/login', authLimiter, validate(loginSchema), login);

/**
 * Public. The credential is the `refreshToken` cookie, sent by the browser.
 * No body. `requireCsrfHeader` rejects a request without `X-Requested-With`,
 * which a cross-site page cannot set on the browser's automatic cookie send.
 *
 * Its own limiter, refreshLimiter, since 2 October 2026: sharing the login
 * limiter signed whole cafes out (see middleware/rateLimit.js). It counts only
 * refreshes with a cookie the server refuses, per address, and still bounds a
 * brute force against a 64 byte random token, which is not a realistic target.
 */
router.post('/auth/refresh', refreshLimiter, requireCsrfHeader, refresh);

// Authenticated. Any role.
router.post('/auth/logout', authenticate, tenant, requireCsrfHeader, logout);
router.post('/auth/logout-all', authenticate, tenant, logoutAll);
router.get('/auth/me', authenticate, tenant, me);
router.patch('/auth/password', authenticate, tenant, validate(changePasswordSchema), changePassword);

export default router;
