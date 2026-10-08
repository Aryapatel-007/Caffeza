/**
 * Orders. Shapes come from Part 4 section M2.2 of docs/PROJECT-PLAN.md.
 *
 * Two things in this file are load-bearing and neither is obvious from reading
 * the happy path:
 *
 * Every price on a line is written by the server from the menu item, never sent
 * by the client. services/orderService.js does that copying.
 *
 * Every write goes through applyVersionedUpdate, which puts the client's
 * version into the update filter. There is no read-modify-save anywhere in
 * here, on purpose. See the note at the bottom of models/Order.js.
 */
import {
  ORDER_CANCEL_REASONS,
  reasonText,
} from '../config/cancelReasons.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import {
  Order,
  ORDER_LINE_STATUSES,
  PREPARED_LINE_STATUSES,
  ORDER_STATUSES,
  ORDER_TYPES,
} from '../models/Order.js';
import { recordAudit } from '../services/auditService.js';
import { cancelKotLinesFor, fireOrder as fireOrderToKitchen } from '../services/kitchenService.js';
// M4. wasPrepared: false means the kitchen had already deducted for this line
// and it was never actually made, so the ingredients go back. Keyed on the
// ledger, not on the flag alone -- see stockMovementService.js.
import { cancelLineInSession } from '../services/lineCancelService.js';
import { giveNoCharge } from '../services/noChargeService.js';
import { returnStockForCancelledLine } from '../services/stockMovementService.js';
import { isFeatureOn } from '../services/settingsService.js';
import {
  applyVersionedUpdate,
  assertOrderIsOpen,
  assertOrderWasPreparedRule,
  assertWasPreparedRule,
  buildLineSnapshots,
  computeLineTotalInPaise,
  findLine,
  isReadyToBill,
  loadOrderInTenant,
  serialiseOrder,
} from '../services/orderService.js';
import { BusinessRuleError } from '../utils/errors.js';
import { sumPaise } from '../utils/money.js';
import { sendList, sendSuccess } from '../utils/response.js';
import { scoped } from '../utils/scopedQuery.js';
import { withOptionalTransaction } from '../utils/transaction.js';
import { assertTableUsable, openOrder, rethrowTableConflict } from '../services/orderOpenService.js';
import { nowUtc } from '../utils/time.js';

/** POST /orders */
export async function createOrder(req, res) {
  const saved = await openOrder(req, req.body);

  req.log?.info(
    {
      actorId: req.user.id,
      orderId: String(saved._id),
      orderNumber: saved.orderNumber,
      orderType: saved.orderType,
      lineCount: saved.lines.length,
    },
    'Order opened.',
  );

  return sendSuccess(res, serialiseOrder(saved), 201);
}

/** POST /orders/:orderId/no-charge. P08. Every rule is in services/noChargeService.js. */
export async function postNoCharge(req, res) {
  const order = await giveNoCharge(req, req.params.orderId, req.body);
  return sendSuccess(res, serialiseOrder(order));
}

/**
 * GET /orders
 *
 * Paginated, unlike the floor view's table list. An order list grows without
 * bound over the life of a restaurant.
 */
export async function listOrders(req, res) {
  const { page, limit, status, orderType, tableId } = req.query;

  const filter = { ...scoped(req) };
  if (status !== undefined) filter.status = { $in: status };
  if (orderType !== undefined) filter.orderType = orderType;
  if (tableId !== undefined) filter.tableId = tableId;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);

  // The same serialisation as a single read, totals included. A list of orders
  // that could not show a running total would send every screen back for a
  // second request per row.
  return sendList(res, orders.map(serialiseOrder), { page, limit, total });
}

/** GET /orders/:orderId */
export async function getOrder(req, res) {
  const order = await loadOrderInTenant(req, req.params.orderId);
  return sendSuccess(res, serialiseOrder(order));
}

/**
 * POST /orders/:orderId/lines
 *
 * The client sends ids and a quantity. Every price, name and tax rate on the
 * stored line is copied here from the menu item, and after this nothing reads
 * the menu for a price again.
 */
