/**
 * What may be written to an event line. P25 Part G, API-CONTRACT M21 section 1.
 *
 * Every write to `integrationevents` passes through here: each of the
 * provider's secret fields, anything named like a secret, and every customer
 * phone number becomes "[hidden]", and the whole is cut to 16 KB. A partner
 * credential must never appear in a stored line; a test searches for one.
 */
import { providerFor } from './providers.js';

export const HIDDEN = '[hidden]';
export const MAX_LOGGED_BYTES = 16 * 1024;

const SECRET_NAME = /(secret|token|password|passwd|signature|authorization|apikey|api_key|merchantid|securitytoken)/i;
const isPinName = (key) => /^(pin|pincode_secret|upi_pin)$/i.test(key);
const PHONE_NAME = /(phone|mobile|contact_number|msisdn)/i;
const PHONE_VALUE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;

function scrub(value, secretNames, depth = 0) {
  if (depth > 12) return HIDDEN;
  if (Array.isArray(value)) return value.map((entry) => scrub(entry, secretNames, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (secretNames.has(key.toLowerCase()) || SECRET_NAME.test(key) || isPinName(key) || PHONE_NAME.test(key)) out[key] = HIDDEN;
      else out[key] = scrub(entry, secretNames, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') return value.replace(PHONE_VALUE, HIDDEN);
  return value;
}

/**
 * A copy of `value` safe to store. `extraSecrets` are literal values to hide
 * wherever they appear, such as the credentials themselves.
 */
export function redactForLog(value, provider, { extraSecrets = [] } = {}) {
  if (value === undefined || value === null) return null;
  const secretNames = new Set((providerFor(provider)?.secretFields ?? []).map((name) => name.toLowerCase()));
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value;
    }
  }
  let text = JSON.stringify(scrub(parsed, secretNames));
  for (const secret of extraSecrets.filter((entry) => typeof entry === 'string' && entry.length >= 4)) {
    text = text.split(secret).join(HIDDEN);
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_LOGGED_BYTES) {
    return { truncated: true, text: text.slice(0, MAX_LOGGED_BYTES - 64) };
  }
  return JSON.parse(text);
}

export default { HIDDEN, redactForLog };
