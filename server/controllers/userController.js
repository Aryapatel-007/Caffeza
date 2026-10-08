/**
 * Staff management.
 *
 * Shapes come from docs/API-CONTRACT.md section 3. Nothing here names the
 * stored credential: services/authService.js and passwordService.js own it, so
 * a grep of this folder stays empty.
 *
 * There is no delete. A user is deactivated, and the record stays, because M5
 * attendance history links to it and a deleted user takes that history with it.
 */
import { ROLES } from '../config/roles.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { REVOKE_REASONS } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import {
  createUserWithPassword,
  isEmailRegistered,
  isPhoneRegistered,
  setPassword,
  setPin,
} from '../services/authService.js';
import { recordAudit } from '../services/auditService.js';
import { revokeAllForUser } from '../services/tokenService.js';
import {
  assertCanChangeStatus,
  assertCanCreateUser,
  assertCanEditUser,
  assertCanResetPassword,
  assertCanSetPin,
  assertNotLastActiveOwner,
} from '../services/userPermissionService.js';
import { assertStationUsable } from '../services/stationService.js';
import { DuplicateError, NotFoundError, ValidationError } from '../utils/errors.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { sendList, sendSuccess } from '../utils/response.js';
import { scoped } from '../utils/scopedQuery.js';

/**
 * A whitelist, not a blacklist.
 *
 * The stored credential is `select: false` so it would not arrive anyway, but
 * naming what goes out means a field added to the model in M1 cannot leak
 * through this endpoint by default.
 */
function present(user) {
  return {
    id: String(user._id),
    name: user.name,
    phone: user.phone,
    email: user.email ?? null,
    role: user.role,
    isActive: user.isActive,
    restaurantId: String(user.restaurantId),
    branchId: String(user.branchId),
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
    // P05. The station a KITCHEN user's screen opens on.
    stationId: user.stationId ? String(user.stationId) : null,
  };
}

/**
 * P05. A station belongs only to a KITCHEN user, and must be an active station
 * of this restaurant. Any other role sending one is a malformed request.
 */
async function resolveStationFor(req, role, stationId) {
  if (stationId === undefined || stationId === null) return stationId;
  if (role !== ROLES.KITCHEN) {
    throw new ValidationError('One of the values sent was not valid.', {
      stationId: 'Only a KITCHEN user has a station.',
    });
  }
  await assertStationUsable(req, stationId);
  return stationId;
}

/**
 * Loads one user inside the caller tenant.
 *
 * The tenant guard forces restaurantId into the filter, so a user in another
 * restaurant simply does not come back, and null becomes 404. There is no
 * separate ownership check that could accidentally answer 403, which would
 * confirm the record exists.
 */
async function loadUserInTenant(req) {
  const user = await User.findOne({ ...scoped(req), _id: req.params.userId });
  if (!user) throw new NotFoundError('User not found.');
  return user;
}

/**
 * POST /users
 *
 * restaurantId and branchId come from the token. If the client sent either,
 * the tenant middleware already removed it before this ran.
 */
export async function createUser(req, res) {
  const { name, phone, email, role, password, stationId } = req.body;

  assertCanCreateUser(req.user, role);
  const station = await resolveStationFor(req, role, stationId);

  /**
   * Phone numbers are unique across the whole platform, so this asks a global
   * question through the one service that is allowed to.
   *
   * The 409 says the number is taken and stops there. Naming the restaurant
   * that holds it would leak one customer staff list to another.
   */
  if (await isPhoneRegistered(phone)) {
    throw new DuplicateError('That phone number is already registered.', {
      phone: 'Already registered.',
    });
  }

  // Email is a login identity now, so it is globally unique too. Same 409, same
  // silence about which restaurant holds it.
  if (email && (await isEmailRegistered(email))) {
    throw new DuplicateError('That email address is already registered.', {
      email: 'Already registered.',
    });
  }

  const user = await createUserWithPassword(
    { ...scoped(req), name, phone, email: email ?? null, role, stationId: station ?? null },
    password,
  );

  req.log?.info(
    { actorId: req.user.id, createdUserId: String(user._id), role },
    'Staff user created.',
  );

  return sendSuccess(res, present(user), 201);
}

