/**
 * Attendance request schemas.
 *
 * Business rules are not here. A Zod refinement always surfaces as a 400
 * through the validate middleware, and rules like "that entry is voided" or
 * "clock-out is before clock-in" have to be 422, so they are thrown in
 * services/attendanceService.js instead.
 *
 * The clock-in, clock-out and "my attendance" routes take no params, query or
 * body, so they skip validate() entirely, the same as GET /restaurant.
 */
import { z } from 'zod';

import { REASON_MAX_LENGTH } from '../models/AttendanceEntry.js';
import { businessDate, nonEmptyString, objectId, paginationQuery, queryBoolean } from './common.js';

/**
 * An ISO 8601 instant with a time component, parsed to a Date.
 *
 * A bare "2026-08-29" is rejected: a manager reconstructing a shift has to say
 * what time it started, not just which day.
 */
const isoInstant = z
  .string({ error: 'Is required.' })
  .trim()
  .refine(
    (value) => /t\d{2}:\d{2}/i.test(value) && !Number.isNaN(Date.parse(value)),
    'Must be an ISO 8601 date-time, for example 2026-08-29T09:14:00.000Z.',
  )
  .transform((value) => new Date(value));

const reason = nonEmptyString.max(
  REASON_MAX_LENGTH,
  `Cannot be longer than ${REASON_MAX_LENGTH} characters.`,
);

const entryIdParam = z.object({ entryId: objectId });
const userIdParam = z.object({ userId: objectId });

/**
 * POST /attendance/station/clock
 *
 * The tablet's session authenticates the request; the PIN authenticates whose
 * shift is written. A wrong PIN, a user with no PIN and an unknown user all come
 * back the same from the service, so nothing here distinguishes them beyond the
 * 4-to-6-digit shape a PIN pad can only ever produce.
 */
export const stationClockSchema = z.object({
  body: z
    .object({
      userId: objectId,
      pin: z
        .string({ error: 'Is required.' })
        .trim()
        .regex(/^\d{4,6}$/, 'Must be 4 to 6 digits.'),
      action: z.enum(['clock', 'undo']).default('clock'),
    })
    .strict('Is not a field you can set here.'),
});

/**
 * GET /attendance
 *
 * `from` and `to` are optional and default to today in the controller.
 * `openOnly` ignores the range and returns every open shift.
 */
export const registerSchema = z.object({
  query: paginationQuery.extend({
    from: businessDate.optional(),
    to: businessDate.optional(),
    openOnly: queryBoolean,
    includeVoided: queryBoolean,
  }),
});

/** GET /users/:userId/attendance */
export const userHistorySchema = z.object({
  params: userIdParam,
  query: paginationQuery.extend({
    from: businessDate.optional(),
    to: businessDate.optional(),
  }),
});

/**
 * POST /attendance
 *
 * `clockOutAt` optional: omit it to create an already-open shift. `reason`
 * required and never defaulted to "".
 */
export const createEntrySchema = z.object({
  body: z
    .object({
      userId: objectId,
      clockInAt: isoInstant,
      clockOutAt: isoInstant.optional(),
      reason,
    })
    .strict('Is not a field you can set here.'),
});

/**
 * PATCH /attendance/:entryId
 *
 * At least one of clockInAt / clockOutAt, plus a reason. `workedMinutes`,
 * `businessDate` and the source fields are not settable: they are derived.
 */
export const correctEntrySchema = z.object({
  params: entryIdParam,
  body: z
    .object({
      clockInAt: isoInstant.optional(),
      clockOutAt: isoInstant.optional(),
      reason,
    })
    .strict('Is not a field you can change here.')
    .refine(
      (body) => body.clockInAt !== undefined || body.clockOutAt !== undefined,
      { error: 'Send clockInAt or clockOutAt to change.', path: ['clockInAt'] },
    ),
});

/** PATCH /attendance/:entryId/void */
export const voidEntrySchema = z.object({
  params: entryIdParam,
  body: z.object({ reason }).strict('Is not a field you can set here.'),
});

/** GET /attendance/summary. Both dates required; not paginated. */
export const summarySchema = z.object({
  query: z.object({
    from: businessDate,
    to: businessDate,
  }),
});
