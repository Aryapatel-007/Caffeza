/**
 * The fixed reasons for declining an online takeaway or a booking. P23 (M14).
 *
 * Constants, not settings, for the same reason as config/cancelReasons.js.
 * Each reason has two labels: `label` is what staff see on the button, and
 * `guestLabel` is the only text about the decline a guest is ever shown. The
 * staff note never leaves the server's staff endpoints.
 *
 * Mirrored, codes and both labels, in client/src/features/online/onlineReasons.js.
 * A test asserts the two files hold exactly the same entries in the same order.
 */

export const DECLINE_REASONS = Object.freeze(
  [
    {
      code: 'ITEM_UNAVAILABLE',
      label: 'An item is not available',
      guestLabel: 'Something you ordered is not available right now',
    },
    { code: 'TOO_BUSY', label: 'Too busy right now', guestLabel: 'The cafe is too busy to take this right now' },
    { code: 'CLOSING_SOON', label: 'Closing soon', guestLabel: 'The cafe is closing soon' },
    { code: 'FULLY_BOOKED', label: 'No table free then', guestLabel: 'There is no table free at that time' },
    { code: 'SUSPECTED_FAKE', label: 'Looks like a fake request', guestLabel: 'The cafe could not confirm this' },
    { code: 'OTHER', label: 'Other', guestLabel: 'The cafe could not take this' },
  ].map((entry) => Object.freeze(entry)),
);

export const DECLINE_REASON_CODES = Object.freeze(DECLINE_REASONS.map((entry) => entry.code));

/** The code that requires a note. */
export const DECLINE_OTHER_CODE = 'OTHER';

export function guestLabelFor(code) {
  return DECLINE_REASONS.find((entry) => entry.code === code)?.guestLabel ?? null;
}
