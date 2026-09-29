/**
 * Server error codes to plain sentences, for the M6 report screens.
 *
 * Same policy as M2, M3 and M4's copies: only the codes the client has to act
 * on get their own copy, everything else shows the server's own sentence.
 */

const BY_CODE = {
  /**
   * The one code this module adds. The server's message already names the cap
   * and the range asked for, which is more useful than anything reconstructed
   * here, so this passes it through rather than replacing it.
   */
  RANGE_TOO_LARGE: (error) => error.message,

  FORBIDDEN: () => "You don't have permission for this report. Ask an owner.",

  VALIDATION_FAILED: (error) => {
    const first = error?.fields ? Object.values(error.fields)[0] : null;
    return first ?? 'Check the dates and try again.';
  },
};

export function errorMessage(error) {
  if (!error) return null;

  const build = BY_CODE[error.code];
  if (build) return build(error);

  if (!error.code || error.code === 'INTERNAL_ERROR') {
    return "Couldn't load that — check your connection.";
  }

  return error.message ?? 'Something went wrong.';
}
