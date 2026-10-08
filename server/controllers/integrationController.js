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
import { deleteMapping, importMappings, listMappings, saveMapping, unmappedItems } from '../services/integrations/mappingService.js';
import {
  acceptPlatformOrder,
  handedOver,
  listPlatformOrders,
  pushMenu,
  readPlatformOrder,
  rejectPlatformOrder,
  setStoreStatus,
} from '../services/integrations/platformOrderService.js';
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

/* P25 Part H. Platform orders, item mapping, store status, menu push. ---- */

/** GET /platform-orders */
export async function getPlatformOrders(req, res) {
  const { rows, total, page, limit } = await listPlatformOrders(req, req.query);
  return sendList(res, rows, { page, limit, total });
}

/** GET /platform-orders/:id */
export async function getPlatformOrder(req, res) {
  return sendSuccess(res, await readPlatformOrder(req, req.params.id));
}

/** POST /platform-orders/:id/accept */
export async function postAcceptPlatformOrder(req, res) {
  return sendSuccess(res, await acceptPlatformOrder(req, req.params.id, req.body ?? {}));
}

/** POST /platform-orders/:id/reject */
export async function postRejectPlatformOrder(req, res) {
  return sendSuccess(res, await rejectPlatformOrder(req, req.params.id, req.body));
}

/** POST /platform-orders/:id/handed-over */
export async function postHandedOver(req, res) {
  return sendSuccess(res, await handedOver(req, req.params.id));
}

/** POST /integrations/:provider/store-status */
export async function postStoreStatus(req, res) {
  return sendSuccess(res, await setStoreStatus(req, req.params.provider, req.body));
}

/** POST /integrations/:provider/menu-push */
export async function postMenuPush(req, res) {
  return sendSuccess(res, await pushMenu(req, req.params.provider));
}

/** GET /integrations/:provider/item-mappings */
export async function getMappings(req, res) {
  const { rows, total, page, limit } = await listMappings(req, req.params.provider, req.query);
  return sendList(res, rows, { page, limit, total });
}

/** GET /integrations/:provider/item-mappings/unmapped */
export async function getUnmapped(req, res) {
  return sendSuccess(res, await unmappedItems(req, req.params.provider));
}

/** PUT /integrations/:provider/item-mappings */
export async function putMapping(req, res) {
  return sendSuccess(res, await saveMapping(req, req.params.provider, req.body));
}

/** DELETE /integrations/:provider/item-mappings/:mappingId */
export async function removeMapping(req, res) {
  return sendSuccess(res, await deleteMapping(req, req.params.provider, req.params.mappingId));
}

/** POST /integrations/:provider/item-mappings/import */
export async function postImportMappings(req, res) {
  return sendSuccess(res, await importMappings(req, req.params.provider, req.body));
}
