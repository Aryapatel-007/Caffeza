/**
 * The Tally bridge's own routes. P25 Part K, API-CONTRACT M21 section 9.4.
 *
 *   POST /api/v1/tally-bridge/pair
 *   GET  /api/v1/tally-bridge/jobs/next
 *   POST /api/v1/tally-bridge/jobs/:jobId/result
 *
 * Mounted in server.js before the general JSON parser, with their own body
 * limit (Tally's answer can be large) and their own limiters, and they end the
 * request here. The bridge token is checked by `authenticateBridge` and opens
 * these routes only; no user session is ever made.
 */
import express, { Router } from 'express';

import { bridgeLimiter, bridgePairLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { authenticateBridge, nextJob, pairBridge, submitResult } from '../services/integrations/tally/bridgeService.js';
import { sendSuccess } from '../utils/response.js';
import { bridgeJobResultSchema, bridgePairSchema } from '../validators/integrationValidators.js';

export const TALLY_BRIDGE_PATH = '/tally-bridge';
export const BRIDGE_BODY_LIMIT = '6mb';

const router = Router();
const json = express.json({ limit: BRIDGE_BODY_LIMIT });

router.post('/pair', bridgePairLimiter, express.json({ limit: '4kb' }), validate(bridgePairSchema), async (req, res) => {
  sendSuccess(res, await pairBridge(req.body), 201);
});

router.get('/jobs/next', bridgeLimiter, authenticateBridge, async (req, res) => {
  const job = await nextJob(req);
  if (!job) return res.status(204).end();
  return sendSuccess(res, job);
});

router.post('/jobs/:jobId/result', bridgeLimiter, authenticateBridge, json, validate(bridgeJobResultSchema), async (req, res) => {
  sendSuccess(res, await submitResult(req, req.params.jobId, req.body));
});

export default router;