export async function addOrderLines(req, res) {
  const { orderId } = req.params;
  const { version, lines } = req.body;

  const order = await loadOrderInTenant(req, orderId);
  assertOrderIsOpen(order);

  /**
   * Snapshotted before the write, on the order as we last read it. If someone
   * else changes the order in between, the version in the update filter will
   * not match and nothing is written, so the worst case is wasted work rather
   * than a line priced against a stale read.
   */
  // P06: a PLATFORM_COLLECTS order freezes every new line at 0% too.
  const snapshotLines = await buildLineSnapshots(req, lines, { taxTreatment: order.taxTreatment });

  const updated = await applyVersionedUpdate(req, {
    orderId,
    version,
    update: { $push: { lines: { $each: snapshotLines } } },
  });

  req.log?.info(
    {
      actorId: req.user.id,
      orderId: String(updated._id),
      orderNumber: updated.orderNumber,
      addedLines: snapshotLines.length,
    },
    'Lines added to order.',
  );

  return sendSuccess(res, serialiseOrder(updated));
}

/**
 * PATCH /orders/:orderId/lines/:lineId
 *
 * Quantity and notes only. Changing what was ordered is a cancel plus a new
 * line, because the snapshot on a line has to keep being the thing that was
 * actually ordered.
 */
export async function editOrderLine(req, res) {
  const { orderId, lineId } = req.params;
  const { version, quantity, notes } = req.body;

  const order = await loadOrderInTenant(req, orderId);
  assertOrderIsOpen(order);

  const line = findLine(order, lineId);
  if (line.status !== ORDER_LINE_STATUSES.PENDING) {
    throw new BusinessRuleError(
      'The kitchen already has this one. It can be cancelled, but not changed.',
    );
  }

  const changes = {};
  if (quantity !== undefined) changes['lines.$[line].quantity'] = quantity;
  if (notes !== undefined) changes['lines.$[line].notes'] = notes;

  const updated = await applyVersionedUpdate(req, {
    orderId,
    version,
    update: { $set: changes },
    /**
     * The positional filter carries the line's status as well as its id. If the
     * line is fired between the read above and this write, the filter matches
     * nothing, the update touches no line, and the version check still passes
     * because the order itself did change. Belt and braces, cheaply.
     */
    arrayFilters: [{ 'line._id': lineId, 'line.status': ORDER_LINE_STATUSES.PENDING }],
  });

  return sendSuccess(res, serialiseOrder(updated));
}

/**
 * POST /orders/:orderId/lines/:lineId/cancel
 *
 * The line is never removed from the array. It keeps every snapshot value and
 * becomes evidence: who cancelled it, when, why, and whether the kitchen had
 * already made it.
 */
export async function cancelOrderLine(req, res) {
  const { orderId, lineId } = req.params;
  const { version, reasonCode, note, wasPrepared } = req.body;

  const order = await loadOrderInTenant(req, orderId);
  assertOrderIsOpen(order);

  const line = findLine(order, lineId);
  if (line.status === ORDER_LINE_STATUSES.CANCELLED) {
    throw new BusinessRuleError('That line is already cancelled.');
  }

  // 400 when the question does not apply, 422 when it does and was not
  // answered. See the note on this function.
  assertWasPreparedRule(line.status, wasPrepared);

  const inventoryOn = await isFeatureOn(req, 'inventory');

  const updated = await withOptionalTransaction((session) =>
    cancelLineInSession(req, { order, line, version, reasonCode, note, wasPrepared, inventoryOn }, session),
  );

  req.log?.info(
    {
      actorId: req.user.id,
      role: req.user.role,
      orderId: String(updated._id),
      orderNumber: updated.orderNumber,
      lineId: String(lineId),
      previousStatus: line.status,
      wasPrepared: wasPrepared ?? null,
    },
    'Order line cancelled.',
  );

  return sendSuccess(res, serialiseOrder(updated));
}

/**
 * POST /orders/:orderId/fire
 *
 * Everything pending goes to the kitchen as one new ticket. The work is in
 * services/kitchenService.js, because it writes an order and a KOT together
 * and those two must not drift.
 */
export async function fireOrder(req, res) {
  const { kot, kots, order } = await fireOrderToKitchen(req, {
    orderId: req.params.orderId,
    version: req.body.version,
  });

  // P05: `kots` is every ticket, one per station; `kot` is the first of them.
  return sendSuccess(res, { kot, kots, order });
}

