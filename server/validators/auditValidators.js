/**
 * Request schemas for the audit trail. M8, built in P17.
 */
import { z } from 'zod';

import { ATTENDANCE_CORRECTED, ATTENDANCE_ENTITY, AUDIT_ACTION_VALUES, AUDIT_ENTITY_TYPE_VALUES } from '../models/AuditLog.js';
import { businessDate, objectId, paginationQuery } from './common.js';

/** Every action a line can carry, including the read-time attendance one. */
const READABLE_ACTIONS = [...AUDIT_ACTION_VALUES, ATTENDANCE_CORRECTED];
const READABLE_ENTITY_TYPES = [...AUDIT_ENTITY_TYPE_VALUES, ATTENDANCE_ENTITY];

/** One action or a comma-separated list. An unknown one fails rather than being dropped. */
const actionList = z
  .string()
  .trim()
  .transform((value) => value.split(',').map((part) => part.trim()).filter(Boolean))
  .pipe(z.array(z.enum(READABLE_ACTIONS, { error: 'Is not an audit action.' })).min(1, 'Name at least one action.'));

const entityType = z.enum(READABLE_ENTITY_TYPES, { error: 'Is not an audit entity type.' });

export const listAuditSchema = z.object({
  query: paginationQuery
    .extend({
      from: businessDate,
      to: businessDate,
      action: actionList.optional(),
      entityType: entityType.optional(),
      actorId: objectId.optional(),
    })
    .strict('Is not a filter on the audit trail.'),
});

export const entityHistorySchema = z.object({
  params: z.object({ entityType, entityId: objectId }),
});

export const auditSummarySchema = z.object({
  query: z.object({ from: businessDate, to: businessDate }).strict('Is not a filter on the audit summary.'),
});
