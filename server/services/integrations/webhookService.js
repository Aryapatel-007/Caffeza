/**
 * Receiving a partner's webhook. P25 Part G, API-CONTRACT M21 section 4.
 *
 * Verified, stored, then processed by a job: the reply goes back within a
 * second and nothing slow runs inside it. The connection is found by the
 * SHA-256 of the key in the address, before the restaurant is known, which is
 * one of the three sanctioned uses of the tenant guard's escape hatch in M21.
 */
import { Customer } from '../../models/Customer.js';
import { CONNECTION_STATUSES, IntegrationConnection } from '../../models/IntegrationConnection.js';
import { EVENT_OUTCOMES } from '../../models/IntegrationEvent.js';
import { hashKey, secretsOf } from './connectionService.js';
import { logEvent } from './eventLog.js';
import { enqueueJob } from './jobRunner.js';
import { adapterFor, providerFor } from './providers.js';

export const PROCESS_WEBHOOK_EVENT = 'PROCESS_WEBHOOK_EVENT';

/**
 * Returns `{ status, body }` for the route to send. Never says why a key was
 * not found, and never echoes anything the partner sent.
 */
/** The connection a webhook address belongs to, with its sealed credentials, or null. */
function connectionForKey(provider, key) {
  const registered = providerFor(provider);
  if (!registered?.hasWebhook || typeof key !== 'string' || key.length < 16) return null;
  return IntegrationConnection.findOne({ webhookKeyHash: hashKey(key), provider })
    .select('+credentials')
    .setOptions({ skipTenantGuard: true });
}

/**
 * P37. A partner's subscription handshake (Meta's GET with `hub.challenge`).
 * Returns `{ status, text }`: the challenge back when the partner's adapter
 * accepts it, else 403. Found by the same key as the POST.
 */
export async function verifySubscription(provider, key, query) {
  const connection = await connectionForKey(provider, key);
  if (!connection) return { status: 404 };
  const adapter = await adapterFor(provider);
  if (!adapter.verifySubscription) return { status: 404 };
  let challenge = null;
  try {
    challenge = adapter.verifySubscription({ query, secrets: secretsOf(connection) });
  } catch {
    challenge = null;
  }
  return challenge ? { status: 200, text: challenge } : { status: 403 };
}

export async function receiveWebhook(provider, key, rawBody, headers) {
  const connection = await connectionForKey(provider, key);
  if (!connection) return { status: 404 };

  const body = rawBody?.toString('utf8') ?? '';
  // A connection that is not on does nothing, but the partner is told it arrived.
  if (connection.status !== CONNECTION_STATUSES.ACTIVE) {
    await logEvent(connection, { direction: 'IN', kind: 'WEBHOOK', outcome: EVENT_OUTCOMES.IGNORED, request: body });
    return { status: 200, body: { received: true } };
  }

  const adapter = await adapterFor(provider);
  let secrets = {};
  let verified = false;
  try {
    secrets = secretsOf(connection);
    verified = Boolean(await adapter.verifyWebhook({ rawBody, headers, connection, secrets }));
  } catch {
    verified = false;
  }
  if (!verified) {
    await logEvent(connection, { direction: 'IN', kind: 'WEBHOOK', outcome: EVENT_OUTCOMES.REJECTED, request: body, error: 'The signature did not match.', extraSecrets: Object.values(secrets) });
    return { status: 401 };
  }

  let events = [];
  try {
    // P37. A messaging webhook names a guest by number; it is turned into their id here, inside this restaurant.
    const findCustomer = (phone) => Customer.findOne({ restaurantId: connection.restaurantId, phone }).select('_id').lean();
    events = adapter.parseWebhook ? await adapter.parseWebhook({ rawBody, headers, connection, findCustomer }) : [];
  } catch (error) {
    await logEvent(connection, { direction: 'IN', kind: 'WEBHOOK', outcome: EVENT_OUTCOMES.FAILED, request: body, error: error?.message, extraSecrets: Object.values(secrets) });
    return { status: 400 };
  }

  const ctx = { restaurantId: connection.restaurantId, branchId: connection.branchId };
  for (const event of events) {
    const job = await enqueueJob(ctx, {
      connectionId: connection._id,
      type: PROCESS_WEBHOOK_EVENT,
      payload: { event },
      dedupeKey: `${provider}:${connection._id}:${event.type}:${event.platformOrderId ?? event.externalId ?? ''}`,
    });
    await logEvent(connection, {
      direction: 'IN',
      kind: event.type ?? 'WEBHOOK',
      externalId: event.platformOrderId ?? event.externalId ?? null,
      // The same event again: stored, and nothing else happens.
      outcome: job ? EVENT_OUTCOMES.OK : EVENT_OUTCOMES.DUPLICATE,
      request: body,
      extraSecrets: Object.values(secrets),
    });
  }
  if (events.length === 0) {
    await logEvent(connection, { direction: 'IN', kind: 'WEBHOOK', outcome: EVENT_OUTCOMES.OK, request: body, extraSecrets: Object.values(secrets) });
  }
  return { status: 200, body: { received: true } };
}

export default { PROCESS_WEBHOOK_EVENT, receiveWebhook, verifySubscription };
