/**
 * Tables. Shapes come from Part 4 section M2.1 of docs/PROJECT-PLAN.md.
 *
 * The only interesting thing in here is that occupancy is not a field. It is
 * worked out from open orders on every read, in one query for the whole floor
 * rather than one per table.
 */
import { Bill, BILL_STATUSES } from '../models/Bill.js';
import { OCCUPYING_ORDER_STATUSES, Order } from '../models/Order.js';
import { User } from '../models/User.js';
import { upcomingByTable } from '../services/reservationService.js';
import { getSetting, getSettings } from '../services/settingsService.js';
import { withOptionalTransaction } from '../utils/transaction.js';
import { nowUtc } from '../utils/time.js';
import { Table } from '../models/Table.js';
import { BusinessRuleError, DuplicateError, NotFoundError, ValidationError } from '../utils/errors.js';
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
 * Everything the floor shows for each occupied table, read in a FIXED number of
 * queries whatever the size of the floor (P19):
 *
 *   1. the occupying orders (OPEN or READY_TO_BILL, on a table);
 *   2. their live UNPAID bills, for "Bill printed";
 *   3. the names of the people who opened them, for the captain;
 *   4. the floor settings, for the long-running marker (memoised per request).
 *
 * Plus the tables themselves in listTables: five in all, never one per table.
 * Looping the tables and asking about each would be a round trip per table on
 * the screen a waiter looks at most.
 *
 * Occupying means OPEN or READY_TO_BILL, not just OPEN: a table whose food is
 * all served still has customers sitting at it, waiting on a bill.
 */
async function floorByTableId(req) {
  const openOrders = await Order.find({
    ...scoped(req),
    status: { $in: OCCUPYING_ORDER_STATUSES },
    tableId: { $ne: null },
  })
    .select('tableId orderNumber openedAt openedBy guestCount status lines')
    .lean();

  const orderIds = openOrders.map((order) => order._id);
  const [bills, people, longOpenMinutes] = await Promise.all([
    orderIds.length
      ? Bill.find({ ...scoped(req), orderId: { $in: orderIds }, isVoided: false, status: BILL_STATUSES.UNPAID })
          .select('orderId billNumber grandTotalInPaise')
          .lean()
      : [],
    orderIds.length
      ? User.find({ ...scoped(req), _id: { $in: [...new Set(openOrders.map((order) => String(order.openedBy)))] } })
          .select('name')
          .lean()
      : [],
    getSetting(req.restaurantId, 'floor.longOpenMinutes', { req }),
  ]);

  const billByOrder = new Map(bills.map((bill) => [String(bill.orderId), bill]));
  const nameById = new Map(people.map((person) => [String(person._id), person.name]));
  const now = nowUtc();

  const byTableId = new Map();
  for (const order of openOrders) {
    byTableId.set(
      String(order.tableId),
      occupancyFor(order, {
        bill: billByOrder.get(String(order._id)) ?? null,
        captainName: nameById.get(String(order.openedBy)) ?? null,
        isLong: now.getTime() - new Date(order.openedAt).getTime() > longOpenMinutes * 60_000,
      }),
    );
  }
  return byTableId;
}

const FREE = Object.freeze({
  isOccupied: false,
  orderId: null,
  orderNumber: null,
  openedAt: null,
  runningTotalInPaise: null,
  state: 'FREE',
  guestCount: null,
  isLong: false,
  captainName: null,
  itemTotalInPaise: null,
  billId: null,
  billNumber: null,
  billTotalInPaise: null,
  upcomingReservation: null,
});

/**
 * The derived occupancy block.
 *
 * Null in every field when nothing is open, rather than the block being absent,
 * so the floor view can read `occupancy.isOccupied` without checking whether
 * the object exists first.
 *
 * The item total is the same arithmetic as the order's own subtotal, from the
 * line values frozen when each line was added, so the floor and the order
 * screen cannot disagree and the menu is never read. Still not a bill: no tax,
 * no discount. The bill total, when a bill is printed, is the bill's own.
 */
function occupancyFor(order, { bill = null, captainName = null, isLong = false } = {}) {
  if (!order) return { ...FREE };

  const live = order.lines.filter((line) => line.status !== 'CANCELLED');
  const itemTotalInPaise = sumPaise(0, ...live.map(computeLineTotalInPaise));
  const state = bill ? 'BILL_PRINTED' : order.status === 'READY_TO_BILL' ? 'SERVED' : 'OPEN';

  return {
    isOccupied: true,
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    openedAt: order.openedAt,
    runningTotalInPaise: itemTotalInPaise,
    state,
    guestCount: order.guestCount ?? null,
    isLong,
    captainName,
    itemTotalInPaise,
    billId: bill ? String(bill._id) : null,
    billNumber: bill?.billNumber ?? null,
    billTotalInPaise: bill?.grandTotalInPaise ?? null,
    upcomingReservation: null,
  };
}

