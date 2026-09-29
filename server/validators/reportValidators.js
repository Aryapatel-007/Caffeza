/**
 * Request schemas for M6 reports.
 *
 * Shapes come from docs/API-CONTRACT.md's M6 section.
 *
 * Two rules run through nearly every schema here, and both exist because a
 * report that quietly decides something for you is a report someone acts on
 * without knowing what they are looking at:
 *
 * `from` and `to` are BOTH REQUIRED on every ranged endpoint. No defaults.
 * A report that picks its own range shows a different number depending on
 * when it was opened, and nobody notices until two people compare screens.
 *
 * The range is capped. The cap itself is enforced in the service rather than
 * here, because RANGE_TOO_LARGE is a 422 business rule and everything a Zod
 * schema rejects comes back as a 400 -- the same reasoning M0-B used when it
 * moved the new-password-equals-old check out of a schema and into the
 * controller.
 */
import { z } from 'zod';

import { businessDate, objectId, paginationQuery } from './common.js';

/** The two dates every ranged report takes. Both required, both inclusive. */
const range = z.object({ from: businessDate, to: businessDate });

/** GET /reports/dashboard -- today's business day, so it takes nothing at all. */
export const dashboardSchema = z.object({
  query: z.object({}).strict('The dashboard is always today. It takes no parameters.'),
});

export const salesSummarySchema = z.object({ query: range });

export const salesByDaySchema = z.object({ query: range });

export const hourlySchema = z.object({ query: range });

export const topItemsSchema = z.object({
  query: range.extend({
    limit: z
      .preprocess(
        (value) => (value === undefined || value === '' ? 20 : value),
        z.coerce
          .number({ error: 'Must be a number.' })
          .int('Must be a whole number.')
          .min(1, 'Must be 1 or more.')
          .max(100, 'Cannot be more than 100.'),
      ),
    sort: z.enum(['quantity', 'revenue'], { error: 'Must be quantity or revenue.' }).default('quantity'),
  }),
});

export const paymentMethodsSchema = z.object({ query: range });

export const taxSummarySchema = z.object({ query: range });

export const discountsSchema = z.object({
  query: paginationQuery.extend({ from: businessDate, to: businessDate }),
});

export const stockConsumptionSchema = z.object({
  query: range.extend({ ingredientId: objectId.optional() }),
});

export const labourHoursSchema = z.object({
  query: range.extend({ userId: objectId.optional() }),
});
