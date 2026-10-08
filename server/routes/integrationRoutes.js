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
  listEventsSchema,
  listIntegrationsSchema,
  providerActionSchema,
  saveIntegrationSchema,
} from '../validators/integrationValidators.js';

const router = Router();
const owner = [authenticate, tenant, requireRole(ROLES.OWNER)];
const managers = [authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER)];

router.get('/integrations', ...managers, validate(listIntegrationsSchema), getIntegrations);
router.put('/integrations/:provider', ...owner, validate(saveIntegrationSchema), putIntegration);
router.post('/integrations/:provider/test', ...owner, validate(providerActionSchema), postTest);
router.post('/integrations/:provider/pause', ...owner, validate(providerActionSchema), postPause);
router.post('/integrations/:provider/resume', ...owner, validate(providerActionSchema), postResume);
router.post('/integrations/:provider/webhook-key', ...owner, validate(providerActionSchema), postWebhookKey);
router.get('/integrations/:provider/events', ...managers, validate(listEventsSchema), getEvents);

export default router;
