/**
 * No Charge. M16, built in P08. docs/API-CONTRACT.md "M16 Settlement and Day
 * Close" section 1.
 *
 * Food given free, with a reason and an approver. It closes the order without a
 * bill, so it takes no invoice number and is never a sale. The order is kept,
 * every line on it, and the value given away is frozen at menu price before
 * GST, so the No Charge report reads a number nobody can recompute later.
 *
 * Stock was already deducted when the lines were fired, so nothing else moves.
 */
import { NO_CHARGE_REASONS } from '../config/noChargeReasons.js';
import { reasonText } from '../config/cancelReasons.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { Bill } from '../models/Bill.js';
import { ORDER_LINE_STATUSES, ORDER_STATUSES } from '../models/Order.js';
import { BusinessRuleError } from '../utils/errors.js';
import { sumPaise } from '../utils/money.js';
import { scoped } from '../utils/scopedQuery.js';
import { businessDateFor, nowUtc } from '../utils/time.js';
import { withOptionalTransaction } from '../utils/transaction.js';
import { recordAudit } from './auditService.js';
import { assertDayOpen } from './dayLockService.js';
import { applyVersionedUpdate, computeLineTotalInPaise, loadOrderInTenant } from './orderService.js';
import { approverForManagerTask } from './approvalService.js';
import { getSetting, getSettings } from './settingsService.js';

/** The four rules, each a 422 with its own sentence. */
async function assertNoChargeAllowed(req, order) {
  if (![ORDER_STATUSES.OPEN, ORDER_STATUSES.READY_TO_BILL].includes(order.status)) {
    throw new BusinessRuleError('Only an open order can be given No Charge.');
  }

  const liveBill = await Bill.exists({ ...scoped(req), orderId: order._id, isVoided: false });
  if (liveBill) {
    throw new BusinessRuleError('This order has a bill. Void the bill first.');
  }

  if (order.lines.some((line) => line.status === ORDER_LINE_STATUSES.PENDING)) {
    throw new BusinessRuleError('Send or cancel the unsent items first.');
  }

  if (!order.lines.some((line) => line.status !== ORDER_LINE_STATUSES.CANCELLED)) {
    throw new BusinessRuleError('Every item on this order was cancelled, so there is nothing to give.');
  }
}

/**
 * POST /orders/:orderId/no-charge. An owner or manager; a cashier with an
 * owner's or manager's PIN when the owner allows it (P28). `approvedBy` keeps
 * its meaning: whoever allowed the food to go free.
 */
export async function giveNoCharge(req, orderId, { version, reasonCode, note = null, approval = null }) {
  const { approvals } = await getSettings(req.restaurantId, { req });
  const approver = await approverForManagerTask(req, approval, approvals, 'Only an owner or a manager can give No Charge.');
  const order = await loadOrderInTenant(req, orderId);
  await assertNoChargeAllowed(req, order);

  const at = nowUtc();
  const startMinutes = await getSetting(req.restaurantId, 'business.businessDayStartsAtMinutes', {
    req,
  });
  const today = businessDateFor(at, startMinutes);
  const liveLines = order.lines.filter((line) => line.status !== ORDER_LINE_STATUSES.CANCELLED);
  const valueInPaise = sumPaise(...liveLines.map(computeLineTotalInPaise));

  return withOptionalTransaction(async (session) => {
    // P10: No Charge lands on today's business date, so today must be open.
    await assertDayOpen(req, today, { session });
    const updated = await applyVersionedUpdate(req, {
      orderId,
      version,
      update: {
        $set: {
          status: ORDER_STATUSES.NO_CHARGE,
          noCharge: {
            reasonCode,
            note: note ?? null,
            approvedBy: approver ?? req.user.id,
            at,
            businessDate: today,
            valueInPaise,
          },
        },
      },
      session,
    });

    await recordAudit(
      req,
      {
        action: AUDIT_ACTIONS.NO_CHARGE_GIVEN,
        entityType: AUDIT_ENTITY_TYPES.ORDER,
        entityId: order._id,
        entityLabel: `Order ${order.orderNumber}`,
        reason: reasonText(NO_CHARGE_REASONS, reasonCode, note),
        amountInPaise: valueInPaise,
        details: {
          orderNumber: order.orderNumber,
          tableName: order.tableName ?? null,
          reasonCode,
          lineCount: liveLines.length,
          ...(approver ? { approvedBy: String(approver) } : {}),
        },
      },
      session,
    );

    return updated;
  });
}

export default { giveNoCharge };
