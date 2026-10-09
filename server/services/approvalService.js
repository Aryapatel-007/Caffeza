/**
 * A manager's approval by PIN. P25 Part E built it for cancelling after
 * billing; P28 moved it here so every sensitive action asks the same way.
 * API-CONTRACT, P28 section 1.
 *
 * An OWNER or MANAGER approves themselves. Anyone else names an active owner
 * or manager of the same restaurant, who types their PIN on the same screen.
 * The PIN is checked by `verifyPin`, which issues no session and locks after
 * five wrong tries, exactly as at the attendance station.
 */
import { ROLES } from '../config/roles.js';
import { User } from '../models/User.js';
import { ForbiddenError } from '../utils/errors.js';
import { verifyPin } from './authService.js';

export const APPROVERS = Object.freeze([ROLES.OWNER, ROLES.MANAGER]);
export const APPROVAL_NEEDED = 'A manager has to approve this. Pick their name and type their PIN.';

export function approvesOwnWork(role) {
  return APPROVERS.includes(role);
}

/**
 * The approver's id once their PIN is right. A missing approval, or a name
 * that is not an active owner or manager here, is one 403; a wrong PIN, or
 * none set, is verifyPin's own 401.
 */
export async function verifyApproval(req, approval) {
  if (!approval) throw new ForbiddenError(APPROVAL_NEEDED);

  const approver = await User.findOne({
    restaurantId: req.restaurantId,
    _id: approval.approverId,
    isActive: true,
    role: { $in: APPROVERS },
  })
    .select('_id branchId')
    .lean();
  // The same answer whether the person does not exist or is not a manager.
  if (!approver) throw new ForbiddenError(APPROVAL_NEEDED);

  await verifyPin({ restaurantId: req.restaurantId, branchId: approver.branchId, userId: approver._id }, approval.pin);
  return approver._id;
}

/**
 * P25 Part E and P26. Who may cancel after billing or reopen a bill, and who
 * approved. A CASHIER may ask, and a WAITER when captains may bill.
 */
export function approverFor(req, approval, billing, { preview = false } = {}) {
  if (approvesOwnWork(req.user.role)) return req.user.id;
  const mayAsk = req.user.role === ROLES.CASHIER || (req.user.role === ROLES.WAITER && billing.captainsMayBill);
  if (!mayAsk) throw new ForbiddenError('Only the counter can cancel an item on a bill.');
  // A preview changes nothing, so it needs no manager yet: the screen shows the numbers, then asks for the PIN.
  if (preview) return null;
  return verifyApproval(req, approval);
}

/**
 * P28. A manager task a CASHIER may do with a PIN when `approvals.managerTasks`
 * is on. Returns the approver's id, or null when the actor is an owner or
 * manager. Anyone else gets `refusal`, the 403 the endpoint gave before P28.
 */
export function approverForManagerTask(req, approval, approvals, refusal) {
  if (approvesOwnWork(req.user.role)) return null;
  if (req.user.role !== ROLES.CASHIER || !approvals.managerTasks) throw new ForbiddenError(refusal);
  return verifyApproval(req, approval);
}

/**
 * P28. An action the role may already do, which needs a PIN when `needed`.
 * Returns the approver's id, or null when none was needed.
 */
export function approverIfNeeded(req, approval, needed) {
  if (approvesOwnWork(req.user.role) || !needed) return null;
  return verifyApproval(req, approval);
}

export default { approverFor, approverForManagerTask, approverIfNeeded, verifyApproval };
