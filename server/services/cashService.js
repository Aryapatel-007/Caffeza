/**
 * The cash drawer. M16, built in P10. docs/API-CONTRACT.md "M16" section 3.
 *
 * The opening float, cash paid in, and cash paid out. Each takes today's
 * business date from the service clock and nothing else. Voided, never
 * deleted. Cash taken for bills and cash collected on accounts are not here:
 * they are payments and account entries, and computeDayFigures adds them in.
 */
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { CASH_MOVEMENT_TYPES, CashMovement } from '../models/CashMovement.js';
import { BusinessRuleError, CashCountMismatchError, DuplicateError, NotFoundError } from '../utils/errors.js';
import { CashCountError, sumCashCount } from '../utils/money.js';
import { scoped } from '../utils/scopedQuery.js';
import { nowUtc } from '../utils/time.js';
import { withOptionalTransaction } from '../utils/transaction.js';
import { recordAudit } from './auditService.js';
import { assertDayOpen, todayBusinessDate } from './dayLockService.js';
import { approverForManagerTask, approverIfNeeded } from './approvalService.js';
import { getSetting, getSettings } from './settingsService.js';

const DUPLICATE_KEY = 11000;

/** GET /cash-movements?date=. Default today's business date. Voided ones included, marked. */
export async function listCashMovements(req, { date } = {}) {
  const businessDate = date ?? (await todayBusinessDate(req));
  const movements = await CashMovement.find({ ...scoped(req), businessDate }).sort({ at: 1 });
  return { businessDate, movements: movements.map((movement) => movement.toJSON()) };
}

/**
 * POST /cash-movements. A paid out is manager work and is audited. P28: a
 * cashier may take one out with an owner's or manager's PIN when the owner
 * allows it, and a cashier's paid in needs the PIN when `approvals.paidIn` is
 * on. The opening float never needs one.
 */
export async function recordCashMovement(req, { type, amountInPaise, reason = null, cashCount = null, approval = null }) {
  const { approvals } = await getSettings(req.restaurantId, { req });
  let approvedBy = null;
  if (type === CASH_MOVEMENT_TYPES.PAID_OUT) {
    approvedBy = await approverForManagerTask(req, approval, approvals, 'Only an owner or a manager can take cash out of the drawer.');
  } else if (type === CASH_MOVEMENT_TYPES.PAID_IN) {
    approvedBy = await approverIfNeeded(req, approval, approvals.paidIn);
  }

  // P25 Part F. A float counted by notes: the server works out the amount itself.
  let counted = null;
  if (cashCount) {
    counted = await countCash(req, cashCount);
    if (amountInPaise !== undefined && amountInPaise !== counted.totalInPaise) {
      throw new CashCountMismatchError(counted.totalInPaise, amountInPaise);
    }
    amountInPaise = counted.totalInPaise;
    if (amountInPaise <= 0) throw new BusinessRuleError('Count at least one note or coin for the float.');
  }

  const businessDate = await todayBusinessDate(req);

  try {
    return await withOptionalTransaction(async (session) => {
      await assertDayOpen(req, businessDate, { session });

      const [movement] = await CashMovement.create(
        [{ ...scoped(req), type, amountInPaise, reason, businessDate, at: nowUtc(), by: req.user.id, approvedBy, ...(counted ? { cashCount: counted.cashCount } : {}) }],
        session ? { session } : {},
      );

      if (type === CASH_MOVEMENT_TYPES.PAID_OUT) {
        await recordAudit(
          req,
          {
            action: AUDIT_ACTIONS.CASH_PAID_OUT,
            entityType: AUDIT_ENTITY_TYPES.CASH,
            entityId: movement._id,
            entityLabel: `Paid out ${businessDate}`,
            reason,
            amountInPaise,
            details: { businessDate, ...(approvedBy ? { approvedBy: String(approvedBy) } : {}) },
          },
          session,
        );
      }
      // P28. A paid in someone else approved is never silent.
      if (type === CASH_MOVEMENT_TYPES.PAID_IN && approvedBy) {
        await recordAudit(
          req,
          {
            action: AUDIT_ACTIONS.CASH_PAID_IN,
            entityType: AUDIT_ENTITY_TYPES.CASH,
            entityId: movement._id,
            entityLabel: `Paid in ${businessDate}`,
            reason,
            amountInPaise,
            details: { businessDate, approvedBy: String(approvedBy) },
          },
          session,
        );
      }
      return movement;
    });
  } catch (error) {
    if (error?.code === DUPLICATE_KEY) {
      throw new DuplicateError(
        'An opening float is already recorded for today. Void it first if it was wrong.',
      );
    }
    throw error;
  }
}

/** POST /cash-movements/:id/void. OWNER and MANAGER, with a reason. */
export async function voidCashMovement(req, movementId, { reason }) {
  const movement = await CashMovement.findOne({ ...scoped(req), _id: movementId });
  if (!movement) throw new NotFoundError('Cash entry not found.');
  if (movement.isVoided) throw new BusinessRuleError('This cash entry is already voided.');

  await assertDayOpen(req, movement.businessDate);

  movement.isVoided = true;
  movement.voidedAt = nowUtc();
  movement.voidedBy = req.user.id;
  movement.voidReason = reason;
  await movement.save();
  return movement;
}

export default { listCashMovements, recordCashMovement, voidCashMovement };

/**
 * Totals a count by notes and coins against this restaurant's denominations.
 * P25 Part F. Shared by the opening float, Day Close and a cash payment.
 */
export async function countCash(req, cashCount) {
  const denominations = await getSetting(req.restaurantId, 'cash.denominations', { req });
  try {
    return sumCashCount(cashCount, denominations);
  } catch (error) {
    if (error instanceof CashCountError) throw new BusinessRuleError(error.message);
    throw error;
  }
}

