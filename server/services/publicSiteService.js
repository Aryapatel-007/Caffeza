/**
 * The public page's front door. P23 (M14), API-CONTRACT M14 section 1.
 *
 * A guest's browser carries no token, so the restaurant is found from the page
 * address instead. That lookup reads `branches` across every restaurant, which
 * the tenant guard exists to stop, so it happens here and nowhere else, and the
 * tenant guard tripwire test counts it.
 *
 * Once the slug is resolved, `req.restaurantId` and `req.branchId` are set and
 * every later query is an ordinary `scoped(req)` query under the guard. Nothing
 * downstream of this file knows the request was public.
 */
import { Branch } from '../models/Branch.js';
import { Restaurant } from '../models/Restaurant.js';
import { NotFoundError } from '../utils/errors.js';
import { getSettings } from './settingsService.js';

/** One body for every way a page can be missing, so an outsider learns nothing. */
export const PAGE_NOT_FOUND_MESSAGE = 'This page does not exist.';

/**
 * Finds the active branch with this page address, and its active restaurant
 * with online orders switched on. Throws the same 404 for every failure.
 */
export async function resolveSlug(slug) {
  if (typeof slug !== 'string' || slug.length === 0) throw new NotFoundError(PAGE_NOT_FOUND_MESSAGE);

  // The one query across restaurants M14 adds. DB-SCHEMA section 28.
  const branch = await Branch.findOne({ 'online.publicSlug': slug, isActive: true }).setOptions({
    skipTenantGuard: true,
  });
  if (!branch) throw new NotFoundError(PAGE_NOT_FOUND_MESSAGE);

  // `restaurants` is a tenancy root and is read by _id, from the branch just found.
  const restaurant = await Restaurant.findById(branch.restaurantId);
  if (!restaurant || restaurant.isActive === false) throw new NotFoundError(PAGE_NOT_FOUND_MESSAGE);

  const settings = await getSettings(restaurant._id);
  if (!settings.features.online) throw new NotFoundError(PAGE_NOT_FOUND_MESSAGE);

  return { branch, restaurant, settings };
}

/**
 * Middleware: resolves `req.params.slug` and sets the tenant on the request,
 * exactly as `tenant` does for a signed-in request.
 */
export async function resolvePublicSite(req, res, next) {
  try {
    const site = await resolveSlug(String(req.params.slug ?? '').toLowerCase());
    req.restaurantId = String(site.restaurant._id);
    req.branchId = String(site.branch._id);
    req.publicSite = site;
    return next();
  } catch (error) {
    return next(error);
  }
}

export default { resolveSlug, resolvePublicSite };
