/**
 * P30. GET /system/starts: how many business dates to read, 1 to 60, 7 by default.
 */
import { z } from 'zod';

export const serverStartsSchema = z.object({
  query: z.object({
    days: z.preprocess(
      (value) => (value === undefined || value === '' ? 7 : value),
      z.coerce
        .number({ error: 'Must be a number.' })
        .int('Must be a whole number.')
        .min(1, 'Must be 1 or more.')
        .max(60, 'Must be 60 or fewer: starts are kept for 60 days.'),
    ),
  }),
});
