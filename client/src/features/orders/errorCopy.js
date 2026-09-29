/**
 * Server error codes to plain sentences, for the M2 screens.
 *
 * A user never sees a raw code or an HTTP status number.
 *
 * Why this is not an extension of features/menu/errorCopy.js, which
 * DESIGN-SYSTEM.md section 8 would otherwise ask for: that file hard-codes
 * menu-specific text for the shared codes. Its BUSINESS_RULE_VIOLATED says
 * "This category is turned off", which is wrong on every M2 screen, where the
 * same code means a fired line cannot be edited or a table is still occupied.
 *
 * M2's policy for those is different and simpler: the server's own message is
 * already a plain sentence written for a person, so show it. Only the two codes
 * where the client has to DO something rather than say something get copy of
 * their own here.
 *
 * The right end state is one shared base map with per-module overrides. That
 * means rewriting M1's, which M2 is not scoped to do. Logged in
 * PROJECT-STATE.md as a known problem.
 */

const BY_CODE = {
  /**
   * Somebody else changed this order while it was open here.
   *
   * Not framed as an error, because it is not one: it is two people doing
   * their jobs on one table, which is the situation the version field exists
   * to handle. The screen reloads and shows what actually happened.
   */
  VERSION_CONFLICT: () => 'Someone else just changed this order. Reloading it now.',

  /**
   * Another waiter got to the table first. The server sends the id of the
   * order that won, so the caller can offer to open it rather than leaving
   * the second waiter at a dead end.
   */
  TABLE_OCCUPIED: () => 'There is already an order open on this table.',

  NOT_FOUND: () => "Couldn't find that — it may have just been closed. Refreshing.",

  FORBIDDEN: () => "You don't have permission for this. Ask an owner or manager.",

  VALIDATION_FAILED: (error) => {
    const first = error?.fields ? Object.values(error.fields)[0] : null;
    return first ?? 'Some of what you entered is not valid.';
  },
};

/** Codes where the right response is to refetch, because our copy is stale. */
const REFETCH_CODES = new Set(['VERSION_CONFLICT', 'NOT_FOUND']);

export function shouldRefetch(error) {
  return REFETCH_CODES.has(error?.code);
}

/** The id of the order already open on the table, when the server sent one. */
export function occupiedByOrderId(error) {
  return error?.code === 'TABLE_OCCUPIED' ? (error.existingOrderId ?? null) : null;
}

export function errorMessage(error) {
  if (!error) return null;

  const build = BY_CODE[error.code];
  if (build) return build(error);

  /**
   * BUSINESS_RULE_VIOLATED and the rest fall through to the server's message
   * on purpose. "The kitchen already has this one" and "Table T1 is turned
   * off" are better sentences than anything the client could reconstruct, and
   * restating a server rule here would be a second implementation that can
   * disagree with the first.
   */
  if (!error.code || error.code === 'INTERNAL_ERROR') {
    return "Couldn't save — check your connection.";
  }

  return error.message ?? 'Something went wrong.';
}
