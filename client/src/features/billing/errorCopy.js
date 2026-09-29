/**
 * Server error codes to plain sentences, for the M3 billing screens.
 *
 * DESIGN-SYSTEM.md section 8: never restate a server rule, and never show a
 * raw code. Only the codes where the client has to DO something rather than
 * just say something get copy of their own here, the same policy M2's
 * features/orders/errorCopy.js uses and for the same reason.
 */

const BY_CODE = {
  /**
   * Someone already billed this order — most likely a second tap, or a
   * colleague on another till. The server sends the id of the bill that won,
   * so the caller can open it rather than showing a dead end.
   */
  BILL_ALREADY_EXISTS: () => 'This order already has a bill. Opening it.',

  VERSION_CONFLICT: () => 'This order just changed. Reloading it.',

  ENTRY_VOIDED: () => 'This bill is already voided.',

  TRANSACTION_REQUIRED: () =>
    'Billing is unavailable right now. Tell whoever runs the server.',

  NOT_FOUND: () => "Couldn't find that — refreshing.",

  FORBIDDEN: () => "You don't have permission for this. Ask an owner or manager.",

  VALIDATION_FAILED: (error) => {
    const first = error?.fields ? Object.values(error.fields)[0] : null;
    return first ?? 'Some of what you entered is not valid.';
  },
};

const REFETCH_CODES = new Set(['VERSION_CONFLICT', 'NOT_FOUND', 'BILL_ALREADY_EXISTS']);

export function shouldRefetch(error) {
  return REFETCH_CODES.has(error?.code);
}

/** The id of the bill that already exists for this order, when the server sent one. */
export function existingBillId(error) {
  return error?.code === 'BILL_ALREADY_EXISTS' ? (error.existingBillId ?? null) : null;
}

export function errorMessage(error) {
  if (!error) return null;

  const build = BY_CODE[error.code];
  if (build) return build(error);

  if (!error.code || error.code === 'INTERNAL_ERROR') {
    return "Couldn't save — check your connection.";
  }

  // BUSINESS_RULE_VIOLATED and the rest: the server's own sentence is already
  // written for a person to read. "This bill has already been paid" is a
  // better sentence than anything reconstructed here.
  return error.message ?? 'Something went wrong.';
}
