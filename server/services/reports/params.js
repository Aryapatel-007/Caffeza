/**
 * The request parameters reports share. M19, built in P14. Contract section 2.
 *
 * A report's schema picks the ones it accepts with `reportQuery`, which is
 * strict: an unknown parameter is a 400, as everywhere in this repo.
 */
import { z } from 'zod';

import { DISCOUNT_REASON_CODES } from '../../config/discountReasons.js';
import { PLATFORM_CODES } from '../../config/platforms.js';
import { PAYMENT_METHOD_CODE_PATTERN } from '../../models/PaymentMethod.js';
import { businessDate, objectId, paginationQuery } from '../../validators/common.js';

const trueFalse = z.enum(['true', 'false'], { error: 'Must be true or false.' }).transform((value) => value === 'true');
const wholeNumber = (min, max) =>
  z.coerce.number({ error: 'Must be a number.' }).int('Must be a whole number.').min(min, `Must be ${min} or more.`).max(max, `Must be ${max} or less.`);

/** Every filter in the contract, by name. */
export const FILTERS = Object.freeze({
  orderType: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY'], { error: 'Must be DINE_IN, TAKEAWAY or DELIVERY.' }),
  platform: z.enum(PLATFORM_CODES, { error: `Must be one of: ${PLATFORM_CODES.join(', ')}.` }),
  captainId: objectId,
  table: z.string().trim().min(1).max(40),
  method: z.string().trim().regex(PAYMENT_METHOD_CODE_PATTERN, 'Is not a payment method code.'),
  status: z.enum(['UNPAID', 'PAID', 'ON_ACCOUNT', 'VOIDED'], { error: 'Must be UNPAID, PAID, ON_ACCOUNT or VOIDED.' }),
  categoryName: z.string().trim().min(1).max(80),
  itemName: z.string().trim().min(1).max(120),
  taxRateBps: wholeNumber(0, 10000),
  discountReason: z.enum(DISCOUNT_REASON_CODES, { error: 'Is not a discount reason.' }),
  accountId: objectId,
  hour: wholeNumber(0, 23),
  weekday: wholeNumber(1, 7),
  hasDiscount: trueFalse,
  hasCancellations: trueFalse,
  billNumber: z.string().trim().min(1).max(40),
  stationId: objectId,
});

const format = z.enum(['json', 'xlsx'], { error: 'Must be json or xlsx.' }).default('json');

/**
 * The schema for a report over a range: `from`, `to`, the named filters, and
 * paging when `paged`.
 */
export function reportQuery(filterNames = [], { paged = false } = {}) {
  const shape = { from: businessDate, to: businessDate, format };
  for (const name of filterNames) shape[name] = FILTERS[name].optional();
  const base = z.object(shape);
  return (paged ? base.extend(paginationQuery.shape) : base).strict('Is not a filter on this report.');
}

/** The schema for a one-date report, such as R2. */
export function dayQuery() {
  return z.object({ date: businessDate, format }).strict('Is not a filter on this report.');
}
