/**
 * Payment method request schemas. M10, built in P08. Shapes from
 * docs/API-CONTRACT.md "M10 Payments" section 1.
 *
 * `code` and `kind` are set once, on create. The update schema refuses both
 * with a 400 rather than ignoring them: payments and reports group by the code,
 * and a method that changed kind would move old money between "in hand" and
 * "platform".
 */
import { z } from 'zod';

import { PLATFORM_CODES } from '../config/platforms.js';
import { ORDER_TYPE_VALUES } from '../models/Order.js';
import {
  PAYMENT_METHOD_CODE_PATTERN,
  PAYMENT_METHOD_KIND_VALUES,
  PAYMENT_METHOD_NAME_MAX_LENGTH,
  TALLY_LEDGER_CODE_MAX_LENGTH,
} from '../models/PaymentMethod.js';
import { MAX_BASIS_POINTS, nonEmptyString, objectId, queryBoolean } from './common.js';

const code = z
  .string({ error: 'Is required.' })
  .trim()
  .regex(
    PAYMENT_METHOD_CODE_PATTERN,
    'Use 2 to 20 capital letters, digits or _, starting with a letter, like ZOMATO_GOLD.',
  );

const name = nonEmptyString.max(
  PAYMENT_METHOD_NAME_MAX_LENGTH,
  `Cannot be longer than ${PAYMENT_METHOD_NAME_MAX_LENGTH} characters.`,
);

const orderTypes = z
  .array(z.enum(ORDER_TYPE_VALUES, { error: `Must be one of: ${ORDER_TYPE_VALUES.join(', ')}.` }))
  .min(1, 'Choose at least one order type.')
  .transform((values) => [...new Set(values)]);

const platformCode = z.union(
  [z.enum(PLATFORM_CODES, { error: `Must be one of: ${PLATFORM_CODES.join(', ')}.` }), z.null()],
  { error: `Must be one of: ${PLATFORM_CODES.join(', ')}, or null.` },
);

const tallyLedgerCode = z.union([
  z
    .string({ error: 'Must be text.' })
    .trim()
    .max(TALLY_LEDGER_CODE_MAX_LENGTH, `Cannot be longer than ${TALLY_LEDGER_CODE_MAX_LENGTH} characters.`)
    .transform((value) => (value === '' ? null : value)),
  z.null(),
]);

const commissionBps = z.union([
  z
    .number({ error: 'Must be a whole number of basis points.' })
    .int('Must be a whole number. Twenty percent is 2000.')
    .min(0, 'Cannot be negative.')
    .max(MAX_BASIS_POINTS, 'Cannot be more than 10000, which is one hundred percent.'),
  z.null(),
]);

const displayOrder = z
  .number({ error: 'Must be a number.' })
  .int('Must be a whole number.')
  .min(0, 'Cannot be negative.');

export const listPaymentMethodsSchema = z.object({
  query: z.object({ includeInactive: queryBoolean }).strict('Is not a filter on payment methods.'),
});

export const createPaymentMethodSchema = z.object({
  body: z
    .object({
      code,
      name,
      kind: z.enum(PAYMENT_METHOD_KIND_VALUES, { error: 'Must be IN_HAND or PLATFORM.' }),
      orderTypes: orderTypes.optional(),
      platformCode: platformCode.optional(),
      tallyLedgerCode: tallyLedgerCode.optional(),
      commissionBps: commissionBps.optional(),
      displayOrder: displayOrder.optional(),
    })
    .strict('Is not a field you can set here.')
    .superRefine((body, context) => {
      if (body.kind === 'IN_HAND' && body.commissionBps !== undefined && body.commissionBps !== null) {
        context.addIssue({
          code: 'custom',
          path: ['commissionBps'],
          message: 'A commission applies only to a platform method.',
        });
      }
    }),
});

export const updatePaymentMethodSchema = z.object({
  params: z.object({ methodId: objectId }),
  body: z
    .object({
      code: z.never({ error: 'A payment method code never changes.' }).optional(),
      kind: z.never({ error: 'A payment method kind never changes.' }).optional(),
      name: name.optional(),
      orderTypes: orderTypes.optional(),
      platformCode: platformCode.optional(),
      tallyLedgerCode: tallyLedgerCode.optional(),
      commissionBps: commissionBps.optional(),
      displayOrder: displayOrder.optional(),
      isActive: z.boolean({ error: 'Must be true or false.' }).optional(),
    })
    .strict('Is not a field you can change here.')
    .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change.'),
});
