/**
 * M21 Integrations request schemas. P25 Part G, API-CONTRACT M21 section 3.
 * A provider's own credential and config rules live in its registry entry
 * (services/integrations/providers.js), checked by the service.
 */
import { z } from 'zod';

import { INTEGRATION_ENVIRONMENTS } from '../models/IntegrationConnection.js';
import { EVENT_OUTCOMES } from '../models/IntegrationEvent.js';
import { PROVIDER_CODES } from '../services/integrations/providers.js';
import { paginationQuery } from './common.js';

const providerParam = z.object({
  provider: z.enum(PROVIDER_CODES, { error: 'Is not an integration this server offers.' }),
});

export const listIntegrationsSchema = z.object({ query: z.object({}).strict() });

export const saveIntegrationSchema = z.object({
  params: providerParam,
  body: z
    .object({
      environment: z.enum(INTEGRATION_ENVIRONMENTS, { error: 'Must be SANDBOX, UAT or PRODUCTION.' }),
      // Each value is text; "" keeps what is stored. Checked against the provider's own fields.
      credentials: z.record(z.string(), z.string().max(500)).default({}),
      config: z.record(z.string(), z.any()).default({}),
    })
    .strict('Is not a field you can set here.'),
});

export const providerActionSchema = z.object({
  params: providerParam,
  body: z.object({}).strict('Is not a field you can set here.').optional(),
});

export const listEventsSchema = z.object({
  params: providerParam,
  query: paginationQuery.extend({
    outcome: z.enum(Object.values(EVENT_OUTCOMES), { error: 'Is not an outcome.' }).optional(),
  }),
});
