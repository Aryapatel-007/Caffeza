/**
 * Menu management routes.
 *
 * Reads are open to all six roles: a waiter taking an order and a cook reading
 * a ticket both need to see the menu. Writes are OWNER and MANAGER, with one
 * deliberate exception, marked below.
 *
 * Middleware order is docs/CONVENTIONS.md section 8:
 * authenticate, tenant, permission, validate, controller.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import {
  createCategory,
  listCategories,
  setCategoryActive,
  updateCategory,
} from '../controllers/categoryController.js';
import {
  createMenuItem,
  getMenu,
  getMenuItem,
  listMenuItems,
  setAvailability,
  setMenuItemActive,
  updateMenuItem,
} from '../controllers/menuItemController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  createCategorySchema,
  createMenuItemSchema,
  listCategoriesSchema,
  listMenuItemsSchema,
  readMenuItemSchema,
  readMenuSchema,
  setAvailabilitySchema,
  setCategoryActiveSchema,
  setMenuItemActiveSchema,
  updateCategorySchema,
  updateMenuItemSchema,
} from '../validators/menuValidators.js';

const router = Router();

/** Changing the menu. */
const menuAdmin = [authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER)];

/** Reading the menu. Everyone who works here. */
const anySignedIn = [
  authenticate,
  tenant,
  requireRole(
    ROLES.OWNER,
    ROLES.MANAGER,
    ROLES.CASHIER,
    ROLES.WAITER,
    ROLES.KITCHEN,
    ROLES.STOREKEEPER,
  ),
];

// Categories
router.post('/categories', ...menuAdmin, validate(createCategorySchema), createCategory);
router.get('/categories', ...anySignedIn, validate(listCategoriesSchema), listCategories);
router.patch('/categories/:categoryId', ...menuAdmin, validate(updateCategorySchema), updateCategory);
router.patch(
  '/categories/:categoryId/active',
  ...menuAdmin,
  validate(setCategoryActiveSchema),
  setCategoryActive,
);

// Menu items
router.post('/menu-items', ...menuAdmin, validate(createMenuItemSchema), createMenuItem);
router.get('/menu-items', ...anySignedIn, validate(listMenuItemsSchema), listMenuItems);
router.get('/menu-items/:menuItemId', ...anySignedIn, validate(readMenuItemSchema), getMenuItem);
router.patch('/menu-items/:menuItemId', ...menuAdmin, validate(updateMenuItemSchema), updateMenuItem);

/**
 * The exception. All six roles.
 *
 * The kitchen running out of paneer at 8pm cannot wait for the owner to unlock
 * a phone. The request schema is strict and carries two fields, so this route
 * cannot reach a price no matter who calls it. Do not widen it.
 */
router.patch(
  '/menu-items/:menuItemId/availability',
  ...anySignedIn,
  validate(setAvailabilitySchema),
  setAvailability,
);

router.patch(
  '/menu-items/:menuItemId/active',
  ...menuAdmin,
  validate(setMenuItemActiveSchema),
  setMenuItemActive,
);

// The menu tree, for the ordering screen.
router.get('/menu', ...anySignedIn, validate(readMenuSchema), getMenu);

// There is no DELETE on either collection. PATCH .../active is the delete, so
// bills from M3 and recipes from M4 keep something to point at.

export default router;
