/**
 * P63. Request shapes for the sync routes.
 */
import { z } from 'zod';

import { objectId, paginationQuery, queryBoolean } from './common.js';

export const syncStatusSchema = z.object({ query: z.object({}).strict() });

export const syncConflictsSchema = z.object({
  query: paginationQuery.extend({ seen: queryBoolean.optional() }).strict(),
});

export const conflictSeenSchema = z.object({
  params: z.object({ conflictId: objectId }),
  body: z.object({}).strict().optional(),
});
