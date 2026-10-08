/**
 * Mirror of server/config/onlineReasons.js, codes and both labels. P23.
 * A server test asserts the two hold the same entries in the same order.
 */
export const DECLINE_REASONS = Object.freeze([
  { code: 'ITEM_UNAVAILABLE', label: 'An item is not available', guestLabel: 'Something you ordered is not available right now' },
  { code: 'TOO_BUSY', label: 'Too busy right now', guestLabel: 'The cafe is too busy to take this right now' },
  { code: 'CLOSING_SOON', label: 'Closing soon', guestLabel: 'The cafe is closing soon' },
  { code: 'FULLY_BOOKED', label: 'No table free then', guestLabel: 'There is no table free at that time' },
  { code: 'SUSPECTED_FAKE', label: 'Looks like a fake request', guestLabel: 'The cafe could not confirm this' },
  { code: 'OTHER', label: 'Other', guestLabel: 'The cafe could not take this' },
]);

/** The order screen's takeaway reasons do not apply to a booking, and vice versa. */
export const ORDER_DECLINE_REASONS = DECLINE_REASONS.filter((reason) => reason.code !== 'FULLY_BOOKED');
export const BOOKING_DECLINE_REASONS = DECLINE_REASONS.filter((reason) => reason.code !== 'ITEM_UNAVAILABLE');
