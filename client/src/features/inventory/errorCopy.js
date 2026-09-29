/**
 * Server error codes to plain sentences, for the M4 inventory screens.
 * Same policy as M2 and M3's copies of this file: only the codes the client
 * has to act on get copy of their own, everything else shows the server's
 * own sentence.
 */

const BY_CODE = {
  INGREDIENT_IN_USE: () => 'A recipe still uses this ingredient, so it cannot be switched off.',
  BASE_UNIT_IMMUTABLE: () => "This ingredient's unit cannot change once stock has moved.",
  DUPLICATE_RECIPE_INGREDIENT: () => 'The same ingredient is on this recipe twice.',
  DUPLICATE: () => 'An ingredient with that name already exists.',
  NOT_FOUND: () => "Couldn't find that — refreshing.",
  FORBIDDEN: () => "You don't have permission for this. Ask an owner or manager.",
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
