/**
 * Settings request schemas. Shapes from docs/API-CONTRACT.md section M7.
 *
 * UNKNOWN KEYS ARE REJECTED, AT EVERY LEVEL. `.strict()` is on the body, on
 * every group inside it, and there is no level in between. A settings endpoint
 * that silently drops a typo'd field name is how somebody spends an hour
 * wondering why their change did nothing, and this is the one endpoint where
 * that hour is guaranteed to happen eventually.
 *
 * The `.strict()` calls here deliberately carry NO custom message, unlike the
 * rest of the codebase. Zod's own text for an unrecognised key names the key
 * ("Unrecognized key: \"defaultTaxRate\""), and a custom message would replace
 * it with something that does not. Naming the offending key is the entire point,
 * so Zod's message wins here.
 */
import { z } from 'zod';

import {
  INVOICE_MAX_STARTING_NUMBER,
  INVOICE_MODE_VALUES,
  INVOICE_MODES,
  INVOICE_PREFIX_PATTERN,
  RECEIPT_FOOTER_MAX_LENGTH,
  RECEIPT_HEADER_MAX_LENGTH,
  TAX_PRICING_MODE_VALUES,
} from '../models/Restaurant.js';
import { basisPoints } from './common.js';

export const SETTINGS_REASON_MAX_LENGTH = 200;

/**
 * An optional line of receipt text, or null to clear it.
 *
 * An empty string becomes null rather than a 400. Clearing a text box is a
 * legitimate thing for an owner to do and the natural value an HTML input
 * carries when cleared is `""`; making the client translate that to null is a
 * coupling that would eventually be got wrong on one screen. `""` and null mean
 * the same thing here, so they are stored the same way rather than kept as two
 * spellings of empty.
 *
 * Trimmed before the length check, so 40 characters of text plus trailing
 * spaces is 40 characters, not 45.
 */
const receiptText = (maxLength, label) =>
  z
    .union([z.string(), z.null()])
    .transform((value) => {
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    })
    .refine(
      (value) => value === null || value.length <= maxLength,
      `${label} cannot be longer than ${maxLength} characters.`,
    );

/**
 * The business day boundary.
 *
 * Presented under `business` and stored at the top level of `settings`. That
 * mapping lives in settingsService; this schema only describes what the client
 * sends. See models/Restaurant.js for why the field never moves.
 */
const business = z
  .object({
    businessDayStartsAtMinutes: z
      .number({ error: 'Must be a whole number of minutes.' })
      .int('Must be a whole number of minutes past midnight.')
      .min(0, 'Cannot be negative.')
      .max(1439, 'Cannot be more than 1439, which is 23:59.')
      .optional(),
  })
  .strict();

const tax = z
  .object({
    pricingMode: z
      .enum(TAX_PRICING_MODE_VALUES, { error: 'Must be EXCLUSIVE or INCLUSIVE.' })
      .optional(),
    defaultTaxRateBps: basisPoints.optional(),
    roundOffEnabled: z.boolean({ error: 'Must be true or false.' }).optional(),
  })
  .strict();

const receipt = z
  .object({
    headerLine1: receiptText(RECEIPT_HEADER_MAX_LENGTH, 'The first header line').optional(),
    headerLine2: receiptText(RECEIPT_HEADER_MAX_LENGTH, 'The second header line').optional(),
    footerText: receiptText(RECEIPT_FOOTER_MAX_LENGTH, 'The footer').optional(),
    showGstin: z.boolean({ error: 'Must be true or false.' }).optional(),
    showFssai: z.boolean({ error: 'Must be true or false.' }).optional(),
    showServerName: z.boolean({ error: 'Must be true or false.' }).optional(),
  })
  .strict();

const inventory = z
  .object({
    lowStockAlertsEnabled: z.boolean({ error: 'Must be true or false.' }).optional(),
  })
  .strict();

/** Which optional modules are in use. P02. Booleans and nothing else. */
const features = z
  .object({
    inventory: z.boolean({ error: 'Must be true or false.' }).optional(),
    attendance: z.boolean({ error: 'Must be true or false.' }).optional(),
  })
  .strict();

export const INVOICE_PREFIX_MESSAGE =
  'An invoice prefix can use letters, numbers, / and -, up to 7 characters.';

