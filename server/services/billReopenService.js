/**
 * Adding items after the bill is made. P26, API-CONTRACT M3 section 16.7.
 *
 * An invoice is never edited, so the bill is voided and the order goes back to
 * waiting to be billed, remembering the voided bill. Dishes are added on the
 * order as usual. When the order is billed again, the voided bill's discount
 * and payments carry onto the new bill (billService.createBill, through
 * billCarryService).
 */
import mongoose from 'mongoose';

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { Order } from '../models/Order.js';
import { BusinessRuleError, TableOccupiedError } from '../utils/errors.js';
import { scoped } from '../utils/scopedQuery.js';
import { recordAudit } from './auditService.js';
import { approverFor } from './approvalService.js';
import { assertNotVoided } from './billPermissionService.js';
import { readBill, voidBillInSession } from './billService.js';
import { assertDayOpen, todayBusinessDate } from './dayLockService.js';
import { getSettings } from './settingsService.js';

const DUPLICATE_KEY = 11000;

/** POST /bills/:billId/reopen. Returns `{ orderId, voidedBillId, voidedBillNumber }`. */
export async function reopenBill(req, billId, { approval = null } = {}) {
  const settings = await getSettings(req.restaurantId, { req });
  const approvedBy = await approverFor(req, approval, settings.billing);

  const existing = await readBill(req, billId);
  // A closed day answers first, before any rule about the bill.
  await assertDayOpen(req, [existing.businessDate, await todayBusinessDate(req)]);
  assertNotVoided(existing);
  if (existing.orderType === 'DELIVERY' && existing.platform?.code) {
    throw new BusinessRuleError('Platform orders change through the platform.');
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const voided = await voidBillInSession(req, billId, { reasonCode: 'ITEMS_CHANGED', note: 'Reopened to add items' }, session);
      await Order.updateOne({ ...scoped(req), _id: voided.orderId }, { $set: { reopenedFromBillId: voided._id } }, { session });
      await recordAudit(
        req,
        {
          action: AUDIT_ACTIONS.BILL_REOPENED,
          entityType: AUDIT_ENTITY_TYPES.BILL,
          entityId: voided._id,
          entityLabel: voided.billNumber,
          reason: 'Reopened to add items',
          amountInPaise: voided.grandTotalInPaise,
          details: { approvedBy: String(approvedBy), paidInPaise: voided.amountPaidInPaise ?? 0 },
        },
        session,
      );
    });
  } catch (error) {
    // The table was taken by another order since this bill was paid.
    if (error?.code === DUPLICATE_KEY && existing.tableId) {
      const other = await Order.findOne({ ...scoped(req), tableId: existing.tableId, occupiesTable: true }).select('_id').lean();
      throw new TableOccupiedError(other?._id, `${existing.tableName ?? 'This table'} has another order now. Add the dishes to that order instead.`);
    }
    throw error;
  } finally {
    await session.endSession();
  }

  return { orderId: String(existing.orderId), voidedBillId: String(existing._id), voidedBillNumber: existing.billNumber };
}

export default { reopenBill };
