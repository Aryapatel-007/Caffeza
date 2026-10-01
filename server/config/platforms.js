/**
 * The delivery platforms an order can come from. M17, P06.
 *
 * A frozen list, like cancelReasons.js. Zomato Gold, Dineout and EazyDiner are
 * not here: those guests sit at a table, so the order is DINE_IN, and only the
 * payment goes through the app. They are payment methods (M10).
 *
 * Mirrored, codes and names only, in client/src/features/orders/platforms.js.
 * A test asserts the two match.
 */
const freezeList = (entries) => Object.freeze(entries.map((entry) => Object.freeze(entry)));

export const PLATFORMS = freezeList([
  { code: 'ZOMATO', name: 'Zomato', orderType: 'DELIVERY' },
  { code: 'SWIGGY', name: 'Swiggy', orderType: 'DELIVERY' },
]);

export const PLATFORM_CODES = Object.freeze(PLATFORMS.map((platform) => platform.code));

export function platformByCode(code) {
  return PLATFORMS.find((platform) => platform.code === code) ?? null;
}
