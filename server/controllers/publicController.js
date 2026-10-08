/**
 * The public page's endpoints. P23 (M14), API-CONTRACT M14 section 2.
 *
 * No token, no cookie. `resolvePublicSite` has already set the tenant from the
 * page address, so every query here is an ordinary scoped one. Every response
 * is a whitelist: a guest never sees a user, a table, a staff note, or another
 * guest's request.
 */
import { CONSENT_TEXTS, CURRENT_CONSENT_VERSION } from '../config/consentText.js';
import { Category } from '../models/Category.js';
import { MenuItem } from '../models/MenuItem.js';
import { presentLogos } from '../services/brandLogoService.js';
import * as onlineOrders from '../services/onlineOrderService.js';
import { openingWindow, windowContaining } from '../services/openingHoursService.js';
import * as reservations from '../services/reservationService.js';
import { presentAppearance } from '../services/settingsService.js';
import { sendSuccess } from '../utils/response.js';
import { scoped } from '../utils/scopedQuery.js';
import { businessDateFor, nowUtc } from '../utils/time.js';

/** GET /public/:slug */
export function getSite(req, res) {
  const { branch, restaurant, settings } = req.publicSite;
  const { online } = settings;
  const dayStart = settings.business.businessDayStartsAtMinutes;
  const now = nowUtc();

  const today = windowContaining(now, online, dayStart) ?? openingWindow(businessDateFor(now, dayStart), online);
  const appearance = presentAppearance(settings.appearance, restaurant.name);
  const logos = presentLogos(restaurant);
  const slug = branch.online.publicSlug;
  const logoUrl = (slot) => (logos[slot]?.hash ? `/api/v1/public/${slug}/logo/${slot}` : null);

  const address = branch.address?.line1 || branch.address?.city ? branch.address : restaurant.address;

  res.set('Cache-Control', 'no-store');
  return sendSuccess(res, {
    restaurantName: restaurant.name,
    wordmark: appearance.wordmark,
    address: {
      line1: address?.line1 ?? null,
      line2: address?.line2 ?? null,
      city: address?.city ?? null,
      pincode: address?.pincode ?? null,
    },
    contactPhone: branch.contactPhone ?? restaurant.contactPhone ?? null,
    logo: { darkGround: logoUrl('DARK_GROUND'), lightGround: logoUrl('LIGHT_GROUND') },
    appearance: {
      accent: appearance.accent,
      accentNight: appearance.accentNight,
      neutralTone: appearance.neutralTone,
      brandHex: appearance.brandHex,
      onBrandHex: appearance.onBrandHex,
    },
    hours: {
      opensAtMinutes: online.opensAtMinutes,
      closesAtMinutes: online.closesAtMinutes,
      todayOpensAt: today.opensAt,
      todayClosesAt: today.closesAt,
    },
    pageNote: online.pageNote ?? null,
    takeaway: onlineOrders.takeawayState(now, online, dayStart, branch),
    reservations: {
      enabled: online.reservationsEnabled,
      maxPartySize: online.reservationMaxPartySize,
      daysAhead: online.reservationDaysAhead,
    },
    consentText: CONSENT_TEXTS[CURRENT_CONSENT_VERSION].replace('{restaurant}', restaurant.name),
  });
}

/** GET /public/:slug/menu. Active and available only, each item reduced to the contract's fields. */
export async function getMenu(req, res) {
  const categories = await Category.find({ ...scoped(req), isActive: true }).sort({ displayOrder: 1, name: 1 });
  const items = await MenuItem.find({
    ...scoped(req),
    isActive: true,
    isAvailable: true,
    categoryId: { $in: categories.map((category) => category._id) },
  }).sort({ displayOrder: 1, name: 1 });

  const byCategory = new Map();
  for (const item of items) {
    const key = String(item.categoryId);
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push({
      id: String(item._id),
      name: item.name,
      description: item.description ?? null,
      priceInPaise: item.priceInPaise,
      variants: item.variants
        .filter((variant) => variant.isAvailable !== false)
        .map((variant) => ({ id: String(variant._id), name: variant.name, priceInPaise: variant.priceInPaise })),
      addOns: item.addOns
        .filter((addOn) => addOn.isAvailable !== false)
        .map((addOn) => ({ id: String(addOn._id), name: addOn.name, priceInPaise: addOn.priceInPaise })),
    });
  }

  res.set('Cache-Control', 'public, max-age=30');
  return sendSuccess(
    res,
    categories
      .map((category) => ({ id: String(category._id), name: category.name, items: byCategory.get(String(category._id)) ?? [] }))
      // A guest has no use for a tab with nothing in it.
      .filter((category) => category.items.length > 0),
  );
}

/** POST /public/:slug/quote */
export async function postQuote(req, res) {
  return sendSuccess(res, await onlineOrders.quote(req, req.body.lines));
}

/** POST /public/:slug/orders */
export async function postOrder(req, res) {
  const { created, doc, token } = await onlineOrders.place(req, req.body);
  const view = await onlineOrders.serialiseForGuest(req, doc);
  res.set('Cache-Control', 'no-store');
  // The status token is sent once, here, and never again.
  return sendSuccess(res, created ? { ...view, statusToken: token } : view, created ? 201 : 200);
}

/** GET /public/:slug/orders/:id */
export async function getOrder(req, res) {
  res.set('Cache-Control', 'no-store');
  return sendSuccess(res, await onlineOrders.guestRead(req, req.params.id));
}

/** POST /public/:slug/orders/:id/cancel */
export async function postCancelOrder(req, res) {
  return sendSuccess(res, await onlineOrders.guestCancel(req, req.params.id));
}

/** GET /public/:slug/reservations/slots */
export async function getSlots(req, res) {
  res.set('Cache-Control', 'no-store');
  return sendSuccess(res, await reservations.slots(req, req.query));
}

/** POST /public/:slug/reservations */
export async function postReservation(req, res) {
  const { created, doc, token } = await reservations.request(req, req.body);
  const view = reservations.serialiseForGuest(doc);
  res.set('Cache-Control', 'no-store');
  return sendSuccess(res, created ? { ...view, statusToken: token } : view, created ? 201 : 200);
}

/** GET /public/:slug/reservations/:id */
export async function getReservation(req, res) {
  res.set('Cache-Control', 'no-store');
  return sendSuccess(res, await reservations.guestRead(req, req.params.id));
}

/** POST /public/:slug/reservations/:id/cancel */
export async function postCancelReservation(req, res) {
  return sendSuccess(res, await reservations.guestCancel(req, req.params.id));
}
