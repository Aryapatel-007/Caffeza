/**
 * The fixed reasons for a No Charge order. M16, built in P08.
 * docs/API-CONTRACT.md "M16 Settlement and Day Close" section 1.
 *
 * Constants, like cancelReasons.js and discountReasons.js. Append only.
 *
 * Mirrored, codes and labels only, in client/src/features/orders/noChargeReasons.js.
 * A test keeps the two equal.
 */
const freezeList = (entries) => Object.freeze(entries.map((entry) => Object.freeze(entry)));

export const NO_CHARGE_REASONS = freezeList([
  { code: 'CORPORATE_OFFICE', label: 'Corporate office order' },
  { code: 'STAFF_MEAL', label: 'Staff meal' },
  { code: 'OWNER_GUEST', label: "Owner's guest" },
  { code: 'TASTING', label: 'Tasting or trial' },
  { code: 'SERVICE_RECOVERY', label: 'Service recovery' },
  { code: 'OTHER', label: 'Other' },
]);

export const NO_CHARGE_REASON_CODES = Object.freeze(NO_CHARGE_REASONS.map((reason) => reason.code));