/**
 * The invoice series. P02.
 *
 * Validated as a whole group: if any of its three fields is sent, all three
 * must be, so the stored group is never half-changed. A prefix with the old
 * starting number, or a starting number for a prefix nobody sent, is how a
 * legal number series quietly ends up somewhere nobody chose.
 *
 * The rules that need the database (a series already started, a start below a
 * number already used this year) are in settingsService, not here.
 */
const invoice = z
  .object({
    mode: z.enum(INVOICE_MODE_VALUES, { error: 'Must be FINANCIAL_YEAR or PREFIX.' }).optional(),
    prefix: z
      .union([z.string().trim().regex(INVOICE_PREFIX_PATTERN, INVOICE_PREFIX_MESSAGE), z.null()], {
        error: INVOICE_PREFIX_MESSAGE,
      })
      .optional(),
    startingNumber: z
      .union(
        [
          z
            .number({ error: 'Must be a whole number.' })
            .int('Must be a whole number.')
            .min(1, 'Must be 1 or more.')
            .max(INVOICE_MAX_STARTING_NUMBER, 'Cannot be more than 999,999,999.'),
          z.null(),
        ],
        { error: 'Must be a whole number from 1 to 999,999,999, or null.' },
      )
      .optional(),
  })
  .strict()
  .superRefine((group, context) => {
    const sent = ['mode', 'prefix', 'startingNumber'].filter((key) => group[key] !== undefined);
    if (sent.length === 0) return;

    if (sent.length < 3) {
      for (const key of ['mode', 'prefix', 'startingNumber']) {
        if (group[key] === undefined) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: 'Send mode, prefix and startingNumber together.',
          });
        }
      }
      return;
    }

    if (group.mode === INVOICE_MODES.FINANCIAL_YEAR) {
      if (group.prefix !== null) {
        context.addIssue({
          code: 'custom',
          path: ['prefix'],
          message: 'Must be null when numbering by financial year.',
        });
      }
      if (group.startingNumber !== null) {
        context.addIssue({
          code: 'custom',
          path: ['startingNumber'],
          message: 'Must be null when numbering by financial year.',
        });
      }
      return;
    }

    if (group.prefix === null) {
      context.addIssue({ code: 'custom', path: ['prefix'], message: 'A prefix is required.' });
    }
    if (group.startingNumber === null) {
      context.addIssue({
        code: 'custom',
        path: ['startingNumber'],
        message: 'A starting number is required.',
      });
    }
  });

/** Delivery orders. P06. */
const delivery = z
  .object({
    platformCollectsGst: z.boolean({ error: 'Must be true or false.' }).optional(),
  })
  .strict();

/** Discounts. P08. */
const discounts = z
  .object({
    cashierMayApplyPlatformDiscounts: z.boolean({ error: 'Must be true or false.' }).optional(),
  })
  .strict();

/** Everything except `reason`. Used to tell "a group was sent" from "only a reason was sent". */
export const SETTINGS_GROUPS = Object.freeze([
  'business',
  'tax',
  'receipt',
  'inventory',
  'features',
  'invoice',
  'delivery',
  'discounts',
]);

/**
 * GET /settings takes no parameters.
 *
 * `.strict()` on an empty object, the same shape M6's dashboard uses, so a
 * query string is a 400 rather than something quietly ignored.
 */
export const getSettingsSchema = z.object({
  query: z.object({}).strict('Settings take no parameters.'),
});

/**
 * PATCH /settings.
 *
 * Every group optional, every field within a group optional, at least one
 * actual setting present. `reason` on its own is not a change.
 *
 * `reason` is required and is never defaulted to `""`. An owner changing the
 * GST pricing mode with nothing recorded about why is exactly the gap the audit
 * log exists to close, and a default would close it with a lie.
 */
export const updateSettingsSchema = z.object({
  body: z
    .object({
      reason: z
        .string({ error: 'A reason is required.' })
        .trim()
        .min(1, 'A reason is required.')
        .max(
          SETTINGS_REASON_MAX_LENGTH,
          `Cannot be longer than ${SETTINGS_REASON_MAX_LENGTH} characters.`,
        ),
      business: business.optional(),
      tax: tax.optional(),
      receipt: receipt.optional(),
      inventory: inventory.optional(),
      features: features.optional(),
      invoice: invoice.optional(),
      delivery: delivery.optional(),
      discounts: discounts.optional(),
    })
    .strict()
    .refine(
      (body) => SETTINGS_GROUPS.some((group) => Object.keys(body[group] ?? {}).length > 0),
      'Send at least one setting to change.',
    ),
});
