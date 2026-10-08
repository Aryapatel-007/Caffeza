/**
 * Every partner M21 knows, and its rules. P25 Part G, API-CONTRACT M21
 * section 1.5.
 *
 * Provider-specific rules are reached only through this registry: its kind,
 * name, whether it is ready, the shape of its credentials and its config,
 * which fields are secret, and its adapter. There is no
 * `if (provider === 'SWIGGY')` anywhere else.
 *
 * A Swiggy or Zomato adapter is written only from the platform's own
 * document, kept outside git in partner-docs/. There is none yet, so both are
 * WAITING_FOR_PARTNER and cannot be switched on.
 */
import { z } from 'zod';

import { config } from '../../config/env.js';

export const PROVIDER_KINDS = Object.freeze({
  ORDER_CHANNEL: 'ORDER_CHANNEL',
  PAYMENT_TERMINAL: 'PAYMENT_TERMINAL',
  ACCOUNTING: 'ACCOUNTING',
});
export const AVAILABILITY = Object.freeze({ READY: 'READY', WAITING_FOR_PARTNER: 'WAITING_FOR_PARTNER' });

/** The UAT address Pine Labs publishes. Production's comes with the merchant's credentials. */
export const PINE_LABS_UAT_BASE_URL = 'https://www.plutuscloudserviceuat.in:8201';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Is not a valid id.');
const secret = (max = 200) => z.string({ error: 'Is required.' }).trim().min(1, 'Is required.').max(max);

/** The settings every order channel has. API-CONTRACT M21 section 7.1. */
const orderChannelConfig = {
  autoAccept: z.boolean().default(false),
  autoFire: z.boolean().default(true),
  defaultPrepMinutes: z.number().int().min(5).max(120).default(20),
  packagingItemId: objectId.nullable().default(null),
};

const PROVIDERS = {
  SANDBOX_PLATFORM: {
    kind: PROVIDER_KINDS.ORDER_CHANNEL,
    name: 'Sandbox platform',
    availability: AVAILABILITY.READY,
    sandboxOnly: true,
    hasWebhook: true,
    secretFields: ['webhookSecret'],
    credentialSchema: z.object({ webhookSecret: secret().min(16, 'At least 16 characters.') }).strict(),
    configSchema: z
      .object({
        ...orderChannelConfig,
        // The platform its orders are billed as, so the existing platform rules apply unchanged.
        actsAs: z.enum(['ZOMATO', 'SWIGGY']).default('ZOMATO'),
        // For tests and training: the outgoing calls the sandbox should fail.
        failCalls: z.array(z.enum(['acceptOrder', 'rejectOrder', 'markFoodReady', 'setItemAvailability', 'setStoreStatus', 'pushMenu'])).default([]),
      })
      .strict(),
    adapter: () => import('./channels/sandbox.js'),
  },
  SWIGGY: {
    kind: PROVIDER_KINDS.ORDER_CHANNEL,
    name: 'Swiggy',
    availability: AVAILABILITY.WAITING_FOR_PARTNER,
    hasWebhook: true,
    secretFields: [],
    credentialSchema: z.object({}).strict(),
    configSchema: z.object({ ...orderChannelConfig }).strict(),
    adapter: () => import('./channels/waitingForPartner.js').then((module) => module.waitingAdapter('Swiggy')),
  },
  ZOMATO: {
    kind: PROVIDER_KINDS.ORDER_CHANNEL,
    name: 'Zomato',
    availability: AVAILABILITY.WAITING_FOR_PARTNER,
    hasWebhook: true,
    secretFields: [],
    credentialSchema: z.object({}).strict(),
    configSchema: z.object({ ...orderChannelConfig }).strict(),
    adapter: () => import('./channels/waitingForPartner.js').then((module) => module.waitingAdapter('Zomato')),
  },
  PINE_LABS: {
    kind: PROVIDER_KINDS.PAYMENT_TERMINAL,
    name: 'Pine Labs',
    availability: AVAILABILITY.READY,
    hasWebhook: true,
    secretFields: ['merchantId', 'securityToken'],
    credentialSchema: z.object({ merchantId: secret(40), securityToken: secret() }).strict(),
    configSchema: z
      .object({
        // https always; plain http only to this machine outside production, for a test's fake service.
        baseUrl: z.string().trim().url('Must be a web address.').refine((value) => value.startsWith('https://') || (!config.isProduction && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(value)), 'Must start with https://.'),
        // From the integration document Pine Labs sends with the credentials. No code default.
        paths: z
          .object({
            upload: z.string().trim().startsWith('/', 'Starts with /.'),
            status: z.string().trim().startsWith('/', 'Starts with /.'),
            cancel: z.string().trim().startsWith('/', 'Starts with /.'),
          })
          .strict(),
        storeId: z.string().trim().max(40).nullable().default(null),
        terminals: z
          .array(z.object({ name: z.string().trim().min(1).max(40), clientId: z.string().trim().min(1).max(40) }).strict())
          .min(1, 'Add at least one card machine.'),
        autoCancelMinutes: z.number().int().min(1).max(30).default(5),
        postbackEnabled: z.boolean().default(false),
      })
      .strict(),
    adapter: () => import('./terminals/pineLabs.js'),
  },
  TALLY: {
    kind: PROVIDER_KINDS.ACCOUNTING,
    name: 'Tally',
    availability: AVAILABILITY.READY,
    hasWebhook: false,
    secretFields: [],
    credentialSchema: z.object({}).strict(),
    configSchema: z
      .object({
        version: z.enum(['TALLY_PRIME', 'TALLY_ERP9']),
        companyName: z.string().trim().min(1).max(100),
        granularity: z.enum(['DAILY_SUMMARY', 'PER_BILL']).default('DAILY_SUMMARY'),
        voucherTypes: z
          .object({
            sales: z.string().trim().min(1).max(50).default('Sales'),
            receipt: z.string().trim().min(1).max(50).default('Receipt'),
            payment: z.string().trim().min(1).max(50).default('Payment'),
            journal: z.string().trim().min(1).max(50).default('Journal'),
          })
          .strict()
          .default({ sales: 'Sales', receipt: 'Receipt', payment: 'Payment', journal: 'Journal' }),
        // Checked head by head before an export: Part J.
        ledgers: z.record(z.string(), z.any()).default({}),
        exportPayouts: z.boolean().default(false),
        delivery: z.enum(['FILE', 'BRIDGE']).default('FILE'),
      })
      .strict(),
    adapter: () => import('./tally/adapter.js'),
  },
};

export const PROVIDER_CODES = Object.freeze(Object.keys(PROVIDERS));

/** The registry entry for a provider, or null. */
export function providerFor(code) {
  return PROVIDERS[code] ?? null;
}

/** Providers this server offers: the sandbox never in production. */
export function listProviders({ production = false } = {}) {
  return PROVIDER_CODES.filter((code) => !(production && PROVIDERS[code].sandboxOnly)).map((code) => ({ provider: code, ...PROVIDERS[code] }));
}

/** The provider's adapter module. */
export async function adapterFor(code) {
  const provider = providerFor(code);
  if (!provider) return null;
  const module = await provider.adapter();
  return module.default ?? module;
}

export default { adapterFor, listProviders, providerFor, PROVIDER_CODES };
