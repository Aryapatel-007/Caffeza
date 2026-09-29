/**
 * Server error codes to plain sentences, for the M7 settings screen.
 *
 * Same policy as M2, M3 and M4's copies of this file: only the codes the client
 * has to act on get copy of their own, everything else shows the server's own
 * sentence.
 *
 * VALIDATION_FAILED deliberately shows the server's message rather than a
 * friendly rewrite. On this screen that message is usually the unknown-key
 * rejection, which names the offending field, and that name is the whole
 * reason the endpoint rejects instead of ignoring. Replacing it with "some of
 * what you entered is not valid" would throw away the useful half.
 */

const BY_CODE = {
  FORBIDDEN: () => 'Only an owner can change settings. You can still read them.',
  NOT_FOUND: () => "Couldn't find that — refreshing.",
  VALIDATION_FAILED: (error) => {
    const first = error?.fields ? Object.values(error.fields)[0] : null;
    return first ?? 'Some of what you entered is not valid.';
  },
};

export function errorMessage(error) {
  if (!error) return null;
  const build = BY_CODE[error.code];
  if (build) return build(error);
  if (!error.code || error.code === 'INTERNAL_ERROR') {
    return "Couldn't save — check your connection.";
  }
  return error.message ?? 'Something went wrong.';
}
