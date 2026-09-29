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

/** Everything except `reason`. Used to tell "a group was sent" from "only a reason was sent". */
export const SETTINGS_GROUPS = Object.freeze(['business', 'tax', 'receipt', 'inventory']);

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
    })
    .strict()
    .refine(
      (body) => SETTINGS_GROUPS.some((group) => Object.keys(body[group] ?? {}).length > 0),
      'Send at least one setting to change.',
    ),
});
