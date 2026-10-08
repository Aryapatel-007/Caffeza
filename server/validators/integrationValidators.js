/**
 * M21 Integrations request schemas. P25 Part G, API-CONTRACT M21 section 3.
 * A provider's own credential and config rules live in its registry entry
 * (services/integrations/providers.js), checked by the service.
 */
import { z } from 'zod';

import { INTEGRATION_ENVIRONMENTS } from '../models/IntegrationConnection.js';
import { EVENT_OUTCOMES } from '../models/IntegrationEvent.js';
import { PROVIDER_CODES } from '../services/integrations/providers.js';
import { PLATFORM_REJECT_REASON_CODES } from '../config/platformRejectReasons.js';
import { PLATFORM_ORDER_STATUSES } from '../models/PlatformOrder.js';
import { businessDate, paginationQuery, reasonFields, requireNoteForOther } from './common.js';

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

/* --------------------------------------------------------------------------
 * P25 Part H. Platform orders, item mapping, store status, menu push.
 * ----------------------------------------------------------------------- */

const objectIdText = z.string().regex(/^[0-9a-f]{24}$/i, 'Is not a valid id.');
const platformOrderParam = z.object({ id: objectIdText });

export const listPlatformOrdersSchema = z.object({
  query: paginationQuery.extend({
    status: z.enum(['WAITING', ...Object.values(PLATFORM_ORDER_STATUSES)], { error: 'Is not a platform order status.' }).optional(),
    date: businessDate.optional(),
  }),
});

export const platformOrderIdSchema = z.object({ params: platformOrderParam });

export const acceptPlatformOrderSchema = z.object({
  params: platformOrderParam,
  body: z
    .object({
      prepMinutes: z.number().int('Whole minutes.').min(5).max(120).optional(),
      acknowledgeHandling: z.boolean().optional(),
    })
    .strict('Is not a field you can set here.')
    .default({}),
});

export const rejectPlatformOrderSchema = z.object({
  params: platformOrderParam,
  body: z
    .object({ ...reasonFields(PLATFORM_REJECT_REASON_CODES, 200) })
    .strict('Is not a field you can set here.')
    .superRefine(requireNoteForOther),
});

export const handedOverSchema = z.object({
  params: platformOrderParam,
  body: z.object({}).strict('Is not a field you can set here.').optional(),
});

export const storeStatusSchema = z.object({
  params: providerParam,
  body: z.object({ open: z.boolean({ error: 'Must be true or false.' }) }).strict('Is not a field you can set here.'),
});

export const listMappingsSchema = z.object({ params: providerParam, query: paginationQuery });

export const saveMappingSchema = z.object({
  params: providerParam,
  body: z
    .object({
      externalItemId: z.string().trim().min(1).max(100),
      externalVariantId: z.string().trim().min(1).max(100).nullable().default(null),
      externalName: z.string().trim().max(200).nullable().optional(),
      menuItemId: objectIdText,
      variantId: objectIdText.nullable().default(null),
      addOnMap: z.record(z.string().trim().min(1).max(100), objectIdText).default({}),
    })
    .strict('Is not a field you can set here.'),
});

export const deleteMappingSchema = z.object({
  params: providerParam.extend({ mappingId: objectIdText }),
});

export const importMappingsSchema = z.object({
  params: providerParam,
  body: z.object({ csv: z.string().max(200_000), apply: z.boolean().default(false) }).strict('Is not a field you can set here.'),
});
