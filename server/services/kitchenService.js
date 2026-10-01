/**
 * Firing, and the kitchen's side of a ticket.
 *
 * The two documents this touches, an order and a KOT, must not drift. A line
 * the kitchen has marked ready and an order line that still says FIRED is a
 * waiter standing at the pass arguing with a screen. Every operation in here
 * that writes both does it in one transaction where the connection has one.
 */
import mongoose from 'mongoose';

import { COUNTER_NAMES } from '../models/Counter.js';
import { Kot, KOT_LINE_STATUSES } from '../models/Kot.js';
import { Order, ORDER_LINE_STATUSES } from '../models/Order.js';
import { BusinessRuleError, NotFoundError } from '../utils/errors.js';
import { scoped } from '../utils/scopedQuery.js';
import { nowUtc } from '../utils/time.js';
import { withOptionalTransaction } from '../utils/transaction.js';
import { nextNumber } from './counterService.js';
import {
  applyVersionedUpdate,
  assertOrderIsOpen,
  loadOrderInTenant,
  serialiseOrder,
} from './orderService.js';
// M4. Firing is the moment ingredients physically leave the shelf, so this is
// the one and only call site for a deduction -- see docs/DB-SCHEMA.md section
// 16. It runs inside this function's own transaction below, not as a second
// one, because a KOT that exists with no matching deduction (or the reverse)
// is exactly the kind of drift a transaction exists to prevent.
import { deductForFiredLines } from './stockMovementService.js';
import { isFeatureOn } from './settingsService.js';
import { routeLinesToStations } from './stationService.js';

export const KOT_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
});

/**
 * A ticket's status, derived from its lines and stored nowhere.
 *
 * A ticket whose every line was cancelled counts as COMPLETED: there is nothing
 * left to cook, so it should leave the kitchen screen rather than sit there
 * forever looking like outstanding work.
 */
export function kotStatusOf(lines) {
  const live = lines.filter((line) => line.status !== KOT_LINE_STATUSES.CANCELLED);
  if (live.length === 0) return KOT_STATUSES.COMPLETED;

  const ready = live.filter((line) => line.status === KOT_LINE_STATUSES.READY);
  if (ready.length === 0) return KOT_STATUSES.PENDING;
  if (ready.length === live.length) return KOT_STATUSES.COMPLETED;
  return KOT_STATUSES.IN_PROGRESS;
}

/** The ticket as the API describes it, with its derived status filled in. */
export function serialiseKot(kot) {
  const json = kot.toJSON();
  json.status = kotStatusOf(json.lines ?? []);
  return json;
}

/** Loads one ticket inside the caller's tenant, or 404. Never 403. */
export async function loadKotInTenant(req, kotId) {
  const kot = await Kot.findOne({ ...scoped(req), _id: kotId });
  if (!kot) throw new NotFoundError('Kitchen ticket not found.');
  return kot;
}

/* --------------------------------------------------------------------------
 * Firing
 * ----------------------------------------------------------------------- */

/**
 * Sends every pending line on an order to the kitchen as one new ticket.
 *
 * Firing twice creates two tickets, and that is the starters-then-mains flow
 * working correctly rather than a bug to guard against. Each ticket holds only
 * the batch that was pending when it was fired.
 *
 * The KOT number is reserved before the transaction, so an aborted fire leaves
 * a gap in the sequence rather than reusing a number. Kitchen tickets tolerate
 * gaps; see models/Counter.js for why bills will not.
 */
