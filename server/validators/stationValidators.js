/**
 * Station request schemas. Shapes from docs/API-CONTRACT.md section M18.
 */
import { z } from 'zod';

import { STATION_NAME_MAX_LENGTH } from '../models/Station.js';
import { nonEmptyString, objectId, queryBoolean } from './common.js';

const name = nonEmptyString.max(
  STATION_NAME_MAX_LENGTH,
  `Cannot be longer than ${STATION_NAME_MAX_LENGTH} characters.`,
);

const displayOrder = z
  .number({ error: 'Must be a number.' })
  .int('Must be a whole number.')
  .min(0, 'Cannot be negative.');

const printsTickets = z.boolean({ error: 'Must be true or false.' });

const stationIdParam = z.object({ stationId: objectId });

export const listStationsSchema = z.object({
  query: z.object({ includeInactive: queryBoolean }).strict('Is not a filter on stations.'),
});

export const createStationSchema = z.object({
  body: z
    .object({
      name,
      displayOrder: displayOrder.optional(),
      printsTickets: printsTickets.optional(),
    })
    .strict('Is not a field you can set here.'),
});

export const updateStationSchema = z.object({
  params: stationIdParam,
  body: z
    .object({
      name: name.optional(),
      displayOrder: displayOrder.optional(),
      printsTickets: printsTickets.optional(),
      isActive: z.boolean({ error: 'Must be true or false.' }).optional(),
    })
    .strict('Is not a field you can change here.')
    .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change.'),
});

/** A station id, or null to clear it. Used by the category and user schemas. */
export const stationIdOrNull = z.union([objectId, z.null()], {
  error: 'Must be a station id, or null.',
});
