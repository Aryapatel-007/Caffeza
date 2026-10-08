/**
 * M21 Integrations. P25 Part G, API-CONTRACT M21 section 3.
 *
 * OWNER changes connections and credentials; OWNER and MANAGER read them and
 * their event logs. The webhook route is separate (hookRoutes.js): it has no
 * user. `PUT` replaces the whole connection, the same reason the logo upload is
 * a PUT.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import {
  getEvents,
  getIntegrations,
  getMappings,
  getPlatformOrder,
  getPlatformOrders,
  getUnmapped,
  postAcceptPlatformOrder,
  postHandedOver,
  postImportMappings,
  postMenuPush,
  postRejectPlatformOrder,
  postStoreStatus,
  putMapping,
  removeMapping,
  postPause,
  postResume,
  postTest,
  postWebhookKey,
  putIntegration,
} from '../controllers/integrationController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  acceptPlatformOrderSchema,
  deleteMappingSchema,
  handedOverSchema,
  importMappingsSchema,
  listMappingsSchema,
  listPlatformOrdersSchema,
  platformOrderIdSchema,
  rejectPlatformOrderSchema,
  saveMappingSchema,
  storeStatusSchema,
  listEventsSchema,
  listIntegrationsSchema,
  providerActionSchema,
  saveIntegrationSchema,
} from '../validators/integrationValidators.js';

const router = Router();
const owner = [authenticate, tenant, requireRole(ROLES.OWNER)];
const managers = [authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER)];

const till = [authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER)];

router.get('/integrations', ...managers, validate(listIntegrationsSchema), getIntegrations);
router.put('/integrations/:provider', ...owner, validate(saveIntegrationSchema), putIntegration);
router.post('/integrations/:provider/test', ...owner, validate(providerActionSchema), postTest);
router.post('/integrations/:provider/pause', ...owner, validate(providerActionSchema), postPause);
router.post('/integrations/:provider/resume', ...owner, validate(providerActionSchema), postResume);
router.post('/integrations/:provider/webhook-key', ...owner, validate(providerActionSchema), postWebhookKey);
router.get('/integrations/:provider/events', ...managers, validate(listEventsSchema), getEvents);

// P25 Part H. Store status, menu push and item mapping: the owner and the manager.
router.post('/integrations/:provider/store-status', ...managers, validate(storeStatusSchema), postStoreStatus);
router.post('/integrations/:provider/menu-push', ...managers, validate(providerActionSchema), postMenuPush);
router.get('/integrations/:provider/item-mappings', ...managers, validate(listMappingsSchema), getMappings);
router.get('/integrations/:provider/item-mappings/unmapped', ...managers, validate(providerActionSchema), getUnmapped);
router.put('/integrations/:provider/item-mappings', ...managers, validate(saveMappingSchema), putMapping);
router.post('/integrations/:provider/item-mappings/import', ...managers, validate(importMappingsSchema), postImportMappings);
router.delete('/integrations/:provider/item-mappings/:mappingId', ...managers, validate(deleteMappingSchema), removeMapping);

// P25 Part H. Platform orders: the till decides them.
router.get('/platform-orders', ...till, validate(listPlatformOrdersSchema), getPlatformOrders);
router.get('/platform-orders/:id', ...till, validate(platformOrderIdSchema), getPlatformOrder);
router.post('/platform-orders/:id/accept', ...till, validate(acceptPlatformOrderSchema), postAcceptPlatformOrder);
router.post('/platform-orders/:id/reject', ...till, validate(rejectPlatformOrderSchema), postRejectPlatformOrder);
router.post('/platform-orders/:id/handed-over', ...till, validate(handedOverSchema), postHandedOver);

export default router;
