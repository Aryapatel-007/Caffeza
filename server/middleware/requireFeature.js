/**
 * Feature switches. Runs after `tenant` and before `requireRole`.
 *
 * A restaurant can switch inventory (M4) and attendance (M5) off in
 * `settings.features`. Hiding the links in React is tidiness; this is the part
 * that actually refuses the request.
 *
 * It sits before the role check on purpose. A waiter reaching a switched-off
 * feature should be told it is switched off, not that their role is not
 * allowed, because the second answer sends them to a manager who cannot help.
 *
 *   router.get('/ingredients', authenticate, tenant, requireFeature('inventory'),
 *     requireRole(...), validate(...), getIngredients);
 */
import { isFeatureOn } from '../services/settingsService.js';
import { FeatureDisabledError, UnauthenticatedError } from '../utils/errors.js';

/** The switchable features, and the word used for each in the refusal. */
const FEATURE_LABELS = Object.freeze({
  inventory: 'Inventory',
  attendance: 'Attendance',
  online: 'Online orders and bookings',
});

/**
 * Builds a middleware that refuses the request with 403 FEATURE_DISABLED when
 * the named feature is off. The name is checked when the route is defined, so
 * a typo crashes at boot rather than silently letting everything through.
 */
export function requireFeature(name) {
  if (!(name in FEATURE_LABELS)) {
    throw new Error(
      `requireFeature() got "${name}". Valid features are: ${Object.keys(FEATURE_LABELS).join(', ')}.`,
    );
  }

  return async function checkFeature(req, res, next) {
    if (!req.restaurantId) {
      // Wrong middleware order: this runs after tenant, always. Fail closed.
      return next(new UnauthenticatedError('Sign in to continue.'));
    }

    try {
      if (!(await isFeatureOn(req, name))) {
        return next(new FeatureDisabledError(FEATURE_LABELS[name]));
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * P25 Part H. The incoming requests inbox is on when online orders are, or
 * when any delivery platform connection is on: platform orders arrive there
 * too. Otherwise the same 403 FEATURE_DISABLED as online orders off.
 */
export async function requireOnlineOrChannel(req, res, next) {
  if (!req.restaurantId) return next(new UnauthenticatedError('Sign in to continue.'));
  try {
    if (await isFeatureOn(req, 'online')) return next();
    const { activeOrderChannels } = await import('../services/integrations/channelStatus.js');
    if ((await activeOrderChannels(req)).length > 0) return next();
    return next(new FeatureDisabledError(FEATURE_LABELS.online));
  } catch (error) {
    return next(error);
  }
}

export default { requireFeature, requireOnlineOrChannel };
