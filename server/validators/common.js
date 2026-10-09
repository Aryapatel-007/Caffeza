/**
 * Reusable validation primitives.
 *
 * Zod, everywhere, no exceptions. One library means one error shape, and one
 * error shape means the client can handle failure in one place.
 *
 * Validation runs in middleware, before the controller. A controller can
 * assume its input is already clean. Nothing in here is a convenience for the
 * user, that is what the React form is for. This is the edge that keeps a
 * negative price or a quantity of ten million out of the database.
 */
import mongoose from 'mongoose';
import { z } from 'zod';

import { OTHER_REASON_CODE } from '../config/cancelReasons.js';

import { MAX_PAISE } from '../utils/money.js';

export const MAX_BASIS_POINTS = 10_000;
export const MAX_QUANTITY_DECIMAL_PLACES = 6;

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/**
 * A Mongo ObjectId, as a string.
 *
 * isValid() alone is not enough: it accepts any 12 character string, so
 * "restaurant01" passes. Round-tripping it rejects everything that is not
 * really an id, before it touches the database.
 */
export const objectId = z
  .string()
  .trim()
  .refine((value) => {
    if (!mongoose.Types.ObjectId.isValid(value)) return false;
    return new mongoose.Types.ObjectId(value).toString() === value;
  }, 'Must be a valid id.');

/**
 * Money. A whole number of paise, never a decimal, never a string.
 *
 * z.number() rejects "9999" on its own, which is the point. If a string
 * reaches this validator, some client is doing arithmetic on a decimal
 * somewhere upstream and we want to hear about it now.
 */
export const paise = z
  .number({ error: 'Must be a whole number of paise.' })
  .int('Must be a whole number of paise, not a decimal.')
  .min(0, 'Cannot be negative.')
  .max(MAX_PAISE, `Cannot be more than ${MAX_PAISE} paise.`);

/** A rate in basis points. Five percent is 500. Eighteen percent is 1800. */
export const basisPoints = z
  .number({ error: 'Must be a whole number of basis points.' })
  .int('Must be a whole number. Five percent is 500, eighteen percent is 1800.')
  .min(0, 'Cannot be negative.')
  .max(MAX_BASIS_POINTS, 'Cannot be more than 10000, which is one hundred percent.');

function decimalPlaces(value) {
  const text = String(value);
  // Exponent notation carries more precision than we will ever store.
  if (text.includes('e') || text.includes('E')) return Number.POSITIVE_INFINITY;
  const point = text.indexOf('.');
  return point === -1 ? 0 : text.length - point - 1;
}

/**
 * A quantity. Greater than zero, at most six decimal places.
 *
 * Six is enough for a gram expressed in kilograms, which is the smallest unit
 * this system realistically handles.
 */
export const quantity = z
  .number({ error: 'Must be a number.' })
  .refine(Number.isFinite, 'Must be a real number.')
  .refine((value) => value > 0, 'Must be greater than zero.')
  .refine(
    (value) => decimalPlaces(value) <= MAX_QUANTITY_DECIMAL_PLACES,
    `Cannot have more than ${MAX_QUANTITY_DECIMAL_PLACES} decimal places.`,
  );

/** A required string. Trimmed first, because a space is not a value. */
export const nonEmptyString = z.string({ error: 'Is required.' }).trim().min(1, 'Cannot be empty.');

/**
 * A boolean that arrived in a query string.
 *
 * Matched literally rather than coerced. `z.coerce.boolean()` turns the string
 * "false" into `true`, which is the wrong answer in the most confusing possible
 * way. Logged as a decision in docs/PROJECT-STATE.md from M0-C. M1 kept a local
 * copy; M5 is the second module to need it, so it lives here now.
 */
export const queryBoolean = z
  .enum(['true', 'false'], { error: 'Must be true or false.' })
  .default('false')
  .transform((value) => value === 'true');

/**
 * A "YYYY-MM-DD" business date, checked to be a real calendar day.
 *
 * Not a `Date`. A business day is a label, not an instant: DB-SCHEMA section 7
 * explains why it is stored as a string, and the same reasoning applies to the
 * query parameters that filter on it. "2026-02-30" matches the shape and is not
 * a day, so the refinement round-trips it rather than trusting the regex.
 *
 * Shared because M5 filters attendance by it and M3 filters bills by it. It
 * started as a private copy in menuValidators-style, and a second copy is how
 * one drifts, the same reasoning that moved `queryBoolean` here.
 */
