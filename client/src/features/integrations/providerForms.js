/**
 * The settings each provider's form shows, from the server's own config
 * schemas in `server/services/integrations/providers.js`. The server checks
 * every value again; this only draws the fields.
 *
 * Field kinds: text, number, check, select (with options), and the Pine Labs
 * machine list. Paths use dots, like `paths.upload`.
 */
export const ENVIRONMENTS = [
  { value: 'SANDBOX', label: 'Sandbox' },
  { value: 'UAT', label: 'Test (UAT)' },
  { value: 'PRODUCTION', label: 'Live' },
];

const ORDER_CHANNEL = [
  { path: 'autoAccept', kind: 'check', label: 'Accept orders without a tap', hint: 'Only orders that need nothing from a person.' },
  { path: 'autoFire', kind: 'check', label: 'Send accepted orders to the kitchen' },
  { path: 'defaultPrepMinutes', kind: 'number', label: 'Preparation time, minutes', min: 5, max: 120 },
];

/** An AI provider's two settings. P51. */
function aiFields(defaultModel) {
  return [
    { path: 'model', kind: 'text', label: 'Model', hint: `Leave as ${defaultModel} unless you know you need another.` },
    { path: 'apiBaseUrl', kind: 'text', label: 'Service address', hint: 'Leave as it is.' },
  ];
}

export const PROVIDER_FIELDS = Object.freeze({
  SANDBOX_PLATFORM: [
    { path: 'actsAs', kind: 'select', label: 'Bills as', options: [{ value: 'ZOMATO', label: 'Zomato' }, { value: 'SWIGGY', label: 'Swiggy' }] },
    ...ORDER_CHANNEL,
  ],
  SWIGGY: ORDER_CHANNEL,
  ZOMATO: ORDER_CHANNEL,
  PINE_LABS: [
    { path: 'baseUrl', kind: 'text', label: 'Service address', hint: 'From Pine Labs, with the credentials. Starts with https://.' },
    { path: 'paths.upload', kind: 'text', label: 'Path to send an amount', hint: 'From Pine Labs’ integration document.' },
    { path: 'paths.status', kind: 'text', label: 'Path to read a result' },
    { path: 'paths.cancel', kind: 'text', label: 'Path to cancel' },
    { path: 'storeId', kind: 'text', label: 'Store ID', optional: true },
    { path: 'terminals', kind: 'machines', label: 'Card machines' },
    { path: 'autoCancelMinutes', kind: 'number', label: 'The machine gives up after, minutes', min: 1, max: 30 },
    { path: 'postbackEnabled', kind: 'check', label: 'Pine Labs tells us when a payment finishes' },
  ],
  // P37. The restaurant's own WhatsApp Business number.
  WHATSAPP: [
    { path: 'sendBillOnPayment', kind: 'check', label: 'Send the bill on WhatsApp', hint: 'When a bill is paid and the guest gave a mobile. Needs an approved Bill receipt template.' },
    { path: 'defaultLanguage', kind: 'text', label: 'Language of the templates', hint: 'Like en or gu.' },
    { path: 'senderDisplayName', kind: 'text', label: 'Name shown on the screens', optional: true },
    { path: 'apiBaseUrl', kind: 'text', label: 'Meta Cloud API address', hint: 'Leave as it is unless Meta says otherwise.' },
  ],
  // P51, the assistant's AI. One is used at a time; Anthropic first.
  GEMINI: aiFields('gemini-2.5-flash'),
  ANTHROPIC: aiFields('claude-haiku-5-5'),
  GROQ: aiFields('openai/gpt-oss-120b'),
  TALLY: [
    { path: 'version', kind: 'select', label: 'Tally version', options: [{ value: 'TALLY_PRIME', label: 'TallyPrime' }, { value: 'TALLY_ERP9', label: 'Tally.ERP 9' }] },
    { path: 'companyName', kind: 'text', label: 'Company name, exactly as in Tally' },
    { path: 'granularity', kind: 'select', label: 'Sales vouchers', options: [{ value: 'DAILY_SUMMARY', label: 'One a day' }, { value: 'PER_BILL', label: 'One per bill' }] },
    { path: 'delivery', kind: 'select', label: 'Vouchers reach Tally', options: [{ value: 'FILE', label: 'As a file to import' }, { value: 'BRIDGE', label: 'Through a Tally bridge' }] },
    { path: 'exportPayouts', kind: 'check', label: 'Also export platform payouts' },
  ],
});

/** Starting values for a provider with no connection yet. */
export const PROVIDER_DEFAULTS = Object.freeze({
  SANDBOX_PLATFORM: { actsAs: 'ZOMATO', autoAccept: false, autoFire: true, defaultPrepMinutes: 20 },
  SWIGGY: { autoAccept: false, autoFire: true, defaultPrepMinutes: 20 },
  ZOMATO: { autoAccept: false, autoFire: true, defaultPrepMinutes: 20 },
  PINE_LABS: { baseUrl: 'https://www.plutuscloudserviceuat.in:8201', paths: { upload: '', status: '', cancel: '' }, storeId: '', terminals: [{ name: 'Counter', clientId: '' }], autoCancelMinutes: 5, postbackEnabled: false },
  TALLY: { version: 'TALLY_PRIME', companyName: '', granularity: 'DAILY_SUMMARY', delivery: 'FILE', exportPayouts: false },
  WHATSAPP: { sendBillOnPayment: false, defaultLanguage: 'en', senderDisplayName: '', apiBaseUrl: 'https://graph.facebook.com/v21.0' },
  GEMINI: { model: 'gemini-2.5-flash', apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  ANTHROPIC: { model: 'claude-haiku-5-5', apiBaseUrl: 'https://api.anthropic.com' },
  GROQ: { model: 'openai/gpt-oss-120b', apiBaseUrl: 'https://api.groq.com/openai/v1' },
});

/**
 * Said plainly on the sheet, P51 section 6. A free tier may keep what guests
 * write; a paid Anthropic key is not used for training by default.
 */
export const PROVIDER_WARNINGS = Object.freeze({
  GEMINI: 'Free tier: for testing only. Guests’ messages may be used by Google. Use a paid key before guests write.',
  GROQ: 'Free tier: for testing only, with a small daily limit. Use a paid key before guests write.',
});

export const DEFAULT_ENVIRONMENT = Object.freeze({ SANDBOX_PLATFORM: 'SANDBOX', PINE_LABS: 'UAT', TALLY: 'PRODUCTION', SWIGGY: 'PRODUCTION', ZOMATO: 'PRODUCTION', WHATSAPP: 'PRODUCTION', GEMINI: 'PRODUCTION', ANTHROPIC: 'PRODUCTION', GROQ: 'PRODUCTION' });

export const valueAt = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);

export function withValue(object, path, value) {
  const [head, ...rest] = path.split('.');
  return { ...object, [head]: rest.length ? withValue(object?.[head] ?? {}, rest.join('.'), value) : value };
}

/** Readable words for a credential field name, like securityToken. */
export const credentialLabel = (field) =>
  ({
    merchantId: 'Merchant ID',
    securityToken: 'Security token',
    webhookSecret: 'Signing secret',
    // P37, WhatsApp. The names Meta's screens use.
    phoneNumberId: 'Phone number ID',
    wabaId: 'WhatsApp Business Account ID',
    accessToken: 'Access token',
    webhookVerifyToken: 'Webhook verify token',
    appSecret: 'App secret',
    // P51, an AI provider.
    apiKey: 'API key',
  })[field] ?? field;
