/**
 * Partner connections: saving, testing, pausing, the webhook address and the
 * event log. P25 Part G, API-CONTRACT M21 section 3.
 *
 * Credentials go in sealed with encryptJson and never come out of this file
 * except to an adapter making a call. A response carries only the last four
 * characters of each secret field.
 */
import { createHash, randomBytes } from 'node:crypto';

import { config } from '../../config/env.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../models/AuditLog.js';
import { CONNECTION_STATUSES, IntegrationConnection } from '../../models/IntegrationConnection.js';
import { IntegrationEvent } from '../../models/IntegrationEvent.js';
import {
  BusinessRuleError,
  IntegrationNotActiveError,
  IntegrationTestFailedError,
  NotFoundError,
  PartnerSpecMissingError,
  ValidationError,
} from '../../utils/errors.js';
import { decryptJson, encryptJson } from '../../utils/secretBox.js';
import { scoped } from '../../utils/scopedQuery.js';
import { nowUtc } from '../../utils/time.js';
import { recordAudit } from '../auditService.js';
import { adapterFor, AVAILABILITY, listProviders, providerFor } from './providers.js';
import { ensureIntegrationUser } from './systemActor.js';

const DUPLICATE_KEY = 11000;

export const hashKey = (key) => createHash('sha256').update(key).digest('hex');

/** The address a partner posts to, shown once. Same origin as the app in production. */
export function webhookUrlFor(provider, key) {
  return `${config.CLIENT_ORIGIN}/api/v1/hooks/${provider}/${key}`;
}

/** The registry entry, or 404 for a provider this server does not offer. */
function knownProvider(code) {
  const provider = providerFor(code);
  if (!provider || (provider.sandboxOnly && config.isProduction)) throw new NotFoundError('No such integration.');
  return provider;
}

/** A zod error as the API's `fields` map. */
function fieldsOf(error, prefix) {
  const fields = {};
  for (const issue of error.issues) fields[[prefix, ...issue.path].join('.')] = issue.message;
  return fields;
}

const hintOf = (value) => (typeof value === 'string' && value.length > 0 ? value.slice(-4) : null);

/** What a response says about a connection. Never the credentials, never the key. */
export function presentConnection(connection, { webhookUrl = null } = {}) {
  if (!connection) return null;
  const plain = connection.toJSON ? connection.toJSON() : { ...connection };
  return {
    id: String(plain.id ?? plain._id),
    environment: plain.environment,
    status: plain.status,
    credentialHints: plain.credentialHints ?? {},
    config: plain.config ?? {},
    hasWebhook: Boolean(connection.webhookKeyHash ?? plain.webhookKeyHash),
    lastSuccessAt: plain.lastSuccessAt ?? null,
    lastErrorAt: plain.lastErrorAt ?? null,
    lastError: plain.lastError ?? null,
    ...(webhookUrl ? { webhookUrl } : {}),
  };
}

/** This branch's connection to a provider, with or without its sealed credentials. */
export function findConnection(req, provider, { withCredentials = false } = {}) {
  const query = IntegrationConnection.findOne({ ...scoped(req), provider });
  return withCredentials ? query.select('+credentials') : query;
}

/** The credentials, opened, for an adapter's call. Only adapters receive them. */
export function secretsOf(connection) {
  return connection.credentials ? decryptJson(connection.credentials) : {};
}

/** GET /integrations. Every provider, with this branch's connection or null. */
export async function listIntegrations(req) {
  const connections = await IntegrationConnection.find({ ...scoped(req) });
  const byProvider = new Map(connections.map((connection) => [connection.provider, connection]));
  return listProviders({ production: config.isProduction }).map((provider) => ({
    provider: provider.provider,
    kind: provider.kind,
    name: provider.name,
    availability: provider.availability,
    ...(provider.availability === AVAILABILITY.WAITING_FOR_PARTNER
      ? { unavailableReason: new PartnerSpecMissingError(provider.name).message }
      : {}),
    credentialFields: provider.secretFields,
    connection: presentConnection(byProvider.get(provider.provider)),
  }));
}

