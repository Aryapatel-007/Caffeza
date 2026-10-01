/**
 * Cash drawer and Day Close request schemas. P10. Shapes from
 * docs/API-CONTRACT.md "M16" sections 3 and 6.
 *
 * No request sets a cash entry's business date: the server takes today's.
 */
import { z } from 'zod';

import { CASH_MOVEMENT_TYPE_VALUES } from '../models/CashMovement.js';
import { businessDate, nonEmptyString, objectId, paise } from './common.js';

const reason = nonEmptyString.max(200, 'Cannot be longer than 200 characters.');

export const listCashSchema = z.object({
  query: z.object({ date: businessDate.optional() }).strict('Is not a filter on the cash drawer.'),
});

export const recordCashSchema = z.object({
  body: z
    .object({
      type: z.enum(CASH_MOVEMENT_TYPE_VALUES, { error: 'Must be OPENING_FLOAT, PAID_IN or PAID_OUT.' }),
      amountInPaise: paise.refine((value) => value > 0, 'Must be more than zero.'),
      reason: reason.optional(),
    })
    .strict('Is not a field you can set here. The business date is always today.')
    .superRefine((body, context) => {
      if (body.type !== 'OPENING_FLOAT' && !body.reason) {
        context.addIssue({ code: 'custom', path: ['reason'], message: 'Say what the cash was for.' });
      }
    }),
});

export const voidCashSchema = z.object({
  params: z.object({ movementId: objectId }),
  body: z.object({ reason }).strict('Is not a field you can set here.'),
});

export const closeDaySchema = z.object({
  body: z
    .object({
      businessDate,
      countedCashInPaise: paise,
      note: z
        .union([z.string().trim().max(500, 'Cannot be longer than 500 characters.'), z.null()])
        .optional()
        .transform((value) => (value === '' || value === undefined ? null : value)),
    })
    .strict('Is not a field you can set here.'),
});

const dateParam = z.object({ businessDate });

export const readDaySchema = z.object({ params: dateParam });

export const listDaysSchema = z.object({
  query: z.object({ from: businessDate.optional(), to: businessDate.optional() }).strict(),
});

export const printDaySchema = z.object({
  params: dateParam,
  query: z.object({
    width: z
      .enum(['32', '48'], { error: 'Must be 32 (58mm paper) or 48 (80mm).' })
      .default('32')
      .transform(Number),
  }),
});

export const reopenDaySchema = z.object({
  params: dateParam,
  body: z.object({ reason }).strict('Is not a field you can set here.'),
});