export async function fireOrder(req, { orderId, version }) {
  const order = await loadOrderInTenant(req, orderId);
  assertOrderIsOpen(order);

  const pending = order.lines.filter((line) => line.status === ORDER_LINE_STATUSES.PENDING);
  if (pending.length === 0) {
    // Firing an empty batch would print a blank chit in a hot kitchen.
    throw new BusinessRuleError('There is nothing new to send to the kitchen.');
  }

  /**
   * P05. One KOT per station: each line goes to its category's current
   * station, and anything unroutable goes to the default station. With no
   * active stations this is a single group with no station, exactly as before.
   */
  const groups = await routeLinesToStations(req, pending);

  /**
   * KOT numbers are reserved before the transaction, one per station, in
   * station order, so the numbering is predictable. An aborted fire leaves a
   * gap rather than reusing a number; see models/Counter.js.
   */
  const tickets = [];
  for (const group of groups) {
    tickets.push({
      ...group,
      kotId: new mongoose.Types.ObjectId(),
      kotNumber: await nextNumber({
        restaurantId: req.restaurantId,
        branchId: req.branchId,
        name: COUNTER_NAMES.KOT,
      }),
    });
  }

  const firedAt = nowUtc();

  // P02. Read once, before the transaction. A restaurant with inventory
  // switched off fires exactly as before and writes no stock movement.
  const inventoryOn = await isFeatureOn(req, 'inventory');

  const result = await withOptionalTransaction(
    async (session) => {
      const options = session ? { session } : {};

      const kots = await Kot.create(
        tickets.map((ticket) => ({
          _id: ticket.kotId,
          ...scoped(req),
          kotNumber: ticket.kotNumber,
          orderId: order._id,
          // Denormalised so the kitchen screen needs one query, not a join
          // per ticket, and so a table renamed next month does not rewrite
          // what this chit said.
          orderNumber: order.orderNumber,
          orderType: order.orderType,
          tableName: order.tableName,
          // P05. Frozen: moving the station later never rewrites this ticket.
          stationId: ticket.station?._id ?? null,
          stationName: ticket.station?.name ?? null,
          lines: ticket.lines.map((line) => ({
            orderLineId: line._id,
            itemName: line.itemName,
            variantName: line.variantName,
            quantity: line.quantity,
            // Names only. No prices reach the kitchen.
            addOnNames: line.addOns.map((addOn) => addOn.name),
            notes: line.notes,
            status: KOT_LINE_STATUSES.PENDING,
          })),
          firedBy: req.user.id,
          firedAt,
        })),
        { ...options, ordered: true },
      );

      /**
       * The version filter still applies. If someone added a line between the
       * read above and this write, nothing is written and the whole transaction
       * aborts, taking the tickets with it, so the kitchen never sees a chit
       * for an order state that did not happen.
       *
       * Each line points at the ticket it actually went on: one positional
       * filter per ticket, matching that ticket's own line ids.
       */
      const $set = {
        'lines.$[pending].status': ORDER_LINE_STATUSES.FIRED,
        'lines.$[pending].firedAt': firedAt,
      };
      const arrayFilters = [{ 'pending.status': ORDER_LINE_STATUSES.PENDING }];
      tickets.forEach((ticket, index) => {
        $set[`lines.$[kot${index}].kotId`] = ticket.kotId;
        arrayFilters.push({
          [`kot${index}._id`]: { $in: ticket.lines.map((line) => line._id) },
          [`kot${index}.status`]: ORDER_LINE_STATUSES.PENDING,
        });
      });

      const updatedOrder = await applyVersionedUpdate(req, {
        orderId,
        version,
        update: { $set },
        arrayFilters,
        session,
      });

      /**
       * M4: deduct stock for exactly the lines that just fired, in this same
       * transaction, once per line however many tickets the fire made.
       */
      if (inventoryOn) {
        await deductForFiredLines(req, { lines: pending, orderId: order._id, at: firedAt }, session);
      }

      return { kots, order: updatedOrder };
    },
    {
      /**
       * No transaction available, so the tickets may exist while the order was
       * never updated. Undo them by hand rather than leaving the kitchen chits
       * for food nobody ordered.
       */
      onFailureWithoutTransaction: async () => {
        await Kot.deleteMany({ ...scoped(req), _id: { $in: tickets.map((ticket) => ticket.kotId) } });
      },
    },
  );

  req.log?.info(
    {
      actorId: req.user.id,
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      kotIds: result.kots.map((kot) => String(kot._id)),
      kotNumbers: result.kots.map((kot) => kot.kotNumber),
      lineCount: pending.length,
    },
    'Order fired to the kitchen.',
  );

  const kots = result.kots.map(serialiseKot);
  // `kot` is the first ticket, so a client written before P05 keeps working.
  return { kot: kots[0], kots, order: serialiseOrder(result.order) };
}