/**
 * PATCH /orders/:orderId/lines/:lineId/served
 *
 * The one place M2 moves an order's own status without being asked to. When
 * the last live line is served there is nothing left to do on the floor, so the
 * order goes to the cashier's queue by itself.
 */
export async function markLineServed(req, res) {
  const { orderId, lineId } = req.params;
  const { version } = req.body;

  const order = await loadOrderInTenant(req, orderId);
  assertOrderIsOpen(order);

  const line = findLine(order, lineId);
  if (line.status !== ORDER_LINE_STATUSES.READY) {
    throw new BusinessRuleError(
      line.status === ORDER_LINE_STATUSES.SERVED
        ? 'That one has already been served.'
        : 'The kitchen has not marked that ready yet.',
    );
  }

  const servedAt = nowUtc();

  /**
   * Whether this is the last one is worked out from the order as read, with
   * this line counted as served. If someone else changes the order in between,
   * the version filter rejects the write and none of this is applied, so the
   * conclusion cannot be acted on while stale.
   */
  const linesAfter = order.lines.map((existing) =>
    String(existing._id) === String(lineId)
      ? { status: ORDER_LINE_STATUSES.SERVED }
      : { status: existing.status },
  );

  const closesTheOrder = isReadyToBill(linesAfter);

  const update = {
    $set: {
      'lines.$[line].status': ORDER_LINE_STATUSES.SERVED,
      'lines.$[line].servedAt': servedAt,
      ...(closesTheOrder
        ? { status: ORDER_STATUSES.READY_TO_BILL, readyToBillAt: servedAt }
        : {}),
    },
  };

  const updated = await applyVersionedUpdate(req, {
    orderId,
    version,
    update,
    arrayFilters: [{ 'line._id': lineId, 'line.status': ORDER_LINE_STATUSES.READY }],
  });

  if (closesTheOrder) {
    req.log?.info(
      { actorId: req.user.id, orderId: String(updated._id), orderNumber: updated.orderNumber },
      'Order ready to bill.',
    );
  }

  return sendSuccess(res, serialiseOrder(updated));
}

/**
 * PATCH /orders/:orderId/table
 *
 * `tableName` is re-snapshotted to the new table, because it describes where
 * the order is now, not where it started.
 */
export async function moveOrderToTable(req, res) {
  const { orderId } = req.params;
  const { version, tableId } = req.body;

  const order = await loadOrderInTenant(req, orderId);
  assertOrderIsOpen(order);

  if (order.orderType !== ORDER_TYPES.DINE_IN) {
    throw new BusinessRuleError('A takeaway order is not on a table, so it cannot be moved to one.');
  }

  const table = await assertTableUsable(req, tableId);

  const updated = await applyVersionedUpdate(req, {
    orderId,
    version,
    update: { $set: { tableId: table._id, tableName: table.name } },
  }).catch((error) => rethrowTableConflict(req, tableId, error));

  req.log?.info(
    {
      actorId: req.user.id,
      orderId: String(updated._id),
      orderNumber: updated.orderNumber,
      fromTable: order.tableName,
      toTable: table.name,
    },
    'Order moved to another table.',
  );

  return sendSuccess(res, serialiseOrder(updated));
}

/**
 * POST /orders/:orderId/cancel
 *
 * OWNER and MANAGER only, and that is the whole point of the endpoint.
 *
 * A waiter can cancel one line, which is an ordinary correction. Making a whole
 * table disappear is the move a dishonest staff member uses to pocket a cash
 * bill, and it is the exact gap restaurant owners lose money to today. The
 * route gating is in routes/orderRoutes.js; this comment is here because this
 * is where someone would come to "simplify" it.
 *
 * Nothing is deleted. The order and every line stay in the database forever.
 */
