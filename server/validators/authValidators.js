/**
 * Auth request schemas.
 *
 * Built on the primitives in common.js. Nothing here reimplements phoneIndia
 * or nonEmptyString.
 */
import { z } from 'zod';

import { email, phoneIndia } from './common.js';

/**
 * Password rules for version 1: length only.
 *
 * No complexity requirement, no forced symbol. Length is what actually
 * resists guessing, and a rule demanding a capital and a digit pushes staff
 * toward writing the password on a sticky note by the till, which is a worse
 * outcome than a long simple one.
 *
 * Deliberately NOT trimmed, and deliberately not using nonEmptyString, which
 * trims. A leading or trailing space is a legitimate character in a password
 * and silently removing it locks the user out of an account they typed
 * correctly.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

const password = z
  .string({ error: 'Is required.' })
  .min(MIN_PASSWORD_LENGTH, `Must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, `Cannot be longer than ${MAX_PASSWORD_LENGTH} characters.`);

/**
 * Login takes exactly one identity, `phone` or `email`, plus the password.
 *
 * Both are optional in the shape and the refinement enforces the "exactly one"
 * rule, so a body with both, or neither, is a 400 rather than a confusing
 * partial match.
 */
export const loginSchema = z.object({
  body: z
    .object({
      phone: phoneIndia.optional(),
      email: email.optional(),
      password,
    })
    .refine((body) => Boolean(body.phone) !== Boolean(body.email), {
      error: 'Send exactly one of phone or email.',
      path: ['phone'],
    }),
});

/**
 * There is no schema for /auth/refresh or /auth/logout. Both take no body: the
 * refresh token is an httpOnly cookie the browser sends on its own, read in
 * controllers/authController.js. The `X-Requested-With` header those endpoints
 * require is checked by middleware/requireCsrfHeader.js, not here.
 */

/**
 * Changing your own password.
 *
 * Note what is NOT here: the check that newPassword differs from
 * currentPassword. docs/API-CONTRACT.md section 1.6 requires 422
 * BUSINESS_RULE_VIOLATED for that case, and every failure raised inside a Zod
 * schema comes back as 400 VALIDATION_FAILED through the validate middleware.
 * The comparison is a business rule, not a shape problem, so it lives in the
 * controller where it can throw the right status.
 */
export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: password,
    newPassword: password,
  }),
});