/** GET /users */
export async function listUsers(req, res) {
  const { page, limit, role, isActive, search } = req.query;

  const filter = { ...scoped(req) };
  if (role !== undefined) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive;

  if (search) {
    // Escaped first. An unescaped ".*" here would match every row and turn a
    // search box into a full collection scan.
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: pattern }, { phone: pattern }];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return sendList(res, users.map(present), { page, limit, total });
}

/** GET /users/:userId */
export async function getUser(req, res) {
  return sendSuccess(res, present(await loadUserInTenant(req)));
}

/**
 * PATCH /users/:userId
 *
 * Only name, email and role. Phone is refused by the schema, because it is the
 * login identity and globally unique: changing it is a new record plus a
 * deactivation, not an edit.
 */
export async function updateUser(req, res) {
  const user = await loadUserInTenant(req);
  const { name, email, role, stationId } = req.body;

  // Every permission and business rule, before anything is written.
  assertCanEditUser(req.user, user, role);
  const station = await resolveStationFor(req, role ?? user.role, stationId);

  // Setting an email to a new address has to clear the global-uniqueness check,
  // the same as creating one. Clearing it (email: null) is always fine.
  if (email && email.toLowerCase() !== (user.email ?? '') && (await isEmailRegistered(email))) {
    throw new DuplicateError('That email address is already registered.', {
      email: 'Already registered.',
    });
  }

  const roleChanged = role !== undefined && role !== user.role;
  const previousRole = user.role;

  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  if (role !== undefined) user.role = role;
  if (station !== undefined) user.stationId = station;
  // A user moved away from KITCHEN has no station any more.
  if (user.role !== ROLES.KITCHEN) user.stationId = null;

  await user.save();

  if (roleChanged) {
    /**
     * A demoted user must not keep a session carrying the old role.
     *
     * Part B made authenticate read the role from the database, so an existing
     * access token already picks up the change on its next request. This is
     * belt and braces on top of that, and it costs one update.
     */
    await revokeAllForUser(
      { restaurantId: req.restaurantId, userId: user._id },
      REVOKE_REASONS.USER_DEACTIVATED,
    );

    req.log?.info(
      { actorId: req.user.id, targetUserId: String(user._id), newRole: role },
      'Staff role changed. Sessions revoked.',
    );

    // M8. A manager promoting an accomplice to a role that can void bills.
    await recordAudit(req, {
      action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
      entityType: AUDIT_ENTITY_TYPES.USER,
      entityId: user._id,
      reason: `Role changed from ${previousRole} to ${role}.`,
      details: { fromRole: previousRole, toRole: role },
    });
  }

  return sendSuccess(res, present(user));
}

/**
 * PATCH /users/:userId/status
 *
 * There is no delete endpoint. This is how a user leaves: the record stays so
 * M5 attendance history keeps something to point at.
 */
