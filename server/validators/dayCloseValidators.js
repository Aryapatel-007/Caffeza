/**
 * Cash drawer and Day Close request schemas. P10. Shapes from
 * docs/API-CONTRACT.md "M16" sections 3 and 6.
 *
 * No request sets a cash entry's business date: the server takes today's.
 */
import { z } from 'zod';

import { CASH_MOVEMENT_TYPE_VALUES } from '../models/CashMovement.js';
import { approval, businessDate, nonEmptyString, objectId, paise } from './common.js';

/** P25 Part F. A count by notes and coins. The server totals it; kind is needed only for ₹20 and ₹10. */
export const cashCount = z
  .array(
    z
      .object({
        valueInPaise: z.number({ error: 'Must be a whole number of paise.' }).int('Must be a whole number of paise.').min(1),
        kind: z.enum(['NOTE', 'COIN'], { error: 'Must be NOTE or COIN.' }).optional(),
        count: z.number({ error: 'Must be a whole number.' }).int('Must be a whole number.').min(0, 'Cannot be negative.').max(10_000),
      })
      .strict('Is not a field you can set here.'),
  )
  .max(40);

const reason = nonEmptyString.max(200, 'Cannot be longer than 200 characters.');

export const listCashSchema = z.object({
  query: z.object({ date: businessDate.optional() }).strict('Is not a filter on the cash drawer.'),
});

export const recordCashSchema = z.object({
  body: z
    .object({
      type: z.enum(CASH_MOVEMENT_TYPE_VALUES, { error: 'Must be OPENING_FLOAT, PAID_IN or PAID_OUT.' }),
      amountInPaise: paise.refine((value) => value > 0, 'Must be more than zero.').optional(),
      reason: reason.optional(),
      cashCount: cashCount.optional(),
      approval: approval.optional(),
    })
    .strict('Is not a field you can set here. The business date is always today.')
    .superRefine((body, context) => {
      if (body.cashCount && body.type !== 'OPENING_FLOAT') {
        context.addIssue({ code: 'custom', path: ['cashCount'], message: 'Only the opening float is counted by notes.' });
      }
      if (body.amountInPaise === undefined && !body.cashCount) {
        context.addIssue({ code: 'custom', path: ['amountInPaise'], message: 'Is required.' });
      }
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
      countedCashInPaise: paise.optional(),
      cashCount: cashCount.optional(),
      note: z
        .union([z.string().trim().max(500, 'Cannot be longer than 500 characters.'), z.null()])
        .optional()
        .transform((value) => (value === '' || value === undefined ? null : value)),
    })
    .strict('Is not a field you can set here.')
    .refine((body) => body.countedCashInPaise !== undefined || body.cashCount, {
      path: ['countedCashInPaise'],
      message: 'Give the counted cash, or count it by notes and coins.',
    }),
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