export async function cancelOrder(req, res) {
  const { orderId } = req.params;
  const { version, reasonCode, note, wasPrepared } = req.body;

  const order = await loadOrderInTenant(req, orderId);

  if (order.status === ORDER_STATUSES.CANCELLED) {
    throw new BusinessRuleError('That order is already cancelled.');
  }
  if (order.status === ORDER_STATUSES.BILLED) {
    throw new BusinessRuleError('That order has been billed. A bill is voided, not cancelled.');
  }
  if (order.status === ORDER_STATUSES.NO_CHARGE) {
    throw new BusinessRuleError('That order was given No Charge and is closed.');
  }

  // One answer covers every fired line: the manager is answering "did the
  // kitchen make any of this", not auditing it dish by dish.
  assertOrderWasPreparedRule(order, wasPrepared);

  const now = nowUtc();

  const liveLines = order.lines.filter((line) => line.status !== ORDER_LINE_STATUSES.CANCELLED);
  const stillLive = liveLines.map((line) => line._id);
  const liveValueInPaise = sumPaise(...liveLines.map(computeLineTotalInPaise));

  const inventoryOn = await isFeatureOn(req, 'inventory');

  const updated = await withOptionalTransaction(async (session) => {
    const cancelled = await applyVersionedUpdate(req, {
      orderId,
      version,
      update: {
        $set: {
          status: ORDER_STATUSES.CANCELLED,
          isCancelled: true,
          cancelledAt: now,
          cancelledBy: req.user.id,
          cancelReasonCode: reasonCode,
          // P04: the free-text field now holds the optional note.
          cancelReason: note ?? null,
          // Every line that is not already cancelled goes with it, keeping its
          // own snapshot. The positional filter leaves already-cancelled lines
          // alone so their original reason and wasPrepared survive.
          'lines.$[live].status': ORDER_LINE_STATUSES.CANCELLED,
          'lines.$[live].cancelledAt': now,
          'lines.$[live].cancelledBy': req.user.id,
          'lines.$[live].cancelReason': note ?? null,
          // The order's reasons are a different list from a line's. The line
          // keeps the note; its code stays null rather than borrowing an order
          // code the line enum does not contain.
          /**
           * The one answer only lands on lines that actually reached the
           * kitchen. A line still PENDING was never fired, so no stock was
           * ever deducted for it and there is nothing to give back; writing
           * "yes it was made" onto it would be recording something untrue.
           *
           * This is the same rule the single-line cancel enforces, where
           * answering for a line that never went to the kitchen is a 400. The
           * whole-order path used to contradict it by writing the answer onto
           * every live line.
           *
           * arrayFilters are matched against the document as it was before
           * this update, so `kitchen` selects the lines that were FIRED,
           * READY or SERVED going in.
           */
          'lines.$[kitchen].wasPrepared': wasPrepared ?? null,
        },
      },
      arrayFilters: [
        { 'live.status': { $ne: ORDER_LINE_STATUSES.CANCELLED } },
        { 'kitchen.status': { $in: [...PREPARED_LINE_STATUSES] } },
      ],
      session,
    });

    await cancelKotLinesFor(req, { orderId, orderLineIds: stillLive }, session);

    /**
     * P04. ORDER_CANCELLED was in the audit list from M3 and nothing wrote it,
     * so a table could disappear without a trace. Every whole-order cancel
     * writes one line now, inside the transaction, carrying the value of every
     * line that was still live.
     */
    await recordAudit(
      req,
      {
        action: AUDIT_ACTIONS.ORDER_CANCELLED,
        entityType: AUDIT_ENTITY_TYPES.ORDER,
        entityId: order._id,
        entityLabel: `Order ${order.orderNumber}`,
        reason: reasonText(ORDER_CANCEL_REASONS, reasonCode, note),
        amountInPaise: liveValueInPaise,
        details: {
          orderNumber: order.orderNumber,
          tableName: order.tableName ?? null,
          lineCount: stillLive.length,
          reasonCode,
          wasPrepared: wasPrepared ?? null,
        },
      },
      session,
    );

    /**
     * M4: the same one-answer-covers-the-whole-order rule as wasPrepared
     * itself. Called for every live line, including ones that were still
     * PENDING and never fired -- returnStockForCancelledLine reads the ledger
     * for each and is a safe no-op wherever there is nothing to return.
     */
    if (wasPrepared === false && inventoryOn) {
      for (const orderLineId of stillLive) {
        await returnStockForCancelledLine(req, { orderLineId, orderId }, session);
      }
    }

    return cancelled;
  });

  req.log?.warn(
    {
      actorId: req.user.id,
      role: req.user.role,
      orderId: String(updated._id),
      orderNumber: updated.orderNumber,
      lineCount: updated.lines.length,
      wasPrepared: wasPrepared ?? null,
    },
    'Whole order cancelled.',
  );

  return sendSuccess(res, serialiseOrder(updated));
}
