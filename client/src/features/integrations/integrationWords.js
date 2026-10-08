/**
 * Words and states for the integration screens. P25 Part L. Labels follow
 * docs/GLOSSARY.md sections 16 and 15.
 */
export const KIND_WORDS = Object.freeze({
  ORDER_CHANNEL: 'Order channel',
  PAYMENT_TERMINAL: 'Payment terminal',
  ACCOUNTING: 'Accounting',
});

/** A connection's status as a StateChip state and word. */
export function connectionChip(entry) {
  if (entry.availability === 'WAITING_FOR_PARTNER') return { state: 'free', word: 'Waiting for partner approval' };
  const status = entry.connection?.status;
  if (!status) return { state: 'free', word: 'Not set up' };
  return {
    ACTIVE: { state: 'ok', word: 'Connected' },
    DRAFT: { state: 'open', word: 'Not tested yet' },
    PAUSED: { state: 'free', word: 'Paused' },
    ERROR: { state: 'alert', word: 'Not working' },
  }[status] ?? { state: 'free', word: status };
}

/** A Tally date's state. */
export function tallyDayChip(day) {
  const status = day.export?.status;
  if (!status) return day.closed ? { state: 'served', word: 'Closed' } : { state: 'free', word: 'Open day' };
  return {
    BUILT: { state: 'bill', word: 'Exported' },
    DOWNLOADED: { state: 'bill', word: 'Downloaded' },
    QUEUED: { state: 'open', word: 'Sending' },
    POSTED: { state: 'ok', word: 'Posted' },
    PARTIAL: { state: 'alert', word: 'Partly posted' },
    FAILED: { state: 'alert', word: 'Failed' },
    UNKNOWN: { state: 'alert', word: 'Not known' },
  }[status] ?? { state: 'free', word: status };
}

export const BRIDGE_WORDS = Object.freeze({
  PENDING: { state: 'open', word: 'Waiting for its code' },
  EXPIRED: { state: 'free', word: 'Code expired' },
  ACTIVE: { state: 'ok', word: 'Paired' },
  REVOKED: { state: 'free', word: 'Switched off' },
});

/** The words for an event line's outcome. */
export const OUTCOME_CHIP = Object.freeze({
  OK: { state: 'ok', word: 'Done' },
  FAILED: { state: 'alert', word: 'Failed' },
  IGNORED: { state: 'free', word: 'Ignored' },
  DUPLICATE: { state: 'free', word: 'Already had it' },
  REJECTED: { state: 'alert', word: 'Refused' },
});
