/**
 * The mirror's replication routes. P62, docs/REPLICATION.md section 5.
 *
 * Called only by the cafe box, signed with REPLICATION_SECRET over the exact
 * EJSON bytes. Mounted before the JSON parser, with their own body limit, the
 * way the partners' webhooks are, and answered only on a MIRROR: anywhere
 * else they do not exist.
 *
 *   POST /replication/batches         apply a batch of the changelog
 *   POST /replication/intake/claim    hand the box the oldest waiting intake
 *   POST /replication/intake/result   the box's outcome for one item
 *   POST /replication/reconcile       counts and digests, for the box to compare
 */
import express, { Router } from 'express';

import { config } from '../config/env.js';
import { isMirror } from '../config/deployment.js';
import { claimIntake, recordIntakeOutcome } from '../services/intake/cloudIntake.js';
import { digestRestaurant } from '../services/replication/reconcile.js';
import { applyBatch, mirrorPosition, noteBoxSeen } from '../services/replication/receiver.js';
import { fromWire, SIGNATURE_HEADER, signatureMatches } from '../services/replication/signing.js';
import { NotFoundError, ReplicationSignatureError, ValidationError } from '../utils/errors.js';
import { sendSuccess } from '../utils/response.js';

export const REPLICATION_ROUTES_PATH = '/replication';
export const REPLICATION_BODY_LIMIT = '16mb';

const router = Router();

/** Only a mirror answers, and only a signed request. */
function signedOnly(req, _res, next) {
  if (!isMirror()) return next(new NotFoundError());
  const text = typeof req.body === 'string' ? req.body : '';
  if (!signatureMatches(config.REPLICATION_SECRET, text, req.get(SIGNATURE_HEADER))) return next(new ReplicationSignatureError());
  try {
    // Exact types for documents: an Int32 stays an Int32 in the copy.
    req.payload = fromWire(text);
  } catch {
    return next(new ValidationError('The replication body was not valid EJSON.'));
  }
  return next();
}

router.use(express.text({ type: () => true, limit: REPLICATION_BODY_LIMIT }), signedOnly);

router.post('/batches', async (req, res) => {
  const result = await applyBatch(req.payload);
  return sendSuccess(res, { ...result, position: await mirrorPosition(req.payload.restaurantId) });
});

router.post('/intake/claim', async (req, res) => {
  const restaurantIds = Array.isArray(req.payload.restaurantIds) ? req.payload.restaurantIds : [];
  await Promise.all(restaurantIds.map((restaurantId) => noteBoxSeen(restaurantId)));
  const limit = Math.min(Math.max(Number(req.payload.limit) || 20, 1), 100);
  return sendSuccess(res, { items: await claimIntake(restaurantIds, { limit }) });
});

router.post('/intake/result', async (req, res) => {
  const { restaurantId, intakeId, status, reasonCode, reasonMessage, result, statusToken } = req.payload;
  const updated = await recordIntakeOutcome(restaurantId, intakeId, { status, reasonCode, reasonMessage, result, statusToken });
  return sendSuccess(res, { recorded: Boolean(updated) });
});

router.post('/reconcile', async (req, res) => {
  return sendSuccess(res, await digestRestaurant(req.payload.restaurantId, { businessDate: req.payload.businessDate ?? null }));
});

export default router;
