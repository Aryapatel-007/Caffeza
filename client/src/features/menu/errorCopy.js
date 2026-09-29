/**
 * Server error codes to plain sentences.
 *
 * A user never sees a raw code or an HTTP status number. This is the one place
 * that mapping lives; extend it rather than writing a second copy.
 *
 * Note what is NOT here: any rule the server owns. The client does not decide
 * that a category is off or that a name is taken, it shows what the server
 * said. A second implementation of a rule in the browser is a second
 * implementation that can disagree with the first.
 */

const BY_CODE = {
  DUPLICATE_CATEGORY_NAME: (error) =>
    `There's already a category named "${error?.context?.name ?? 'that'}" here. Try a different name.`,
  DUPLICATE_MENU_ITEM_NAME: (error) =>
    `There's already an item named "${error?.context?.name ?? 'that'}" here. Try a different name.`,

  // Creating an item under a switched-off category.
  BUSINESS_RULE_VIOLATED: () =>
    'This category is turned off. Turn it back on before adding items to it.',

  // The item changed under us, so the id we sent no longer exists on it.
  VARIANT_NOT_FOUND: () => 'This item changed somewhere else. Refreshing the menu.',
  ADDON_NOT_FOUND: () => 'This item changed somewhere else. Refreshing the menu.',

  NOT_FOUND: () => "Couldn't find that — it may have just been removed. Refreshing.",

  // Should be unreachable given the route gating, but a 403 is still possible
  // if a role changed in another tab.
  FORBIDDEN: () => "You don't have permission for this. Ask an owner or manager.",

  VALIDATION_FAILED: (error) => {
    const first = error?.fields ? Object.values(error.fields)[0] : null;
    return first ?? 'Some of what you entered is not valid.';
  },
};

/** Codes where the right response is to refetch, because our copy is stale. */
const REFETCH_CODES = new Set(['VARIANT_NOT_FOUND', 'ADDON_NOT_FOUND', 'NOT_FOUND']);

export function shouldRefetch(error) {
  return REFETCH_CODES.has(error?.code);
}

/**
 * The sentence to show. `context` lets a caller pass the name it just tried,
 * since the server does not echo it back.
 */
export function errorMessage(error, context) {
  if (!error) return null;

  const build = BY_CODE[error.code];
  if (build) return build({ ...error, context });

  // A network failure has no code at all.
  if (!error.code || error.code === 'INTERNAL_ERROR') {
    return "Couldn't save — check your connection.";
  }

  return error.message ?? 'Something went wrong.';
}
