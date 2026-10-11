/**
 * Meta's WhatsApp Cloud API, called directly. P37, API-CONTRACT "P37".
 *
 * Every call to Meta is here and writes an event line through logEvent, which
 * hides the token, the secrets and every guest number. A 4xx from Meta is a
 * refusal and is final: it is returned, never thrown, so the job runner does
 * not retry it. A timeout, a network failure or a 5xx throws, and the runner
 * retries it on the M21 ladder.
 *
 * Built from Meta's public Cloud API reference. The base address is a setting,
 * so tests run against a fake (tests/helpers/fakeMeta.js).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { PartnerCallFailedError } from '../../../utils/errors.js';
import { logEvent } from '../eventLog.js';

export const CALL_TIMEOUT_MS = 10_000;
export const SIGNATURE_HEADER = 'x-hub-signature-256';
/** Meta's error when the number is not on WhatsApp, or cannot take the message. */
export const NOT_ON_WHATSAPP_CODE = 131026;
/** What a guest replies to stop offers. Matched whole, ignoring case and spaces at the ends. */
export const STOP_WORDS = Object.freeze(['STOP', 'UNSUBSCRIBE', 'STOP PROMOTIONS']);

/** Meta's template states, as ours. One in review again is waiting; one Meta took away is switched off. */
const META_STATUS = { APPROVED: 'APPROVED', PENDING: 'PENDING', IN_APPEAL: 'PENDING', REJECTED: 'REJECTED', PAUSED: 'PAUSED' };
export const templateStatusFromMeta = (status) => META_STATUS[String(status ?? '').toUpperCase()] ?? 'DISABLED';

const base = (connection) => String(connection.config?.apiBaseUrl ?? 'https://graph.facebook.com/v21.0').replace(/\/$/, '');

/**
 * One call. Returns `{ ok, status, body }`: `ok` false with Meta's message for
 * a 4xx. Throws PartnerCallFailedError when Meta could not be reached.
 */
