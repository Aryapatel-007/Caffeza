/**
 * M2 routes: tables, orders and kitchen tickets.
 *
 * Middleware order is docs/CONVENTIONS.md section 8:
 * authenticate, tenant, permission, validate, controller.
 *
 * Three permission groups, and the differences between them are deliberate.
 * Read the comment on each before adding a route to one.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import {
  addOrderLines,
  cancelOrder,
  cancelOrderLine,
  postNoCharge,
  createOrder,
  editOrderLine,
  fireOrder,
  getOrder,
  listOrders,
  markLineServed,
  moveOrderToTable,
} from '../controllers/orderController.js';
import {
  getKot,
  getKotTicket,
  listKots,
  markKotLineReady,
  markKotReady,
  undoKotLineReady,
  undoKotTicketReady,
} from '../controllers/kotController.js';
import {
  createTable,
  deleteTable,
  listTables,
  setTableStatus,
  saveLayout,
  updateTable,
} from '../controllers/tableController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  addOrderLinesSchema,
  cancelOrderLineSchema,
  cancelOrderSchema,
  noChargeSchema,
  createOrderSchema,
  createTableSchema,
  editOrderLineSchema,
  fireOrderSchema,
  listKotsSchema,
  listOrdersSchema,
  listTablesSchema,
  markKotLineReadySchema,
  markKotReadySchema,
  markLineServedSchema,
  moveOrderTableSchema,
  kotTicketSchema,
  readKotSchema,
  readOrderSchema,
  setTableStatusSchema,
  deleteTableSchema,
  saveLayoutSchema,
  updateTableSchema,
} from '../validators/orderValidators.js';

const router = Router();

/** Setting up the floor, and cancelling a whole order. The people who run the place. */
const managers = [authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER)];

/** P28. Manager work a cashier may do with an owner's or manager's PIN; the service decides. */
const managersOrTill = [authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER)];

/**
 * Taking orders. Everyone on the floor.
 *
 * KITCHEN and STOREKEEPER are missing on purpose. They read orders and they
 * mark food ready; they never create or change one.
 */
const floor = [
  authenticate,
  tenant,
  requireRole(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER),
];

/** Reading, and the two kitchen ready endpoints. Everyone who works here. */
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

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

router.post('/tables', ...managers, validate(createTableSchema), createTable);
router.get('/tables', ...anySignedIn, validate(listTablesSchema), listTables);
// Before /tables/:tableId, or "layout" is read as a table id.
router.patch('/tables/layout', ...managers, validate(saveLayoutSchema), saveLayout);
router.patch('/tables/:tableId', ...managers, validate(updateTableSchema), updateTable);
router.patch('/tables/:tableId/status', ...managers, validate(setTableStatusSchema), setTableStatus);
// 11.6. Only a table no order has ever been on; a used table is turned off instead.
router.delete('/tables/:tableId', ...managers, validate(deleteTableSchema), deleteTable);

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

router.post('/orders', ...floor, validate(createOrderSchema), createOrder);
router.get('/orders', ...anySignedIn, validate(listOrdersSchema), listOrders);
router.get('/orders/:orderId', ...anySignedIn, validate(readOrderSchema), getOrder);
router.post('/orders/:orderId/lines', ...floor, validate(addOrderLinesSchema), addOrderLines);
router.patch(
  '/orders/:orderId/lines/:lineId',
  ...floor,
  validate(editOrderLineSchema),
  editOrderLine,
);
router.post(
  '/orders/:orderId/lines/:lineId/cancel',
  ...floor,
  validate(cancelOrderLineSchema),
  cancelOrderLine,
);
router.patch(
  '/orders/:orderId/lines/:lineId/served',
  ...floor,
  validate(markLineServedSchema),
  markLineServed,
);
router.post('/orders/:orderId/fire', ...floor, validate(fireOrderSchema), fireOrder);
router.patch('/orders/:orderId/table', ...floor, validate(moveOrderTableSchema), moveOrderToTable);

/**
 * Cancelling a WHOLE order is manager work, unlike cancelling one line, which
 * any of the four floor roles may do.
 *
 * This is deliberate and it is not a tidiness inconsistency. A whole-order
 * cancel is how a table disappears, and a table disappearing is how cash walks
 * out of a restaurant. Do not widen this to `floor` to make the file look
 * consistent.
 *
 * P28: the route lets a CASHIER through, and `approverForManagerTask` in the
 * controller refuses them unless an owner or manager types their PIN and the
 * owner allows it (`settings.approvals.managerTasks`). A WAITER never.
 */
router.post('/orders/:orderId/cancel', ...managersOrTill, validate(cancelOrderSchema), cancelOrder);

/** P08. Giving food away free is manager work, the same as cancelling a whole order. P28 as above. */
router.post('/orders/:orderId/no-charge', ...managersOrTill, validate(noChargeSchema), postNoCharge);

// ---------------------------------------------------------------------------
// Kitchen tickets
// ---------------------------------------------------------------------------

router.get('/kots', ...anySignedIn, validate(listKotsSchema), listKots);
router.get('/kots/:kotId', ...anySignedIn, validate(readKotSchema), getKot);
router.get('/kots/:kotId/ticket', ...anySignedIn, validate(kotTicketSchema), getKotTicket);

/**
 * Both ready endpoints are open to all six roles, including STOREKEEPER.
 *
 * Whoever is standing at the pass marks the food ready. Asking someone their
 * job title while a dish goes cold helps nobody, and the worst this endpoint
 * can do is say a dish is ready when it is not, which the person carrying the
 * plate discovers immediately.
 *
 * There is no POST /kots. A ticket is created by firing an order and never
 * directly, because a ticket with no order behind it is food cooked for nobody.
 */
router.patch(
  '/kots/:kotId/lines/:lineId/ready',
  ...anySignedIn,
  validate(markKotLineReadySchema),
  markKotLineReady,
);
router.patch('/kots/:kotId/ready', ...anySignedIn, validate(markKotReadySchema), markKotReady);
// P29 Part E. A wrong tick taken back, by the same people who tick. Refused once the order is billed.
router.post('/kots/:kotId/lines/:lineId/undo-ready', ...anySignedIn, validate(markKotLineReadySchema), undoKotLineReady);
router.post('/kots/:kotId/undo-ready', ...anySignedIn, validate(markKotReadySchema), undoKotTicketReady);

// There is no DELETE on any M2 collection. PATCH .../status is the delete, so a
// bill from M3 and a recipe deduction from M4 keep something to point at.

export default router;