/* --------------------------------------------------------------------------
 * The kitchen's side
 * ----------------------------------------------------------------------- */

/**
 * Marks ticket lines ready, and the order lines they came from with them.
 *
 * `lineId` marks one line. Omitting it marks every line on the ticket that is
 * not already ready or cancelled.
 *
 * There is no version here, deliberately. A ticket is append-only from the
 * kitchen's side and two cooks marking the same dish ready is harmless. The
 * order's own version is still incremented, so a floor screen holding a stale
 * copy finds out the next time it writes.
 *
 * The matching order line is found by `orderLineId` and only moved if it is
 * still FIRED. A line that has already been served must not be dragged back to
 * READY by someone tidying up the pass.
 */
export async function markKotLinesReady(req, { kotId, lineId }) {
  const kot = await loadKotInTenant(req, kotId);

  if (lineId) {
    const line = kot.lines.id(lineId);
    if (!line) throw new NotFoundError('That line is not on this ticket.');
    if (line.status === KOT_LINE_STATUSES.READY) {
      throw new BusinessRuleError('That one is already marked ready.');
    }
    if (line.status === KOT_LINE_STATUSES.CANCELLED) {
      throw new BusinessRuleError('That one was cancelled. It does not need to be made.');
    }
  }

  const targets = kot.lines.filter(
    (line) =>
      line.status === KOT_LINE_STATUSES.PENDING && (!lineId || String(line._id) === String(lineId)),
  );

  const readyAt = nowUtc();
  const orderLineIds = targets.map((line) => line.orderLineId);

  const updated = await withOptionalTransaction(async (session) => {
    const options = session ? { session } : {};

    if (targets.length > 0) {
      await Kot.updateOne(
        { ...scoped(req), _id: kot._id },
        {
          $set: {
            'lines.$[target].status': KOT_LINE_STATUSES.READY,
            'lines.$[target].readyAt': readyAt,
          },
        },
        {
          arrayFilters: [
            {
              'target._id': { $in: targets.map((line) => line._id) },
              'target.status': KOT_LINE_STATUSES.PENDING,
            },
          ],
          ...options,
        },
      );

      await Order.updateOne(
        { ...scoped(req), _id: kot.orderId },
        {
          $set: {
            'lines.$[line].status': ORDER_LINE_STATUSES.READY,
            'lines.$[line].readyAt': readyAt,
          },
          // The order changed, so anyone holding it has a stale copy.
          $inc: { version: 1 },
        },
        {
          arrayFilters: [
            { 'line._id': { $in: orderLineIds }, 'line.status': ORDER_LINE_STATUSES.FIRED },
          ],
          ...options,
        },
      );
    }

    return Kot.findOne({ ...scoped(req), _id: kot._id }).setOptions(options);
  });

  req.log?.info(
    {
      actorId: req.user.id,
      role: req.user.role,
      kotId: String(kot._id),
      kotNumber: kot.kotNumber,
      lineCount: targets.length,
    },
    'Kitchen marked food ready.',
  );

  return serialiseKot(updated);
}

/**
 * Cancels the ticket lines belonging to order lines that were just cancelled.
 *
 * Without this, the kitchen keeps cooking a dish the floor has already voided,
 * which is the "cancelled item problem" from BUILD-PLAN section 8 landing in
 * the most expensive possible way. Part 4 does not spell this out, but the KOT
 * line schema has a CANCELLED status and nothing else could ever set it.
 *
 * Runs inside the caller's session when there is one.
 */
export async function cancelKotLinesFor(req, { orderId, orderLineIds }, session) {
  if (orderLineIds.length === 0) return;

  await Kot.updateMany(
    { ...scoped(req), orderId },
    {
      $set: {
        'lines.$[target].status': KOT_LINE_STATUSES.CANCELLED,
      },
    },
    {
      arrayFilters: [
        {
          'target.orderLineId': { $in: orderLineIds },
          'target.status': { $ne: KOT_LINE_STATUSES.CANCELLED },
        },
      ],
      ...(session ? { session } : {}),
    },
  );
}
