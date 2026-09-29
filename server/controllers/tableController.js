/**
 * Tables. Shapes come from Part 4 section M2.1 of docs/PROJECT-PLAN.md.
 *
 * The only interesting thing in here is that occupancy is not a field. It is
 * worked out from open orders on every read, in one query for the whole floor
 * rather than one per table.
 */
import { OCCUPYING_ORDER_STATUSES, Order } from '../models/Order.js';
import { Table } from '../models/Table.js';
import { BusinessRuleError, DuplicateError, NotFoundError } from '../utils/errors.js';
import { computeLineTotalInPaise } from '../services/orderService.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { sendSuccess } from '../utils/response.js';
import { scoped } from '../utils/scopedQuery.js';
import { sumPaise } from '../utils/money.js';

const MONGO_DUPLICATE_KEY = 11000;

/** The unique index on (restaurantId, nameLower) turning into the contract's 409. */
function rethrowDuplicate(error) {
  if (error?.code === MONGO_DUPLICATE_KEY) {
    throw new DuplicateError('A table with that name already exists.', { name: 'Already in use.' });
  }
  throw error;
}

/** Loads one table inside the caller's tenant, or 404. Never 403. */
async function loadTableInTenant(req, tableId) {
  const table = await Table.findOne({ ...scoped(req), _id: tableId });
  if (!table) throw new NotFoundError('Table not found.');
  return table;
}

/**
 * Every order still occupying a table, keyed by that table's id.
 *
 * Occupying means OPEN or READY_TO_BILL, not just OPEN: a table whose food is
 * all served still has customers sitting at it, waiting on a bill, and does
 * not read as free until one exists.
 *
 * One query for the whole floor. Looping the tables and asking "is anything
 * open on this one" would be one round trip per table on the screen a waiter
 * looks at most, and a fifty table restaurant would feel it.
 */
async function openOrdersByTableId(req) {
  const openOrders = await Order.find({
    ...scoped(req),
    status: { $in: OCCUPYING_ORDER_STATUSES },
    tableId: { $ne: null },
  }).select('tableId orderNumber openedAt status lines');

  const byTableId = new Map();
  for (const order of openOrders) byTableId.set(String(order.tableId), order);
  return byTableId;
}

/**
 * The derived occupancy block.
 *
 * Null in every field when nothing is open, rather than the block being absent,
 * so the floor view can read `occupancy.isOccupied` without checking whether
 * the object exists first.
 */
function occupancyFor(order) {
  if (!order) {
    return {
      isOccupied: false,
      orderId: null,
      orderNumber: null,
      openedAt: null,
      runningTotalInPaise: null,
    };
  }

  const live = order.lines.filter((line) => line.status !== 'CANCELLED');

  return {
    isOccupied: true,
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    openedAt: order.openedAt,
    // The same arithmetic as the order's own subtotal, from the same helper, so
    // the number on the floor view and the number on the order screen cannot
    // disagree. Still not a bill: no tax, no discount. M3 owns those.
    runningTotalInPaise: sumPaise(...live.map(computeLineTotalInPaise)),
  };
}

/** POST /tables */
export async function createTable(req, res) {
  const { name, section, seats, displayOrder } = req.body;

  const table = new Table({
    ...scoped(req),
    name,
    section: section ?? null,
    seats: seats ?? null,
    ...(displayOrder === undefined ? {} : { displayOrder }),
  });

  await table.save().catch(rethrowDuplicate);

  return sendSuccess(res, table.toJSON(), 201);
}

/**
 * GET /tables
 *
 * Not paginated. A restaurant has tens of tables and the floor view needs all
 * of them at once to draw itself.
 */
export async function listTables(req, res) {
  const { section, isOccupied, includeInactive } = req.query;

  const filter = { ...scoped(req) };
  if (!includeInactive) filter.isActive = true;
  if (section !== undefined) {
    // Escaped before it becomes a pattern, like every other search input in
    // this codebase. Anchored, because a section filter is an exact match that
    // happens to be case-insensitive, not a search box.
    filter.section = new RegExp(`^${escapeRegex(section)}$`, 'i');
  }

  const [tables, ordersByTableId] = await Promise.all([
    Table.find(filter).sort({ displayOrder: 1, name: 1 }),
    openOrdersByTableId(req),
  ]);

  const withOccupancy = tables.map((table) => ({
    ...table.toJSON(),
    occupancy: occupancyFor(ordersByTableId.get(String(table._id))),
  }));

  /**
   * Filtered here rather than in the query, because occupancy is not stored and
   * the database has nothing to filter on.
   */
  const data =
    isOccupied === undefined
      ? withOccupancy
      : withOccupancy.filter((table) => table.occupancy.isOccupied === isOccupied);

  return sendSuccess(res, data);
}

/** PATCH /tables/:tableId */
export async function updateTable(req, res) {
  const table = await loadTableInTenant(req, req.params.tableId);
  const { name, section, seats, displayOrder } = req.body;

  if (name !== undefined) table.name = name;
  if (section !== undefined) table.section = section;
  if (seats !== undefined) table.seats = seats;
  if (displayOrder !== undefined) table.displayOrder = displayOrder;

  await table.save().catch(rethrowDuplicate);

  return sendSuccess(res, table.toJSON());
}

/**
 * PATCH /tables/:tableId/status
 *
 * This is the delete. There is no DELETE route: an order from last week points
 * at this table by id and a bill from M3 will too.
 */
export async function setTableStatus(req, res) {
  const table = await loadTableInTenant(req, req.params.tableId);
  const { isActive } = req.body;

  /**
   * Switching a table off while it is occupied would take the order off the
   * floor view and leave it reachable only by its id. Occupied means OPEN or
   * READY_TO_BILL: a table waiting on a bill is not free, and switching it off
   * would strand a customer who has not paid yet behind a table nobody can see
   * on the floor. Reactivating is always allowed: there is nothing to strand.
   */
  if (!isActive && table.isActive) {
    const openOrder = await Order.findOne({
      ...scoped(req),
      tableId: table._id,
      status: { $in: OCCUPYING_ORDER_STATUSES },
    }).select('orderNumber');

    if (openOrder) {
      throw new BusinessRuleError(
        `Order #${openOrder.orderNumber} is still open on this table. Close it before turning the table off.`,
      );
    }
  }

  table.isActive = isActive;
  await table.save();

  req.log?.info(
    { actorId: req.user.id, tableId: String(table._id), isActive: table.isActive },
    'Table active flag changed.',
  );

  return sendSuccess(res, table.toJSON());
}
