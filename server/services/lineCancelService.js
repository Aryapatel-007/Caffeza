/**
 * Cancelling one order line, inside a transaction the caller gives. P25 Part E.
 *
 * Moved out of orderController.cancelOrderLine, unchanged, so cancelling an
 * item after billing runs exactly the same code as cancelling one before:
 * the line keeps its snapshot and becomes evidence, food made and thrown away
 * is audited, the kitchen ticket line is cancelled, and stock comes back only
 * when it was never made.
 */
import { LINE_CANCEL_REASONS, reasonText } from '../config/cancelReasons.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { ORDER_LINE_STATUSES } from '../models/Order.js';
import { nowUtc } from '../utils/time.js';
import { recordAudit } from './auditService.js';
import { cancelKotLinesFor } from './kitchenService.js';
import { applyVersionedUpdate, computeLineTotalInPaise } from './orderService.js';
import { returnStockForCancelledLine } from './stockMovementService.js';

/**
 * Cancels `line` of `order` at `version`. Returns the updated order. The
 * caller has already checked the order may change and the wasPrepared rule.
 */
export async function cancelLineInSession(req, { order, line, version, reasonCode, note = null, wasPrepared, inventoryOn }, session) {
  const updated = await applyVersionedUpdate(req, {
    orderId: order._id,
    version,
    update: {
      $set: {
        'lines.$[line].status': ORDER_LINE_STATUSES.CANCELLED,
        'lines.$[line].cancelledAt': nowUtc(),
        'lines.$[line].cancelledBy': req.user.id,
        'lines.$[line].cancelReasonCode': reasonCode,
        // P04: the free-text field now holds the optional note.
        'lines.$[line].cancelReason': note ?? null,
        'lines.$[line].wasPrepared': wasPrepared ?? null,
      },
    },
    arrayFilters: [{ 'line._id': line._id }],
    session,
  });

  /**
   * P04. Food the kitchen made and that nobody will pay for is an exception
   * an owner needs to see. Written inside the same transaction, so a cancel
   * that rolls back (a version conflict, say) leaves no audit line behind.
   * A line cancelled before preparation writes nothing: that is normal
   * operation, and normal operation is not audited.
   */
  if (wasPrepared === true) {
    await recordAudit(
      req,
      {
        action: AUDIT_ACTIONS.LINE_CANCELLED_AFTER_PREP,
        entityType: AUDIT_ENTITY_TYPES.ORDER,
        entityId: order._id,
        entityLabel: `Order ${order.orderNumber}`,
        reason: reasonText(LINE_CANCEL_REASONS, reasonCode, note),
        amountInPaise: computeLineTotalInPaise(line),
        details: {
          lineId: String(line._id),
          itemName: line.itemName,
          variantName: line.variantName ?? null,
          quantity: line.quantity,
          reasonCode,
          tableName: order.tableName ?? null,
        },
      },
      session,
    );
  }

  // If it reached the kitchen, take it off the ticket too, or the pass keeps
  // cooking a dish the floor has already voided.
  await cancelKotLinesFor(req, { orderId: order._id, orderLineIds: [line._id] }, session);

  // M4: it never got made, so whatever was deducted for it comes back.
  // A safe no-op if the line was still PENDING and nothing was ever
  // deducted for it in the first place.
  // P02: with inventory switched off nothing was deducted, so nothing returns.
  if (wasPrepared === false && inventoryOn) {
    await returnStockForCancelledLine(req, { orderLineId: line._id, orderId: order._id }, session);
  }

  return updated;
}

export default { cancelLineInSession };
