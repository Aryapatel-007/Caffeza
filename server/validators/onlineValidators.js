/**
 * Request schemas for M14, online takeaway and bookings. P23.
 *
 * The public schemas are stricter than any staff schema: a guest's browser is
 * the least trusted caller in the product. Every string is trimmed and capped,
 * every list is capped, and an unknown field is a 400.
 */
import { z } from 'zod';

import { DECLINE_OTHER_CODE, DECLINE_REASON_CODES } from '../config/onlineReasons.js';
import { GUEST_NAME_MAX_LENGTH, REQUEST_NOTE_MAX_LENGTH } from '../models/OnlineOrder.js';
import { businessDate, nonEmptyString, objectId, paginationQuery, phoneIndia, queryBoolean } from './common.js';

export const PUBLIC_MAX_LINES = 30;
export const PUBLIC_MAX_QUANTITY = 20;
const LINE_NOTES_MAX_LENGTH = 200;

/** A page address: lowercase letters, digits and single dashes, 3 to 40. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RESERVED_SLUGS = Object.freeze(['api', 'admin', 'login', 'r', 'static', 'assets', 'www']);

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(40)
  .regex(SLUG_PATTERN);

const slugParams = z.object({ slug }).passthrough();
const slugAndId = z.object({ slug, id: objectId }).strict();

const guestName = nonEmptyString.max(GUEST_NAME_MAX_LENGTH, `Cannot be longer than ${GUEST_NAME_MAX_LENGTH} characters.`);

const note = z
  .string({ error: 'Must be text.' })
  .trim()
  .max(REQUEST_NOTE_MAX_LENGTH, `Cannot be longer than ${REQUEST_NOTE_MAX_LENGTH} characters.`)
  .nullable()
  .optional()
  .transform((value) => (value === '' || value === undefined ? null : value));

/** A UUID from the page, so a double tap or a retry never places twice. */
const idempotencyKey = z.string({ error: 'Is required.' }).trim().uuid('Must be a UUID.');

/**
 * The honeypot. The page hides this field, so a person never fills it. A
 * non-empty value is refused with the same generic message as any bad input.
 */
const honeypot = z.string().max(0, 'Not accepted.').optional();

