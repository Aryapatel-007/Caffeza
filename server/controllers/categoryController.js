/**
 * Menu categories.
 *
 * Shapes come from docs/API-CONTRACT.md section 4. Every read builds its filter
 * with scoped(req), so a category in another restaurant is simply not returned
 * and becomes a 404 rather than a 403.
 */
import { Category } from '../models/Category.js';
import { DuplicateCategoryNameError, NotFoundError } from '../utils/errors.js';
import { sendSuccess } from '../utils/response.js';
import { scoped } from '../utils/scopedQuery.js';

const MONGO_DUPLICATE_KEY = 11000;

/**
 * Turns the unique-index violation into the contract's 409.
 *
 * The pre-insert check below is a courtesy, not the guarantee. Two managers
 * saving "Starters" in the same second both pass it and one hits the index.
 * Without this the loser would get a generic DUPLICATE from the error handler,
 * or a 500 if the index were ever removed to "fix" it. The index is the
 * guarantee; this only translates it.
 */
function rethrowDuplicate(error) {
  if (error?.code === MONGO_DUPLICATE_KEY) throw new DuplicateCategoryNameError();
  throw error;
}

/** Loads one category inside the caller's tenant, or 404. */
export async function loadCategoryInTenant(req, categoryId) {
  const category = await Category.findOne({ ...scoped(req), _id: categoryId });
  if (!category) throw new NotFoundError('Category not found.');
  return category;
}

/** POST /categories */
export async function createCategory(req, res) {
  const { name, displayOrder } = req.body;

  const category = new Category({
    ...scoped(req),
    name,
    ...(displayOrder === undefined ? {} : { displayOrder }),
  });

  await category.save().catch(rethrowDuplicate);

  return sendSuccess(res, category.toJSON(), 201);
}

/**
 * GET /categories
 *
 * Not paginated. A restaurant has tens of categories, and the ordering screen
 * needs all of them to draw its tabs.
 */
export async function listCategories(req, res) {
  const filter = { ...scoped(req) };
  if (!req.query.includeInactive) filter.isActive = true;

  const categories = await Category.find(filter).sort({ displayOrder: 1, name: 1 });

  return sendSuccess(
    res,
    categories.map((category) => category.toJSON()),
  );
}

/** PATCH /categories/:categoryId */
export async function updateCategory(req, res) {
  const category = await loadCategoryInTenant(req, req.params.categoryId);
  const { name, displayOrder } = req.body;

  if (name !== undefined) category.name = name;
  if (displayOrder !== undefined) category.displayOrder = displayOrder;

  await category.save().catch(rethrowDuplicate);

  return sendSuccess(res, category.toJSON());
}

/**
 * PATCH /categories/:categoryId/active
 *
 * This is the delete, and it does not cascade.
 *
 * The items in this category keep their own isActive untouched. They stop being
 * visible because their category is off, which is what makes reactivating bring
 * them back exactly as they were. Writing a cascade here would lose that, and
 * would also mean a manager hiding a section for a week silently deactivated
 * forty items they never chose to touch.
 */
export async function setCategoryActive(req, res) {
  const category = await loadCategoryInTenant(req, req.params.categoryId);

  category.isActive = req.body.isActive;
  await category.save();

  req.log?.info(
    { actorId: req.user.id, categoryId: String(category._id), isActive: category.isActive },
    'Category active flag changed.',
  );

  return sendSuccess(res, category.toJSON());
}
