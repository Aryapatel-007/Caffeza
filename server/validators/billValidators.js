/**
 * Request schemas for M3 billing.
 *
 * Shapes come from docs/API-CONTRACT.md sections 14 and 15.
 *
 * The theme of this file is that a client never sends money it worked out
 * itself. It sends what it wants done — bill this order, take this much off,
 * this much was paid — and the server computes every derived figure. There is
 * no endpoint here that accepts a subtotal, a tax amount or a grand total, and
 * `.strict()` on every body is what keeps it that way.
 */
import { z } from 'zod';

import { BILL_VOID_REASON_CODES } from '../config/cancelReasons.js';
import { BILL_STATUS_VALUES, DISCOUNT_KINDS, PAYMENT_METHOD_VALUES } from '../models/Bill.js';
import {
  MAX_BASIS_POINTS,
  businessDate,
  nonEmptyString,
  objectId,
  paginationQuery,
  paise,
  queryBoolean,
  reasonFields,
  requireNoteForOther,
} from './common.js';

const billIdParam = z.object({ billId: objectId });

/** The order's optimistic-concurrency version, sent on every write that moves it. */
const version = z
  .number({ error: 'Is required. Send the version you last read.' })
  .int('Must be a whole number.')
  .min(1, 'Must be 1 or more.');

const reason = nonEmptyString.max(200, 'Cannot be longer than 200 characters.');
/** P04. The void note's ceiling, the same as the free-text reason it replaces. */
const VOID_NOTE_MAX_LENGTH = 500;

/**
 * POST /bills
 *
 * The order id and the version it was last read at. Nothing else: every line,
 * price and tax figure is read off the order by the server.
 */
export const createBillSchema = z.object({
  body: z
    .object({ orderId: objectId, version })
    .strict('Is not a field you can set here. The server bills from the order.'),
});

/** GET /bills/:billId */
export const readBillSchema = z.object({ params: billIdParam });

/** GET /bills */
export const listBillsSchema = z.object({
  query: paginationQuery.extend({
    from: businessDate.optional(),
    to: businessDate.optional(),
    status: z.enum(BILL_STATUS_VALUES, { error: 'Is not a bill status.' }).optional(),
    includeVoided: queryBoolean,
  }),
});

/** GET /bills/summary. Both dates required: a summary of "everything" is not a report. */
export const billSummarySchema = z.object({
  query: z.object({ from: businessDate, to: businessDate }),
});

/**
 * POST /bills/:billId/discount
 *
 * A discriminated union on `kind`, so each branch refuses the other's field
 * outright rather than silently ignoring it. A FLAT discount carrying a
 * `rateBps` is a validation error naming the field, not a value quietly
 * dropped that leaves a manager thinking they gave ten percent.
 */
export const applyDiscountSchema = z.object({
  params: billIdParam,
  body: z.discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal(DISCOUNT_KINDS.FLAT),
        valueInPaise: paise.refine((value) => value > 0, 'Must be more than zero.'),
        rateBps: z.never({ error: 'A flat discount is an amount, not a rate.' }).optional(),
        reason,
      })
      .strict('Is not a field you can set here.'),
    z
      .object({
        kind: z.literal(DISCOUNT_KINDS.PERCENT),
        rateBps: z
          .number({ error: 'Must be a whole number of basis points.' })
          .int('Must be a whole number. Ten percent is 1000.')
          .min(1, 'Must be more than zero.')
          .max(MAX_BASIS_POINTS, 'Cannot be more than 10000, which is one hundred percent.'),
        valueInPaise: z
          .never({ error: 'A percentage discount is a rate, not an amount.' })
          .optional(),
        reason,
      })
      .strict('Is not a field you can set here.'),
  ]),
});

/** POST /bills/:billId/payments */
export const recordPaymentSchema = z.object({
  params: billIdParam,
  body: z
    .object({
      method: z.enum(PAYMENT_METHOD_VALUES, { error: 'Is not a payment method.' }),
      amountInPaise: paise.refine((value) => value > 0, 'Must be more than zero.'),
      /**
       * A UPI reference or the last four of a card. Never a full card number,
       * which is why this is capped short and is never required.
       */
      reference: z
        .union([z.string().trim().max(100, 'Cannot be longer than 100 characters.'), z.null()])
        .optional(),
    })
    .strict('Is not a field you can set here.'),
});

/** POST /bills/:billId/void */
export const voidBillSchema = z.object({
  params: billIdParam,
  body: z
    .object(reasonFields(BILL_VOID_REASON_CODES, VOID_NOTE_MAX_LENGTH))
    .strict('Is not a field you can set here.')
    .superRefine(requireNoteForOther),
});

/**
 * GET /bills/:billId/receipt
 *
 * 32 characters is 58mm paper, 48 is 80mm. Anything else is a 400 rather than a
 * silent fallback: a receipt rendered at the wrong width prints as garbage, and
 * finding that out on paper in a restaurant is expensive.
 */
export const receiptSchema = z.object({
  params: billIdParam,
  query: z.object({
    width: z
      .enum(['32', '48'], { error: 'Must be 32 (58mm paper) or 48 (80mm).' })
      .default('32')
      .transform(Number),
  }),
});
