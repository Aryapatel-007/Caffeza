/**
 * Why a platform order is turned away. P25 Part H, API-CONTRACT M8 "Added by
 * P25". Mirrored, codes and labels, in
 * client/src/features/online/platformRejectReasons.js. Each adapter maps our
 * code to its platform's own.
 */
const freezeList = (list) => Object.freeze(list.map((entry) => Object.freeze(entry)));

export const PLATFORM_REJECT_REASONS = freezeList([
  { code: 'ITEM_OUT_OF_STOCK', label: 'Item out of stock' },
  { code: 'KITCHEN_BUSY', label: 'Kitchen too busy' },
  { code: 'STORE_CLOSING', label: 'Closing soon' },
  { code: 'OTHER', label: 'Other' },
]);

export const PLATFORM_REJECT_REASON_CODES = Object.freeze(PLATFORM_REJECT_REASONS.map((entry) => entry.code));

export default { PLATFORM_REJECT_REASONS, PLATFORM_REJECT_REASON_CODES };