export const businessDate = z
  .string({ error: 'Is required.' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date like 2026-08-29.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Must be a real calendar date.');

/**
 * An email address. Trimmed and lowercased, so uniqueness is case-insensitive
 * without a collation index. The check is deliberately loose: something before
 * an `@`, something after, a dot in the domain. Anything stricter rejects valid
 * addresses for no real gain.
 */
export const email = z
  .string({ error: 'Is required.' })
  .trim()
  .toLowerCase()
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Must be an email address.');

const withFallback = (fallback) => (value) =>
  value === undefined || value === null || value === '' ? fallback : value;

/**
 * Paging, for every list endpoint.
 *
 * A limit above the maximum is clamped to 200, not rejected. Someone asking
 * for 1000 rows wants as many as they can get, and failing their request
 * teaches them nothing they can act on.
 */
export const paginationQuery = z.object({
  page: z.preprocess(
    withFallback(DEFAULT_PAGE),
    z.coerce
      .number({ error: 'Must be a number.' })
      .int('Must be a whole number.')
      .min(1, 'Must be 1 or more.'),
  ),
  limit: z
    .preprocess(
      withFallback(DEFAULT_PAGE_SIZE),
      z.coerce
        .number({ error: 'Must be a number.' })
        .int('Must be a whole number.')
        .min(1, 'Must be 1 or more.'),
    )
    .transform((value) => Math.min(value, MAX_PAGE_SIZE)),
});

/**
 * An Indian mobile number. Ten digits, first digit 6 to 9.
 *
 * Spaces, dashes and brackets are stripped, and so is a leading +91 or 91, but
 * only when the length says it really is a country code. 9198765432 is a valid
 * ten digit number that happens to start with 91, and trimming it would turn a
 * good number into a rejected one.
 *
 * Stored as ten bare digits. Formatting is a display concern.
 *
 * The normaliser is exported on its own because the login rate limiter keys on
 * the submitted number. If the limiter saw the raw string, rewriting
 * "9876543210" as "+91 9876543210" would look like a different account and
 * hand the attacker a fresh set of attempts.
 */
export function normalisePhoneIndia(value) {
  if (typeof value !== 'string') return value;

  let digits = value.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+91') && digits.length === 13) digits = digits.slice(3);
  else if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  return digits;
}

export const phoneIndia = z.preprocess(
  normalisePhoneIndia,
  z.string({ error: 'Is required.' }).regex(/^[6-9]\d{9}$/, 'Must be a 10 digit Indian mobile number.'),
);

/**
 * A fixed reason code plus an optional note. P04.
 *
 * Free text cannot be grouped: "wrong item", "Wrong Item" and "wrng itm" are
 * three rows in a cancellations report for one reason. The note is still there
 * for the detail, and is required when the code is OTHER, because "Other" on
 * its own explains nothing.
 *
 * The old `reason` field is not accepted. `.strict()` on the body refuses it.
 */
export function reasonFields(codes, noteMaxLength) {
  return {
    reasonCode: z.enum(codes, {
      error: `Must be one of: ${codes.join(', ')}.`,
    }),
    note: z
      .string({ error: 'Must be text.' })
      .trim()
      .max(noteMaxLength, `Cannot be longer than ${noteMaxLength} characters.`)
      .nullable()
      .optional()
      .transform((value) => (value === '' || value === undefined ? null : value)),
  };
}

/**
 * P28. An owner's or manager's approval, typed on someone else's screen. The
 * server decides whether one is needed; sending one when it is not is harmless.
 */
export const approval = z
  .object({
    approverId: objectId,
    pin: z.string({ error: 'Must be text.' }).trim().regex(/^\d{4,6}$/, 'A PIN is 4 to 6 digits.'),
  })
  .strict('Is not a field you can set here.');

/** A note is required with OTHER. Added to a body schema with .superRefine. */
export function requireNoteForOther(body, context) {
  if (body.reasonCode === OTHER_REASON_CODE && !body.note) {
    context.addIssue({
      code: 'custom',
      path: ['note'],
      message: 'Say what happened. A note is required when the reason is Other.',
    });
  }
}
