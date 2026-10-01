/**
 * The fixed discount reasons. P08.
 *
 * A mirror of server/config/discountReasons.js, codes, labels and the platform
 * flag only, so the buttons say exactly what the reports will print. A server
 * test loads this file and checks the two hold the same entries in the same
 * order, which is why it has no imports.
 */

export const DISCOUNT_REASONS = [
  { code: 'ZOMATO_GOLD', label: 'Zomato Gold', isPlatform: true },
  { code: 'DINEOUT', label: 'Dineout', isPlatform: true },
  { code: 'EAZYDINER', label: 'EazyDiner', isPlatform: true },
  { code: 'REGULAR_GUEST', label: 'Regular guest', isPlatform: false },
  { code: 'REFERRAL', label: 'Referral', isPlatform: false },
  { code: 'STAFF_OFFICE', label: 'Staff or office', isPlatform: false },
  { code: 'MERCHANT_PROMO', label: 'Merchant promo', isPlatform: false },
  { code: 'SERVICE_RECOVERY', label: 'Service recovery', isPlatform: false },
  { code: 'OTHER', label: 'Other', isPlatform: false },
];

export const PLATFORM_DISCOUNT_REASONS = DISCOUNT_REASONS.filter((reason) => reason.isPlatform);

export function discountReasonLabel(code) {
  return DISCOUNT_REASONS.find((reason) => reason.code === code)?.label ?? code;
}