async function call(connection, secrets, { method, path, body = null, kind, externalId = null }) {
  const started = Date.now();
  let status = null;
  let parsed = null;
  const extraSecrets = Object.values(secrets ?? {});
  try {
    const response = await fetch(`${base(connection)}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secrets.accessToken}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    status = response.status;
    parsed = await response.json().catch(() => null);
    if (status >= 500) throw new Error(`Meta answered ${status}.`);
  } catch (error) {
    await logEvent(connection, { direction: 'OUT', kind, externalId, outcome: 'FAILED', httpStatus: status, durationMs: Date.now() - started, request: body, response: parsed, error: error.message, extraSecrets });
    throw new PartnerCallFailedError(error?.name === 'TimeoutError' ? 'WhatsApp did not answer in time.' : 'WhatsApp could not be reached.');
  }
  const ok = status >= 200 && status < 300;
  const metaError = parsed?.error ?? null;
  // A sent message's id, else our own reference: never an id Meta echoes back, which can be a sealed credential.
  const outId = ok ? (parsed?.messages?.[0]?.id ?? externalId) : externalId;
  await logEvent(connection, {
    direction: 'OUT',
    kind,
    externalId: outId,
    outcome: ok ? 'OK' : 'FAILED',
    httpStatus: status,
    durationMs: Date.now() - started,
    request: body,
    response: parsed,
    error: ok ? null : String(metaError?.message ?? `Meta answered ${status}.`),
    extraSecrets,
  });
  return { ok, status, body: parsed, error: ok ? null : { code: metaError?.code ?? null, message: String(metaError?.message ?? `Meta answered ${status}.`) } };
}

/** The connection's test: the number read back from Meta, on the Cloud API. */
export async function testConnection(connection, secrets) {
  const answer = await call(connection, secrets, {
    method: 'GET',
    path: `/${encodeURIComponent(secrets.phoneNumberId)}?fields=id,verified_name,quality_rating,platform_type`,
    kind: 'TEST',
  });
  if (!answer.ok) return { ok: false, message: `Meta refused: ${answer.error.message}` };
  const number = answer.body ?? {};
  if (String(number.id) !== String(secrets.phoneNumberId)) return { ok: false, message: 'Meta answered for a different number. Check the phone number ID.' };
  if (number.platform_type !== 'CLOUD_API') return { ok: false, message: 'This number is not registered on the WhatsApp Cloud API yet.' };
  return { ok: true, message: `Connected: ${number.verified_name ?? 'WhatsApp'}, quality rating ${number.quality_rating ?? 'unknown'}.`, qualityRating: number.quality_rating ?? null };
}

/** Sends an approved template. `to` is the guest's number with the country code. */
export function sendTemplateMessage(connection, secrets, { to, metaName, language, parameters, externalId }) {
  return call(connection, secrets, {
    method: 'POST',
    path: `/${encodeURIComponent(secrets.phoneNumberId)}/messages`,
    kind: 'SEND_TEMPLATE',
    externalId,
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: metaName,
        language: { code: language },
        components: parameters.length > 0 ? [{ type: 'body', parameters: parameters.map((text) => ({ type: 'text', text: String(text) })) }] : [],
      },
    },
  });
}

/** A plain reply, allowed only inside the 24-hour service window after the guest wrote. */
export function sendTextMessage(connection, secrets, { to, text, externalId }) {
  return call(connection, secrets, {
    method: 'POST',
    path: `/${encodeURIComponent(secrets.phoneNumberId)}/messages`,
    kind: 'SEND_TEXT',
    externalId,
    body: { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text } },
  });
}

/** P39. A reply with up to three buttons, inside the service window. */
export function sendInteractiveMessage(connection, secrets, { to, text, buttons, externalId }) {
  return call(connection, secrets, {
    method: 'POST',
    path: `/${encodeURIComponent(secrets.phoneNumberId)}/messages`,
    kind: 'SEND_INTERACTIVE',
    externalId,
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: text.slice(0, 1024) },
        action: { buttons: buttons.slice(0, 3).map((button) => ({ type: 'reply', reply: { id: button.id, title: button.title.slice(0, 20) } })) },
      },
    },
  });
}

/** Every template on the Business Account, with its state. */
export function listTemplates(connection, secrets) {
  return call(connection, secrets, {
    method: 'GET',
    path: `/${encodeURIComponent(secrets.wabaId)}/message_templates?fields=id,name,status,category,language,rejected_reason&limit=200`,
    kind: 'LIST_TEMPLATES',
  });
}

/** Sends a template to Meta for review. */
export function submitTemplate(connection, secrets, { metaName, category, language, bodyText, example }) {
  return call(connection, secrets, {
    method: 'POST',
    path: `/${encodeURIComponent(secrets.wabaId)}/message_templates`,
    kind: 'SUBMIT_TEMPLATE',
    externalId: metaName,
    body: {
      name: metaName,
      category,
      language,
      components: [{ type: 'BODY', text: bodyText, ...(example.length > 0 ? { example: { body_text: [example] } } : {}) }],
    },
  });
}

/** Meta's signature: `sha256=` and the HMAC of the raw body under the app secret. */
export function signMetaBody(rawBody, appSecret) {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}

export function verifyWebhook({ rawBody, headers, secrets }) {
  const given = String(headers?.[SIGNATURE_HEADER] ?? '');
  if (!secrets?.appSecret || !given.startsWith('sha256=')) return false;
  const expected = signMetaBody(rawBody ?? Buffer.alloc(0), secrets.appSecret);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Meta's subscription handshake: the challenge back when the token is ours. */
export function verifySubscription({ query, secrets }) {
  const mode = query?.['hub.mode'];
  const token = query?.['hub.verify_token'];
  const challenge = query?.['hub.challenge'];
  if (mode !== 'subscribe' || typeof token !== 'string' || typeof challenge !== 'string' || !secrets?.webhookVerifyToken) return null;
  const a = Buffer.from(token);
  const b = Buffer.from(secrets.webhookVerifyToken);
  return a.length === b.length && timingSafeEqual(a, b) ? challenge : null;
}

/** The text a guest's message carries, from a typed reply or a tapped button. */
const textOf = (message) =>
  message?.text?.body ?? message?.button?.text ?? message?.button?.payload ?? message?.interactive?.button_reply?.title ?? null;

/** The last ten digits of a WhatsApp id, the way `customers.phone` stores an Indian mobile. */
export const localNumber = (waId) => String(waId ?? '').replace(/\D/g, '').slice(-10);

/**
 * Meta's post as events: delivery receipts, and opt-outs. Nothing else a guest
 * writes is acted on. An opt-out names the guest by `customerId`, looked up
 * here, so no number travels into a job; `findCustomer(number)` does the lookup.
 */
export async function parseWebhook({ rawBody, findCustomer }) {
  const body = JSON.parse(rawBody?.toString('utf8') || '{}');
  const events = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const status of value.statuses ?? []) {
        if (!status?.id || !status?.status) continue;
        events.push({
          type: 'MESSAGE_STATUS',
          externalId: `${status.id}:${status.status}`,
          messageId: String(status.id),
          status: String(status.status).toUpperCase(),
          errorCode: status.errors?.[0]?.code ?? null,
        });
      }
      for (const message of value.messages ?? []) {
        if (!message?.id) continue;
        const text = textOf(message);
        if (typeof text === 'string' && STOP_WORDS.includes(text.trim().toUpperCase())) {
          const customer = findCustomer ? await findCustomer(localNumber(message.from)) : null;
          events.push({ type: 'OPT_OUT', externalId: String(message.id), customerId: customer ? String(customer._id) : null });
          continue;
        }
        // P39. Everything else a guest writes goes to the assistant, as their id, never their number.
        const customer = findCustomer ? await findCustomer(localNumber(message.from), { create: true }) : null;
        events.push({
          type: 'INBOUND_MESSAGE',
          externalId: String(message.id),
          customerId: customer ? String(customer._id) : null,
          text: typeof text === 'string' ? text.slice(0, 1000) : null,
          buttonId: message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id ?? null,
        });
      }
      // Meta's own marketing opt-out, from the guest's settings or its "Stop promotions" button.
      for (const preference of value.user_preferences ?? []) {
        if (preference?.category !== 'marketing_messages' || String(preference?.value).toLowerCase() !== 'stop') continue;
        const customer = findCustomer ? await findCustomer(localNumber(preference.wa_id)) : null;
        events.push({ type: 'OPT_OUT', externalId: `preference:${customer ? customer._id : 'unknown'}:${preference.timestamp ?? ''}`, customerId: customer ? String(customer._id) : null });
      }
    }
  }
  return events;
}

export default {
  listTemplates,
  parseWebhook,
  sendInteractiveMessage,
  sendTemplateMessage,
  sendTextMessage,
  submitTemplate,
  testConnection,
  verifySubscription,
  verifyWebhook,
};
