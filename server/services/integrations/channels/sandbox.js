/**
 * The sandbox platform. P25 Parts G and H, API-CONTRACT M21 section 7.1.
 *
 * Behaves like a delivery platform so a restaurant can practise, and tests can
 * run, without one. Its webhooks are signed with HMAC-SHA256 of the raw body
 * under its `webhookSecret`, sent as lowercase hex in `x-sandbox-signature`.
 * Never in production: the registry and the connection service refuse it there.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-sandbox-signature';

/** The signature the sandbox sends with a body. Exported for the developer tool and tests. */
export function signSandboxBody(rawBody, webhookSecret) {
  return createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
}

export function verifyWebhook({ rawBody, headers, secrets }) {
  const sent = String(headers?.[SIGNATURE_HEADER] ?? '');
  if (!/^[0-9a-f]{64}$/.test(sent) || !secrets?.webhookSecret) return false;
  const expected = signSandboxBody(rawBody, secrets.webhookSecret);
  return timingSafeEqual(Buffer.from(sent, 'hex'), Buffer.from(expected, 'hex'));
}

export const capabilities = Object.freeze({ acceptReject: true, foodReady: true, itemAvailability: true, storeStatus: true, menuPush: true });

export function testConnection() {
  return Promise.resolve({ ok: true });
}

export default { capabilities, signSandboxBody, testConnection, verifyWebhook };
