/**
 * Restaurant settings. Shapes from docs/API-CONTRACT.md section M7.
 *
 * There is no restaurant id in either URL. The restaurant is the one in the
 * token, the same rule GET /restaurant follows: there is no legitimate reason
 * for a client to name a restaurant other than its own.
 *
 * Both handlers are thin on purpose. Everything that knows what a setting is,
 * where it is stored, and what changing one has to record lives in
 * services/settingsService.js, and this file never reaches into
 * `restaurant.settings` itself.
 */
import { getSettings, updateSettings } from '../services/settingsService.js';
import { sendSuccess } from '../utils/response.js';

/** GET /settings. OWNER and MANAGER. */
export async function getRestaurantSettings(req, res) {
  return sendSuccess(res, await getSettings(req.restaurantId, { req }));
}

/**
 * PATCH /settings. OWNER only.
 *
 * Owner-only because this object holds the GST pricing mode, which is a legally
 * significant choice, and the business day boundary, which silently moves which
 * day every future sale lands on.
 *
 * `reason` is pulled out of the body and the rest is the patch. The service
 * decides what actually changed; a field sent with the value it already has is
 * not a change and writes no audit line.
 */
export async function updateRestaurantSettings(req, res) {
  const { reason, ...patch } = req.body;

  const settings = await updateSettings(req.restaurantId, patch, {
    actorId: req.user.id,
    // Snapshotted, because roles change and the audit line must keep saying
    // what was true at the time.
    actorRole: req.user.role,
    branchId: req.branchId,
    reason,
    req,
  });

  req.log?.info(
    { actorId: req.user.id, groups: Object.keys(patch) },
    'Restaurant settings changed.',
  );

  return sendSuccess(res, settings);
}
