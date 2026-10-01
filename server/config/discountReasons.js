/**
 * The fixed reasons for a discount, and who paid for it. M10, built in P08.
 * docs/API-CONTRACT.md "M10 Payments" section 4.
 *
 * Constants, not settings, for the same reason as cancelReasons.js: reports
 * group by code, so renaming one would split a restaurant's history in two.
 * Adding a reason is an append, never a rename and never a reorder.
 *
 * A platform reason is a discount a dining platform offered the guest: Zomato
 * Gold, Dineout, EazyDiner. Only those may be funded by the platform, and only
 * those may be applied by a cashier when the setting allows it.
 *
 * Mirrored, codes, labels and the platform flag only, in
 * client/src/features/billing/discountReasons.js. A test keeps the two equal.
 */
const freezeList = (entries) => Object.freeze(entries.map((entry) => Object.freeze(entry)));

export const DISCOUNT_REASONS = freezeList([
  { code: 'ZOMATO_GOLD', label: 'Zomato Gold', isPlatform: true },
  { code: 'DINEOUT', label: 'Dineout', isPlatform: true },
  { code: 'EAZYDINER', label: 'EazyDiner', isPlatform: true },
  { code: 'REGULAR_GUEST', label: 'Regular guest', isPlatform: false },
  { code: 'REFERRAL', label: 'Referral', isPlatform: false },
  { code: 'STAFF_OFFICE', label: 'Staff or office', isPlatform: false },
  { code: 'MERCHANT_PROMO', label: 'Merchant promo', isPlatform: false },
  { code: 'SERVICE_RECOVERY', label: 'Service recovery', isPlatform: false },
  { code: 'OTHER', label: 'Other', isPlatform: false },
]);

export const DISCOUNT_REASON_CODES = Object.freeze(DISCOUNT_REASONS.map((reason) => reason.code));

export const PLATFORM_DISCOUNT_REASON_CODES = Object.freeze(
  DISCOUNT_REASONS.filter((reason) => reason.isPlatform).map((reason) => reason.code),
);

export const isPlatformDiscountReason = (code) => PLATFORM_DISCOUNT_REASON_CODES.includes(code);

export const DISCOUNT_FUNDERS = Object.freeze({
  RESTAURANT: 'RESTAURANT',
  PLATFORM: 'PLATFORM',
});
export const DISCOUNT_FUNDER_VALUES = Object.freeze(Object.values(DISCOUNT_FUNDERS));