export async function updateStatus(req, res) {
  const user = await loadUserInTenant(req);
  const { isActive } = req.body;

  assertCanChangeStatus(req.user, user);

  if (isActive === false) {
    // Counted now rather than assumed, because the number changes as staff
    // come and go. Throws 422 LAST_OWNER if this is the last active owner.
    await assertNotLastActiveOwner({ restaurantId: req.restaurantId }, user);
  }

  const wasActive = user.isActive;
  user.isActive = isActive;
  await user.save();

  if (wasActive && isActive === false) {
    const sessionsRevoked = await revokeAllForUser(
      { restaurantId: req.restaurantId, userId: user._id },
      REVOKE_REASONS.USER_DEACTIVATED,
    );

    req.log?.info(
      { actorId: req.user.id, targetUserId: String(user._id), sessionsRevoked },
      'Staff user deactivated. Sessions revoked.',
    );
  }

  // M8. Removing a colleague's access, or restoring an account switched off for a reason.
  if (wasActive !== isActive) {
    await recordAudit(req, {
      action: isActive ? AUDIT_ACTIONS.USER_REACTIVATED : AUDIT_ACTIONS.USER_DEACTIVATED,
      entityType: AUDIT_ENTITY_TYPES.USER,
      entityId: user._id,
      reason: isActive ? 'Staff account switched back on.' : 'Staff account switched off.',
      details: { role: user.role },
    });
  }

  /**
   * Reactivation does not bring old sessions back. They stay revoked and the
   * user signs in fresh, which is the safe direction: whatever reason there
   * was to switch them off should not hand back a live session.
   */

  return sendSuccess(res, present(user));
}

/**
 * PATCH /users/:userId/password
 *
 * A manager resetting a password for someone who forgot theirs, so the current
 * password is not required. That is exactly why a manager cannot do it to an
 * owner: it would be a way to take over the account.
 */
export async function resetUserPassword(req, res) {
  const user = await loadUserInTenant(req);

  assertCanResetPassword(req.user, user);

  // Stamps passwordChangedAt in the same save, which is what stops the target
  // outstanding access tokens from working.
  await setPassword(user, req.body.newPassword);

  const sessionsRevoked = await revokeAllForUser(
    { restaurantId: req.restaurantId, userId: user._id },
    REVOKE_REASONS.PASSWORD_CHANGED,
  );

  req.log?.info(
    { actorId: req.user.id, targetUserId: String(user._id), sessionsRevoked },
    'Staff password reset. Sessions revoked.',
  );

  // M8. Resetting someone's password is a way to use their account.
  await recordAudit(req, {
    action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
    entityType: AUDIT_ENTITY_TYPES.USER,
    entityId: user._id,
    reason: 'Password reset by someone else.',
    details: { role: user.role },
  });

  // The new password is never echoed back. The manager typed it and knows it.
  return sendSuccess(res, { passwordReset: true });
}

/**
 * PATCH /users/:userId/pin
 *
 * Sets or replaces the shared-tablet attendance PIN, and clears any lock on it.
 * The stored credential is never named in this file: services/authService.js
 * owns it, the same discipline the password hash follows.
 *
 * A MANAGER cannot set an OWNER's PIN, the same rule as a password reset: a PIN
 * is a credential, and letting a manager set one for an owner is a way to act
 * as that owner at a station.
 */
export async function setUserPin(req, res) {
  const user = await loadUserInTenant(req);

  assertCanSetPin(req.user, user);

  await setPin(user, req.body.pin);

  req.log?.info({ actorId: req.user.id, targetUserId: String(user._id) }, 'Staff PIN set.');

  // M8. The same reason as a password reset, for the attendance clock.
  await recordAudit(req, {
    action: AUDIT_ACTIONS.USER_PIN_RESET,
    entityType: AUDIT_ENTITY_TYPES.USER,
    entityId: user._id,
    reason: 'Attendance PIN set by someone else.',
    details: { role: user.role },
  });

  return sendSuccess(res, { pinSet: true });
}

/**
 * GET /users/approvers. P25 Part E. The active owners and managers of this
 * restaurant, by name, so a cashier or captain can ask one to type a PIN.
 * Nothing but the id, name and role.
 */
export async function listApprovers(req, res) {
  const approvers = await User.find({
    restaurantId: req.restaurantId,
    isActive: true,
    role: { $in: [ROLES.OWNER, ROLES.MANAGER] },
  })
    .select('name role')
    .sort({ name: 1 })
    .lean();
  return sendSuccess(
    res,
    approvers.map((user) => ({ id: String(user._id), name: user.name, role: user.role })),
  );
}
