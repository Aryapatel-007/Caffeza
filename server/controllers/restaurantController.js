/**
 * The caller own restaurant.
 *
 * There is no endpoint that takes a restaurant id. The restaurant is always
 * the one in the token, because there is no legitimate reason for a client to
 * name a restaurant other than its own.
 */
import { Restaurant } from '../models/Restaurant.js';
import { NotFoundError } from '../utils/errors.js';
import { sendSuccess } from '../utils/response.js';

/** The full document minus anything internal. */
function present(restaurant) {
  const record = restaurant.toJSON();
  // Platform state, not customer state. Nothing on their settings screen acts
  // on it, so it does not belong in their settings response.
  delete record.isActive;
  return record;
}

/**
 * GET /restaurant
 *
 * The authenticate middleware already loaded this on the way in, scoped to the
 * id inside the verified token.
 */
export function getRestaurant(req, res) {
  return sendSuccess(res, present(req.currentRestaurant));
}

/**
 * Flattens `settings` into dotted paths, so a partial settings write stays
 * partial.
 *
 * `$set: { settings: { businessDayStartsAtMinutes: 420 } }` replaces the WHOLE
 * settings subdocument, dropping every key the request did not mention. That
 * was harmless while `settings` had exactly one key, which is what the note on
 * this endpoint's schema used to say. M7 gave it four groups, and without this
 * an owner moving their business day through PATCH /restaurant would silently
 * reset their tax rate and wipe their receipt text.
 *
 * Only `settings` needs this. `address` is genuinely replace-whole: the schema
 * accepts it as one object and every field on it is optional, so sending a
 * partial address means the address IS that partial thing.
 */
function toUpdatePaths(body) {
  const { settings, ...rest } = body;
  if (!settings) return rest;

  const update = { ...rest };
  for (const [key, value] of Object.entries(settings)) update[`settings.${key}`] = value;
  return update;
}

/**
 * PATCH /restaurant. OWNER only.
 *
 * The schema is `.strict()`, so `isActive` is rejected rather than ignored.
 * Deactivating a restaurant is a platform operation.
 *
 * This endpoint still accepts `settings.businessDayStartsAtMinutes`, as the
 * contract's section 2.2 documents. PATCH /settings is the fuller way in as of
 * M7, and both write the same stored path.
 */
export async function updateRestaurant(req, res) {
  /**
   * Legitimate unguarded query pattern 1: by _id from a verified token.
   *
   * findOneAndUpdate rather than a read-modify-save, so two owners editing
   * different fields at once cannot overwrite each other with a stale copy.
   */
  const restaurant = await Restaurant.findOneAndUpdate(
    { _id: req.restaurantId },
    { $set: toUpdatePaths(req.body) },
    { new: true, runValidators: true },
  );

  // A token for a restaurant that no longer exists. 404, never 403.
  if (!restaurant) throw new NotFoundError('Restaurant not found.');

  return sendSuccess(res, present(restaurant));
}
