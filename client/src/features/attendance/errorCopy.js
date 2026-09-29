/**
 * M5 server error codes to plain sentences.
 *
 * A user never sees a raw code or an HTTP status. This is the one place that
 * mapping lives for attendance; extend it rather than writing a second copy.
 * The pattern is M1's `features/menu/errorCopy.js`.
 *
 * What is NOT here: any rule the server owns. The client does not decide that an
 * entry is voided or that a clock-out is before a clock-in — it shows what the
 * server said.
 */

const BY_CODE = {
  ALREADY_CLOCKED_IN: () => 'That person is already clocked in.',
  NOT_CLOCKED_IN: () => 'There is no open shift to close.',
  CLOCK_OUT_BEFORE_CLOCK_IN: () => 'Clock-out has to be after clock-in.',
  ENTRY_VOIDED: () => 'This entry was voided. It cannot be changed.',
  SELF_CORRECTION_FORBIDDEN: () =>
    'You cannot change your own attendance entry. Ask someone else to.',

  INVALID_PIN: () => 'That PIN is not correct.',
  PIN_LOCKED: () => 'This PIN is locked after too many tries. A manager can reset it.',

  FORBIDDEN: () => "You don't have permission for this. Ask an owner or manager.",
  NOT_FOUND: () => "Couldn't find that — it may have just been removed. Refreshing.",

  VALIDATION_FAILED: (error) => {
    const first = error?.fields ? Object.values(error.fields)[0] : null;
    return first ?? 'Some of what you entered is not valid.';
  },
};

/** Codes where the right response is to refetch, because our copy is stale. */
const REFETCH_CODES = new Set(['NOT_FOUND', 'ENTRY_VOIDED', 'ALREADY_CLOCKED_IN']);

export function shouldRefetch(error) {
  return REFETCH_CODES.has(error?.code);
}

export function errorMessage(error) {
  if (!error) return null;

  const build = BY_CODE[error.code];
  if (build) return build(error);

  if (!error.code || error.code === 'INTERNAL_ERROR') {
    return "Couldn't reach the server — check your connection.";
  }

  return error.message ?? 'Something went wrong.';
}