/**
 * PUT /integrations/:provider. Creates or updates this branch's connection.
 * A credential sent as "" or left out keeps the stored one.
 */
export async function saveConnection(req, code, { environment, credentials = {}, config: settings = {} }) {
  const provider = knownProvider(code);
  if (provider.sandboxOnly && config.isProduction) {
    throw new BusinessRuleError('The sandbox platform is for practice and cannot run in production.');
  }

  const parsedConfig = provider.configSchema.safeParse(settings);
  if (!parsedConfig.success) throw new ValidationError('Some settings are not right.', fieldsOf(parsedConfig.error, 'config'));

  const existing = await findConnection(req, code, { withCredentials: true });
  const stored = existing ? secretsOf(existing) : {};
  const sent = Object.fromEntries(Object.entries(credentials ?? {}).filter(([, value]) => typeof value === 'string' && value.trim() !== ''));
  const merged = { ...stored, ...sent };
  const parsedSecrets = provider.credentialSchema.safeParse(merged);
  if (!parsedSecrets.success) throw new ValidationError('Some credentials are missing.', fieldsOf(parsedSecrets.error, 'credentials'));

  const changedFields = Object.keys(sent).filter((name) => sent[name] !== stored[name]);
  const hints = Object.fromEntries(provider.secretFields.map((name) => [name, hintOf(parsedSecrets.data[name])]));
  const at = nowUtc();

  if (!existing) {
    await ensureIntegrationUser(req.restaurantId, req.branchId, provider.name);
    const key = provider.hasWebhook ? randomBytes(24).toString('base64url') : null;
    let created;
    try {
      created = await IntegrationConnection.create({
        ...scoped(req),
        provider: code,
        environment,
        status: CONNECTION_STATUSES.DRAFT,
        credentials: encryptJson(parsedSecrets.data),
        credentialHints: hints,
        config: parsedConfig.data,
        webhookKeyHash: key ? hashKey(key) : null,
        createdBy: req.user.id,
        updatedBy: req.user.id,
      });
    } catch (error) {
      if (error?.code === DUPLICATE_KEY) throw new BusinessRuleError('This connection was just saved by someone else. Open it again.');
      throw error;
    }
    await recordAudit(req, {
      action: AUDIT_ACTIONS.INTEGRATION_CONNECTED,
      entityType: AUDIT_ENTITY_TYPES.INTEGRATION,
      entityId: created._id,
      entityLabel: provider.name,
      reason: `${provider.name} connection saved`,
      details: { provider: code, environment, credentialFields: Object.keys(sent) },
    });
    return { connection: presentConnection(created, { webhookUrl: key ? webhookUrlFor(code, key) : null }), created: true };
  }

  existing.environment = environment;
  existing.config = parsedConfig.data;
  existing.credentials = encryptJson(parsedSecrets.data);
  existing.credentialHints = hints;
  existing.updatedBy = req.user.id;
  existing.markModified('config');
  existing.markModified('credentials');
  existing.markModified('credentialHints');
  await existing.save();

  if (changedFields.length > 0) {
    await recordAudit(req, {
      action: AUDIT_ACTIONS.INTEGRATION_CREDENTIALS_CHANGED,
      entityType: AUDIT_ENTITY_TYPES.INTEGRATION,
      entityId: existing._id,
      entityLabel: provider.name,
      reason: `${provider.name} credentials replaced`,
      // The field names only, never a value.
      details: { provider: code, fields: changedFields, at },
    });
  }
  return { connection: presentConnection(existing), created: false };
}

async function connectionOr404(req, code, options) {
  knownProvider(code);
  const connection = await findConnection(req, code, options);
  if (!connection) throw new NotFoundError('This integration is not set up yet.');
  return connection;
}

