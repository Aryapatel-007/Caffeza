/**
 * Who may do what to whom, in one file.
 *
 * These rules are deliberately not scattered across the controllers. Anyone
 * asking "can a manager do this?" should be able to read the answer in one
 * place, and M1 onward should be able to see the shape of the rules without
 * reading three route handlers.
 *
 * Two kinds of rule live here.
 *
 * Permission rules are about who the caller is, and fail with 403 FORBIDDEN.
 * Business rules are about the state of the restaurant, and fail with 422.
 * The difference matters: 403 means "not you", 422 means "not this, by anyone".
 */
import { ROLES } from '../config/roles.js';
import { User } from '../models/User.js';
import { BusinessRuleError, ERROR_CODES, ForbiddenError } from '../utils/errors.js';

const isOwner = (role) => role === ROLES.OWNER;
const isManager = (role) => role === ROLES.MANAGER;

/**
 * A manager runs the floor. An owner runs the company.
 *
 * The four restrictions below all reduce to one idea: a manager cannot create,
 * become, or interfere with an owner. Without that, any manager could promote
 * themselves and the distinction would be decoration.
 */

/** Creating a user. */
export function assertCanCreateUser(actor, newRole) {
  if (isManager(actor.role) && isOwner(newRole)) {
    throw new ForbiddenError('Only an owner can create another owner.');
  }
}

/** Editing a user record. */
export function assertCanEditUser(actor, target, nextRole) {
  if (isManager(actor.role) && isOwner(target.role)) {
    throw new ForbiddenError('Only an owner can edit an owner.');
  }

  if (isManager(actor.role) && nextRole !== undefined && isOwner(nextRole)) {
    throw new ForbiddenError('Only an owner can promote someone to owner.');
  }

  /**
   * Applies to everyone, including an owner.
   *
   * The only owner of a restaurant demoting themselves would lock every
   * administrative action out of the account, with no way back in short of us
   * editing the database by hand.
   */
  if (nextRole !== undefined && nextRole !== target.role && String(target._id) === String(actor.id)) {
    throw new BusinessRuleError('You cannot change your own role. Ask another owner to do it.');
  }
}

/** Resetting someone password without knowing the current one. */
export function assertCanResetPassword(actor, target) {
  if (isManager(actor.role) && isOwner(target.role)) {
    throw new ForbiddenError('Only an owner can reset the password of an owner.');
  }
}

/** Setting or resetting someone's shared-tablet PIN. Same rule as a password reset. */
export function assertCanSetPin(actor, target) {
  if (isManager(actor.role) && isOwner(target.role)) {
    throw new ForbiddenError('Only an owner can set the PIN of an owner.');
  }
}

/** Activating or deactivating a user. */
export function assertCanChangeStatus(actor, target) {
  if (isManager(actor.role) && isOwner(target.role)) {
    throw new ForbiddenError('Only an owner can activate or deactivate an owner.');
  }
}

/**
 * A restaurant must always have at least one active owner.
 *
 * Checked at the moment of deactivation rather than assumed, because the count
 * changes as staff come and go. Deactivating the last one would leave a
 * restaurant nobody can administer: no way to add staff, reset a password, or
 * change the details on the invoice.
 *
 * Scoped by restaurantId, so the count is this restaurant and no other.
 */
export async function assertNotLastActiveOwner({ restaurantId }, target) {
  if (!isOwner(target.role) || target.isActive === false) return;

  const activeOwners = await User.countDocuments({
    restaurantId,
    role: ROLES.OWNER,
    isActive: true,
  });

  if (activeOwners <= 1) {
    throw new BusinessRuleError(
      'A restaurant must always have one active owner. Make someone else an owner first.',
      ERROR_CODES.LAST_OWNER,
    );
  }
}
