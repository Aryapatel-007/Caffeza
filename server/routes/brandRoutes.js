/**
 * The restaurant's logo. P22, docs/API-CONTRACT.md M20 section P22.
 *
 * Setting and removing are OWNER only, the same rule as every other change to
 * the restaurant's look. Reading is every role, because every screen draws the
 * logo; the restaurant is the one in the token.
 *
 * The upload is the one route with a JSON body larger than 100 KB: a 200 KB
 * image is about 273 KB as base64. server.js leaves this one path to the parser
 * below and keeps 100 KB for everything else.
 *
 * Middleware order is docs/CONVENTIONS.md section 8.
 */
import express, { Router } from 'express';

import { ROLES } from '../config/roles.js';
import { deleteLogo, getLogo, putLogo } from '../controllers/brandController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { deleteLogoSchema, getLogoSchema, putLogoSchema } from '../validators/brandValidators.js';

/** The upload path, matched before the general body parser runs. */
export const LOGO_UPLOAD_PATH = /^\/api\/v1\/settings\/appearance\/logo\/[^/]+\/?$/;
export const LOGO_UPLOAD_BODY_LIMIT = '400kb';

const router = Router();

// Parsed after the owner check, so nobody else can make the server read 400 KB.
const uploadBody = express.json({ limit: LOGO_UPLOAD_BODY_LIMIT });
const smallBody = express.json({ limit: '100kb' });
const ownerOnly = [authenticate, tenant, requireRole(ROLES.OWNER)];

router.put('/settings/appearance/logo/:slot', ...ownerOnly, uploadBody, validate(putLogoSchema), putLogo);

router.delete('/settings/appearance/logo/:slot', ...ownerOnly, smallBody, validate(deleteLogoSchema), deleteLogo);

router.get('/restaurant/logo/:slot', authenticate, tenant, validate(getLogoSchema), getLogo);

export default router;