/**
 * P23. A free table with a confirmed booking soon reads "Reserved". One query,
 * and none at all while online bookings are switched off, so the floor's
 * query count is unchanged for a restaurant that does not take them.
 */
async function addUpcomingReservations(req, tables) {
  const settings = await getSettings(req.restaurantId, { req });
  if (!settings.features.online) return tables;

  const free = tables.filter((table) => !table.occupancy.isOccupied);
  const upcoming = await upcomingByTable(req, free.map((table) => table.id), nowUtc(), settings.online);
  return tables.map((table) =>
    table.occupancy.isOccupied
      ? table
      : { ...table, occupancy: { ...table.occupancy, upcomingReservation: upcoming.get(String(table.id)) ?? null } },
  );
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
    floorByTableId(req),
  ]);

  const withOccupancy = await addUpcomingReservations(
    req,
    tables.map((table) => ({
      ...table.toJSON(),
      occupancy: ordersByTableId.get(String(table._id)) ?? { ...FREE },
    })),
  );

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
 * This is the delete for a table that has been used: an order from last week
 * points at this table by id, and so does its bill. DELETE below removes only
 * a table no order has ever been on.
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

/**
 * DELETE /tables/:tableId. API-CONTRACT 11.6, added 2 October 2026.
 *
 * For a table added by mistake. Any order on it, in any status, cancelled ones
 * included, means its id is in the history and it is only ever turned off.
 */
export async function deleteTable(req, res) {
  const table = await loadTableInTenant(req, req.params.tableId);

  const used = await Order.exists({ ...scoped(req), tableId: table._id });
  if (used) {
    throw new BusinessRuleError(
      `${table.name} has orders in its history, so it cannot be deleted. Turn it off instead: it leaves the floor and every old bill keeps its table.`,
    );
  }

  await Table.deleteOne({ ...scoped(req), _id: table._id });

  req.log?.info({ actorId: req.user.id, tableId: String(table._id) }, 'Unused table deleted.');

  return sendSuccess(res, { id: String(table._id), deleted: true });
}

/** Do two placed tables share any grid cell? */
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const sameSection = (table, section) => (table.section ?? '').toLowerCase() === section.toLowerCase();

/**
 * PATCH /tables/layout. P19.
 *
 * One section's floor plan, saved together. Every table named must be this
 * restaurant's and in the section (400 otherwise); bounds are the schema's
 * (400). Overlaps are checked against the plan as it will be after the save,
 * including tables of the section that keep their place, and refused with 422
 * naming each pair. Every write happens inside one transaction, so a refused
 * save changes nothing.
 */
export async function saveLayout(req, res) {
  const { section, tables: entries } = req.body;
  const ids = entries.map((entry) => entry.tableId);
  const named = await Table.find({ ...scoped(req), _id: { $in: ids } });
  const byId = new Map(named.map((table) => [String(table._id), table]));

  const fields = {};
  entries.forEach((entry, index) => {
    const table = byId.get(String(entry.tableId));
    if (!table) fields[`tables.${index}.tableId`] = 'No such table in this restaurant.';
    else if (!sameSection(table, section)) fields[`tables.${index}.tableId`] = `${table.name} is not in ${section}.`;
  });
  if (Object.keys(fields).length > 0) throw new ValidationError('Every table must be in the section being arranged.', fields);

  // The plan as it will be: requested places, and every other table of the section where it is.
  const requested = new Map(entries.map((entry) => [String(entry.tableId), entry.layout === null ? null : entry]));
  const sectionTables = (await Table.find({ ...scoped(req), isActive: true, layout: { $ne: null } })).filter((table) => sameSection(table, section));
  const placed = [];
  for (const table of sectionTables) {
    if (!requested.has(String(table._id))) placed.push({ name: table.name, ...table.layout.toObject() });
  }
  for (const [id, layout] of requested) if (layout) placed.push({ name: byId.get(id).name, ...layout });

  const clashes = [];
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      if (overlaps(placed[i], placed[j])) clashes.push(`${placed[i].name} and ${placed[j].name}`);
    }
  }
  if (clashes.length > 0) {
    throw new BusinessRuleError(`These tables would overlap: ${clashes.join('; ')}. Move one of each pair and save again.`);
  }

  await withOptionalTransaction(async (session) => {
    for (const [id, layout] of requested) {
      const table = byId.get(id);
      table.layout = layout ? { x: layout.x, y: layout.y, w: layout.w, h: layout.h, shape: layout.shape } : null;
      await table.save(session ? { session } : {});
    }
  });

  const floor = await floorByTableId(req);
  const all = await Table.find({ ...scoped(req), isActive: true }).sort({ displayOrder: 1, name: 1 });
  return sendSuccess(
    res,
    all.filter((table) => sameSection(table, section)).map((table) => ({ ...table.toJSON(), occupancy: floor.get(String(table._id)) ?? { ...FREE } })),
  );
}
