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
  getTerminalPayment,
  getUnmapped,
  postCancelTerminalPayment,
  postTerminalPayment,
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
import {
  getBridges,
  getLedgerMastersFile,
  getTallyDays,
  getTallyExportFile,
  postPairingCode,
  postRevokeBridge,
  postTallyExports,
  postTallyRedo,
  postTallySend,
} from '../controllers/tallyController.js';
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
  startTerminalPaymentSchema,
  storeStatusSchema,
  terminalPaymentIdSchema,
  listEventsSchema,
  listIntegrationsSchema,
  providerActionSchema,
  saveIntegrationSchema,
  createTallyExportsSchema,
  redoTallyExportSchema,
  tallyDaysSchema,
  tallyExportIdSchema,
  tallyLedgerMastersSchema,
  listBridgesSchema,
  pairingCodeSchema,
  tallyBridgeIdSchema,
} from '../validators/integrationValidators.js';

const router = Router();
const owner = [authenticate, tenant, requireRole(ROLES.OWNER)];
const managers = [authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER)];

const till = [authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER)];

router.get('/integrations', ...managers, validate(listIntegrationsSchema), getIntegrations);

// P25 Part J. Tally exports: the owner and the manager; a redo and the ledger masters, the owner.
router.get('/integrations/tally/days', ...managers, validate(tallyDaysSchema), getTallyDays);
router.post('/integrations/tally/exports', ...managers, validate(createTallyExportsSchema), postTallyExports);
router.get('/integrations/tally/exports/:id/file', ...managers, validate(tallyExportIdSchema), getTallyExportFile);
router.post('/integrations/tally/exports/:id/redo', ...owner, validate(redoTallyExportSchema), postTallyRedo);
router.get('/integrations/tally/ledger-masters/file', ...owner, validate(tallyLedgerMastersSchema), getLedgerMastersFile);
// P25 Part K. Sending through the bridge, and the bridges themselves.
router.post('/integrations/tally/exports/:id/send', ...managers, validate(tallyExportIdSchema), postTallySend);
router.post('/integrations/tally/bridges/pairing-code', ...owner, validate(pairingCodeSchema), postPairingCode);
router.get('/integrations/tally/bridges', ...managers, validate(listBridgesSchema), getBridges);
router.post('/integrations/tally/bridges/:id/revoke', ...owner, validate(tallyBridgeIdSchema), postRevokeBridge);
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

// P25 Part I. The card machine: the till, and a captain when both billing settings allow (checked in the controller).
const tillAndCaptains = [authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER)];
router.post('/bills/:billId/terminal-payments', ...tillAndCaptains, validate(startTerminalPaymentSchema), postTerminalPayment);
router.get('/terminal-payments/:id', ...tillAndCaptains, validate(terminalPaymentIdSchema), getTerminalPayment);
router.post('/terminal-payments/:id/cancel', ...tillAndCaptains, validate(terminalPaymentIdSchema), postCancelTerminalPayment);

export default router;
