/**
 * Staff management request schemas.
 *
 * Built on the primitives in common.js and the frozen role list. Nothing here
 * writes out the six roles by hand: an enum typed twice is an enum that goes
 * out of step.
 */
import { z } from 'zod';

import { ROLE_VALUES } from '../config/roles.js';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './authValidators.js';
import { nonEmptyString, objectId, paginationQuery, phoneIndia } from './common.js';

const MAX_NAME_LENGTH = 100;
const MAX_SEARCH_LENGTH = 100;

const name = nonEmptyString.max(MAX_NAME_LENGTH, `Cannot be longer than ${MAX_NAME_LENGTH} characters.`);

const role = z.enum(ROLE_VALUES, { error: 'Is not one of the roles this system has.' });

/** Optional, and genuinely optional: null clears it. */
const email = z
  .union([
    z.string().trim().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Must be an email address.'),
    z.null(),
  ])
  .optional();

/**
 * Not trimmed, and not nonEmptyString, which trims. A leading or trailing
 * space is a legitimate character in a password, and quietly removing one
 * locks the user out of an account they typed correctly.
 */
const password = z
  .string({ error: 'Is required.' })
  .min(MIN_PASSWORD_LENGTH, `Must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, `Cannot be longer than ${MAX_PASSWORD_LENGTH} characters.`);

const userIdParam = z.object({ userId: objectId });

export const createUserSchema = z.object({
  body: z
    .object({
      name,
      phone: phoneIndia,
      email,
      role,
      password,
    })
    .strict('Is not a field you can set here.'),
});

export const listUsersSchema = z.object({
  query: paginationQuery.extend({
    role: role.optional(),
    /**
     * Arrives as the string "true" or "false" from a query string, so it is
     * matched literally rather than coerced. z.coerce.boolean() would turn
     * "false" into true, which is the wrong answer in the most confusing way.
     */
    isActive: z
      .enum(['true', 'false'], { error: 'Must be true or false.' })
      .transform((value) => value === 'true')
      .optional(),
    search: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
  }),
});

export const readUserSchema = z.object({ params: userIdParam });

/**
 * Three fields are updatable and the rest are refused rather than ignored.
 *
 * `phone` is the login identity and is globally unique, so changing it is a new
 * user record plus a deactivation, not an edit. `isActive` and `password` each
 * have their own endpoint, with their own rules. Silently dropping any of them
 * would let a caller believe a change landed when it did not.
 */
export const updateUserSchema = z.object({
  params: userIdParam,
  body: z
    .object({
      name: name.optional(),
      email,
      role: role.optional(),
      phone: z.never({ error: 'Cannot be changed. A phone number identifies the account.' }).optional(),
      isActive: z.never({ error: 'Has its own endpoint: PATCH /users/:userId/status' }).optional(),
      password: z.never({ error: 'Has its own endpoint: PATCH /users/:userId/password' }).optional(),
    })
    .strict('Is not a field you can change here.')
    .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change.'),
});

export const updateStatusSchema = z.object({
  params: userIdParam,
  body: z
    .object({ isActive: z.boolean({ error: 'Must be true or false.' }) })
    .strict('Is not a field you can set here.'),
});

export const resetPasswordSchema = z.object({
  params: userIdParam,
  // No current password. This is a manager resetting for someone who forgot.
  body: z.object({ newPassword: password }).strict('Is not a field you can set here.'),
});

/**
 * The shared-tablet attendance PIN. 4 to 6 digits.
 *
 * Trimmed, unlike a password: a PIN is digits, and a stray space is a typo, not
 * a character someone meant.
 */
const pin = z
  .string({ error: 'Is required.' })
  .trim()
  .regex(/^\d{4,6}$/, 'Must be 4 to 6 digits.');

export const setPinSchema = z.object({
  params: userIdParam,
  body: z.object({ pin }).strict('Is not a field you can set here.'),
});
