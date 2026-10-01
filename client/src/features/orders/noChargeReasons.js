/**
 * The fixed No Charge reasons. P08.
 *
 * A mirror of server/config/noChargeReasons.js, codes and labels only. A server
 * test loads this file and checks the two match, which is why it has no
 * imports.
 */

export const NO_CHARGE_REASONS = [
  { code: 'CORPORATE_OFFICE', label: 'Corporate office order' },
  { code: 'STAFF_MEAL', label: 'Staff meal' },
  { code: 'OWNER_GUEST', label: "Owner's guest" },
  { code: 'TASTING', label: 'Tasting or trial' },
  { code: 'SERVICE_RECOVERY', label: 'Service recovery' },
  { code: 'OTHER', label: 'Other' },
];
