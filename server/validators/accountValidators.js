/**
 * On Hold account and platform payout request schemas. P09. Shapes from
 * docs/API-CONTRACT.md "M16 Settlement and Day Close" section 2 and "M17"
 * section 6.
 */
import { z } from 'zod';

import {
  ACCOUNT_CONTACT_MAX_LENGTH,
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_NOTE_MAX_LENGTH,
  ACCOUNT_PHONE_MAX_LENGTH,
} from '../models/Account.js';
import { PAYMENT_METHOD_CODE_PATTERN } from '../models/PaymentMethod.js';
import { businessDate, nonEmptyString, objectId, paise, queryBoolean } from './common.js';

/** Optional text that may be cleared: "" and null both mean empty. */
const optionalText = (max) =>
  z
    .union([z.string({ error: 'Must be text.' }).trim().max(max, `Cannot be longer than ${max} characters.`), z.null()])
    .optional()
    .transform((value) => (value === '' ? null : value));

const name = nonEmptyString.max(
  ACCOUNT_NAME_MAX_LENGTH,
  `Cannot be longer than ${ACCOUNT_NAME_MAX_LENGTH} characters.`,
);

const positivePaise = paise.refine((value) => value > 0, 'Must be more than zero.');

const methodCode = z
  .string({ error: 'Is required.' })
  .trim()
  .regex(PAYMENT_METHOD_CODE_PATTERN, 'Is not a payment method code.');

const reason = nonEmptyString.max(200, 'Cannot be longer than 200 characters.');

const accountIdParam = z.object({ accountId: objectId });

export const listAccountsSchema = z.object({
  query: z.object({ includeInactive: queryBoolean }).strict('Is not a filter on accounts.'),
});

export const createAccountSchema = z.object({
  body: z
    .object({
      name,
      contactName: optionalText(ACCOUNT_CONTACT_MAX_LENGTH),
      phone: optionalText(ACCOUNT_PHONE_MAX_LENGTH),
      note: optionalText(ACCOUNT_NOTE_MAX_LENGTH),
      openingBalanceInPaise: paise.optional(),
    })
    .strict('Is not a field you can set here.'),
});

export const updateAccountSchema = z.object({
  params: accountIdParam,
  body: z
    .object({
      name: name.optional(),
      contactName: optionalText(ACCOUNT_CONTACT_MAX_LENGTH),
      phone: optionalText(ACCOUNT_PHONE_MAX_LENGTH),
      note: optionalText(ACCOUNT_NOTE_MAX_LENGTH),
      isActive: z.boolean({ error: 'Must be true or false.' }).optional(),
      openingBalanceInPaise: z
        .never({ error: 'The opening balance is set once. Adjust the balance instead.' })
        .optional(),
    })
    .strict('Is not a field you can change here.')
    .transform((body) => Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined)))
    .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change.'),
});

export const chargeToAccountSchema = z.object({
  params: z.object({ billId: objectId }),
  body: z.object({ accountId: objectId }).strict('Is not a field you can set here.'),
});

export const collectionSchema = z.object({
  params: accountIdParam,
  body: z
    .object({
      method: methodCode,
      amountInPaise: positivePaise,
      reference: optionalText(100),
      note: optionalText(200),
    })
    .strict('Is not a field you can set here.'),
});

export const adjustmentSchema = z.object({
  params: accountIdParam,
  body: z
    .object({
      direction: z.enum(['UP', 'DOWN'], { error: 'Must be UP or DOWN.' }),
      amountInPaise: positivePaise,
      reason,
    })
    .strict('Is not a field you can set here.'),
});

export const statementSchema = z.object({
  params: accountIdParam,
  query: z
    .object({ from: businessDate.optional(), to: businessDate.optional() })
    .strict('Is not a filter on a statement.'),
});

export const listPayoutsSchema = z.object({
  query: z
    .object({ method: methodCode.optional(), from: businessDate.optional(), to: businessDate.optional() })
    .strict('Is not a filter on payouts.'),
});

export const recordPayoutSchema = z.object({
  body: z
    .object({
      method: methodCode,
      periodFrom: businessDate,
      periodTo: businessDate,
      amountReceivedInPaise: paise,
      receivedOn: businessDate,
      reference: optionalText(100),
      note: optionalText(200),
    })
    .strict('Is not a field you can set here.'),
});

export const voidPayoutSchema = z.object({
  params: z.object({ payoutId: objectId }),
  body: z.object({ reason }).strict('Is not a field you can set here.'),
});