const publicLine = z
  .object({
    menuItemId: objectId,
    variantId: objectId.optional(),
    addOnIds: z.array(objectId).max(10, 'At most 10 extras.').optional(),
    quantity: z
      .number({ error: 'Must be a number.' })
      .int('Must be a whole number.')
      .min(1, 'Must be at least 1.')
      .max(PUBLIC_MAX_QUANTITY, `Cannot be more than ${PUBLIC_MAX_QUANTITY}.`),
    notes: z
      .string()
      .trim()
      .max(LINE_NOTES_MAX_LENGTH, `Cannot be longer than ${LINE_NOTES_MAX_LENGTH} characters.`)
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
  .strict('Is not a field you can set on a line.');

const publicLines = z
  .array(publicLine, { error: 'Must be a list of items.' })
  .min(1, 'Add at least one item.')
  .max(PUBLIC_MAX_LINES, `At most ${PUBLIC_MAX_LINES} lines.`);

const isoInstant = z
  .string({ error: 'Must be a time.' })
  .datetime({ offset: true, message: 'Must be an ISO time.' })
  .transform((value) => new Date(value));

/* ------------------------------------------------------------------------- *
 * Public
 * ------------------------------------------------------------------------- */

export const publicSiteSchema = z.object({ params: slugParams, query: z.object({}).passthrough() });

export const publicLogoSchema = z.object({
  params: z.object({ slug, slot: z.enum(['LIGHT_GROUND', 'DARK_GROUND']) }).strict(),
});

export const publicQuoteSchema = z.object({
  params: slugParams,
  body: z.object({ lines: publicLines }).strict(),
});

export const publicPlaceOrderSchema = z.object({
  params: slugParams,
  body: z
    .object({
      idempotencyKey,
      customerName: guestName,
      customerPhone: phoneIndia,
      pickup: z.union([z.literal('ASAP'), isoInstant], { error: 'Must be ASAP or a time.' }),
      lines: publicLines,
      note,
      marketingConsent: z.boolean().optional().default(false),
      website: honeypot,
    })
    .strict('Is not a field you can set here.'),
});

export const publicStatusSchema = z.object({ params: slugAndId });

export const publicSlotsSchema = z.object({
  params: slugParams,
  query: z
    .object({
      date: businessDate,
      partySize: z.coerce.number().int().min(1).max(50),
    })
    .strict(),
});

export const publicRequestReservationSchema = z.object({
  params: slugParams,
  body: z
    .object({
      idempotencyKey,
      guestName,
      guestPhone: phoneIndia,
      partySize: z.number({ error: 'Must be a number.' }).int().min(1, 'Must be at least 1.').max(50),
      at: isoInstant,
      note,
      marketingConsent: z.boolean().optional().default(false),
      website: honeypot,
    })
    .strict('Is not a field you can set here.'),
});

/* ------------------------------------------------------------------------- *
 * Staff
 * ------------------------------------------------------------------------- */

const idParams = z.object({ id: objectId }).strict();

const declineBody = z
  .object({
    reasonCode: z.enum(DECLINE_REASON_CODES, { error: `Must be one of: ${DECLINE_REASON_CODES.join(', ')}.` }),
    note,
  })
  .strict()
  .superRefine((body, context) => {
    if (body.reasonCode === DECLINE_OTHER_CODE && !body.note) {
      context.addIssue({ code: 'custom', path: ['note'], message: 'Say why. A note is required when the reason is Other.' });
    }
  });

export const inboxSchema = z.object({ query: z.object({}).strict() });

export const listOnlineOrdersSchema = z.object({
  query: paginationQuery
    .extend({
      status: z.enum(['WAITING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED']).optional(),
      date: businessDate.optional(),
    })
    .strict(),
});

export const onlineIdSchema = z.object({ params: idParams });

export const acceptOnlineOrderSchema = z.object({
  params: idParams,
  body: z
    .object({
      pickupAt: isoInstant.optional(),
      fireNow: z.boolean().optional().default(true),
      acceptChangedPrices: z.boolean().optional().default(false),
    })
    .strict(),
});

export const declineSchema = z.object({ params: idParams, body: declineBody });

export const listReservationsSchema = z.object({
  query: z
    .object({
      date: businessDate.optional(),
      status: z.enum(['REQUESTED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'SEATED', 'NO_SHOW']).optional(),
      openOnly: queryBoolean.optional(),
    })
    .strict(),
});

export const createPhoneReservationSchema = z.object({
  body: z
    .object({
      guestName,
      guestPhone: phoneIndia,
      partySize: z.number().int().min(1).max(50),
      at: isoInstant,
      note,
      tableId: objectId.optional(),
    })
    .strict(),
});

export const confirmReservationSchema = z.object({
  params: idParams,
  body: z.object({ at: isoInstant.optional(), tableId: objectId.optional() }).strict(),
});

export const seatReservationSchema = z.object({
  params: idParams,
  body: z.object({ tableId: objectId, guestCount: z.number().int().min(1).max(100) }).strict(),
});

export const cancelReservationSchema = z.object({
  params: idParams,
  body: z.object({ note: nonEmptyString.max(REQUEST_NOTE_MAX_LENGTH) }).strict(),
});

export const noShowSchema = z.object({ params: idParams, body: z.object({}).strict().optional() });

export const pauseSchema = z.object({
  body: z.union([
    z.object({ minutes: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(120)]) }).strict(),
    z.object({ untilClose: z.literal(true) }).strict(),
  ], { error: 'Send minutes (15, 30, 60 or 120) or untilClose.' }),
});

export const resumeSchema = z.object({ body: z.object({}).strict().optional() });

export const siteSchema = z.object({
  body: z
    .object({
      publicSlug: z.union([
        slug.refine((value) => !RESERVED_SLUGS.includes(value), 'That address is reserved. Choose another.'),
        z.null(),
      ]),
    })
    .strict(),
});