/** POST /integrations/:provider/test. Success switches a draft or errored connection on. */
export async function testConnection(req, code) {
  const provider = knownProvider(code);
  if (provider.availability === AVAILABILITY.WAITING_FOR_PARTNER) throw new PartnerSpecMissingError(provider.name);
  const connection = await connectionOr404(req, code, { withCredentials: true });
  const adapter = await adapterFor(code);

  let outcome;
  try {
    outcome = await adapter.testConnection(connection, secretsOf(connection));
  } catch (error) {
    outcome = { ok: false, message: error?.message ?? 'The partner could not be reached.' };
  }

  const at = nowUtc();
  if (!outcome.ok) {
    connection.lastErrorAt = at;
    connection.lastError = String(outcome.message ?? 'The test failed.').slice(0, 300);
    if (connection.status === CONNECTION_STATUSES.ACTIVE) connection.status = CONNECTION_STATUSES.ERROR;
    await connection.save();
    throw new IntegrationTestFailedError(connection.lastError);
  }
  connection.lastSuccessAt = at;
  if ([CONNECTION_STATUSES.DRAFT, CONNECTION_STATUSES.ERROR].includes(connection.status)) connection.status = CONNECTION_STATUSES.ACTIVE;
  await connection.save();
  return presentConnection(connection);
}

/** POST /integrations/:provider/pause and /resume. */
export async function setPaused(req, code, paused) {
  const provider = knownProvider(code);
  const connection = await connectionOr404(req, code);
  const from = paused ? CONNECTION_STATUSES.ACTIVE : CONNECTION_STATUSES.PAUSED;
  if (connection.status !== from) {
    throw new BusinessRuleError(paused ? 'Only a connection that is on can be paused.' : 'Only a paused connection can be resumed.');
  }
  connection.status = paused ? CONNECTION_STATUSES.PAUSED : CONNECTION_STATUSES.ACTIVE;
  connection.updatedBy = req.user.id;
  await connection.save();
  await recordAudit(req, {
    action: paused ? AUDIT_ACTIONS.INTEGRATION_PAUSED : AUDIT_ACTIONS.INTEGRATION_RESUMED,
    entityType: AUDIT_ENTITY_TYPES.INTEGRATION,
    entityId: connection._id,
    entityLabel: provider.name,
    reason: `${provider.name} ${paused ? 'paused' : 'resumed'}`,
    details: { provider: code },
  });
  return presentConnection(connection);
}

/** POST /integrations/:provider/webhook-key. A new address; the old one stops at once. */
export async function newWebhookKey(req, code) {
  const provider = knownProvider(code);
  if (!provider.hasWebhook) throw new BusinessRuleError(`${provider.name} does not post to this server.`);
  const connection = await connectionOr404(req, code);
  const key = randomBytes(24).toString('base64url');
  connection.webhookKeyHash = hashKey(key);
  connection.updatedBy = req.user.id;
  await connection.save();
  return { webhookUrl: webhookUrlFor(code, key) };
}

/** GET /integrations/:provider/events. Newest first, paged; already redacted when stored. */
export async function listEvents(req, code, { outcome = null, page = 1, limit = 50 }) {
  const connection = await connectionOr404(req, code);
  const filter = { ...scoped(req), connectionId: connection._id, ...(outcome ? { outcome } : {}) };
  const [rows, total] = await Promise.all([
    IntegrationEvent.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit),
    IntegrationEvent.countDocuments(filter),
  ]);
  return { rows, total, page, limit };
}

/** The ACTIVE connection to a provider, or 422 INTEGRATION_NOT_ACTIVE. For the parts that call partners. */
export async function activeConnection(req, code) {
  const connection = await findConnection(req, code, { withCredentials: true });
  if (!connection || connection.status !== CONNECTION_STATUSES.ACTIVE) throw new IntegrationNotActiveError();
  return connection;
}

export default {
  activeConnection,
  listEvents,
  listIntegrations,
  newWebhookKey,
  presentConnection,
  saveConnection,
  secretsOf,
  setPaused,
  testConnection,
};
