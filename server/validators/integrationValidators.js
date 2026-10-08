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

/* P25 Part I. The card machine. ------------------------------------------ */

export const startTerminalPaymentSchema = z.object({
  params: z.object({ billId: objectIdText }),
  body: z
    .object({
      method: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,19}$/, 'Is not a payment method code.'),
      amountInPaise: z.number().int('Whole paise.').min(1, 'Must be more than zero.'),
      terminalClientId: z.string().trim().min(1).max(40),
    })
    .strict('Is not a field you can set here.'),
});

export const terminalPaymentIdSchema = z.object({
  params: z.object({ id: objectIdText }),
  body: z.object({}).strict('Is not a field you can set here.').optional(),
});

/* P25 Part J. Tally exports. ------------------------------------------- */

const dateRange = z.object({ from: businessDate, to: businessDate }).strict('Is not a field you can set here.');

export const tallyDaysSchema = z.object({ query: dateRange });

export const createTallyExportsSchema = z.object({ body: dateRange });

export const tallyExportIdSchema = z.object({
  params: z.object({ id: objectIdText }),
  body: z.object({}).strict('Is not a field you can set here.').optional(),
});

export const redoTallyExportSchema = z.object({
  params: z.object({ id: objectIdText }),
  body: z.object({ confirmation: z.string({ error: 'Type the sentence shown.' }).trim().min(1, 'Type the sentence shown.').max(200) }).strict('Is not a field you can set here.'),
});

export const tallyLedgerMastersSchema = z.object({ query: z.object({}).strict() });

/* P25 Part K. The Tally bridge. ---------------------------------------- */

export const bridgePairSchema = z.object({
  body: z
    .object({
      code: z.string({ error: 'Is required.' }).trim().min(1, 'Is required.').max(20),
      machineName: z.string().trim().max(60).nullable().optional(),
    })
    .strict('Is not a field you can set here.'),
});

export const bridgeJobResultSchema = z.object({
  params: z.object({ jobId: objectIdText }),
  body: z
    .object({
      ok: z.boolean(),
      httpStatus: z.number().int().min(100).max(599).nullable().default(null),
      body: z.string().max(5 * 1024 * 1024, 'Up to 5 MB.').default(''),
      reached: z.boolean().default(true),
      tallyVersion: z.string().trim().max(60).nullable().optional(),
      companies: z.array(z.string().trim().max(100)).max(50).nullable().optional(),
    })
    .strict('Is not a field you can set here.'),
});

export const pairingCodeSchema = z.object({
  body: z.object({ name: z.string({ error: 'Name this computer.' }).trim().min(1, 'Name this computer.').max(40) }).strict('Is not a field you can set here.'),
});

export const tallyBridgeIdSchema = z.object({
  params: z.object({ id: objectIdText }),
  body: z.object({}).strict('Is not a field you can set here.').optional(),
});

export const listBridgesSchema = z.object({ query: z.object({}).strict() });

/* P25 Part L. Integration alerts. -------------------------------------- */

export const listAlertsSchema = z.object({ query: z.object({}).strict() });

export const acknowledgeAlertSchema = z.object({
  body: z
    .object({
      kind: z.enum(['JOB_DEAD', 'PLATFORM_ACCEPT_FAILED', 'PLATFORM_AMOUNT_MISMATCH', 'PLATFORM_CANCELLED_CLOSED_DAY', 'TERMINAL_UNKNOWN', 'TALLY_FAILED'], { error: 'Is not a kind of alert.' }),
      id: objectIdText,
    })
    .strict('Is not a field you can set here.'),
});
