/**
 * M21 Integrations: partner connections. P25 Part G, API-CONTRACT M21 section 3.
 * Thin: every rule is in services/integrations/connectionService.js.
 */
import {
  listEvents,
  listIntegrations,
  newWebhookKey,
  saveConnection,
  setPaused,
  testConnection,
} from '../services/integrations/connectionService.js';
import { sendList, sendSuccess } from '../utils/response.js';

/** GET /integrations */
export async function getIntegrations(req, res) {
  return sendSuccess(res, await listIntegrations(req));
}

/** PUT /integrations/:provider. 201 when created, with the webhook address once. */
export async function putIntegration(req, res) {
  const { connection, created } = await saveConnection(req, req.params.provider, req.body);
  return sendSuccess(res, connection, created ? 201 : 200);
}

/** POST /integrations/:provider/test */
export async function postTest(req, res) {
  return sendSuccess(res, await testConnection(req, req.params.provider));
}

/** POST /integrations/:provider/pause */
export async function postPause(req, res) {
  return sendSuccess(res, await setPaused(req, req.params.provider, true));
}

/** POST /integrations/:provider/resume */
export async function postResume(req, res) {
  return sendSuccess(res, await setPaused(req, req.params.provider, false));
}

/** POST /integrations/:provider/webhook-key. The new address, once. */
export async function postWebhookKey(req, res) {
  return sendSuccess(res, await newWebhookKey(req, req.params.provider));
}

/** GET /integrations/:provider/events */
export async function getEvents(req, res) {
  const { rows, total, page, limit } = await listEvents(req, req.params.provider, req.query);
  return sendList(res, rows, { page, limit, total });
}
