/**
 * P34. Setting a new password from the sign-in screen, approved by an owner or
 * manager typing their own phone and PIN. API-CONTRACT 1.7.
 *
 * Every refusal is the same 401 with the same words, and every path before the
 * new password is hashed costs one bcrypt comparison, so the screen never says
 * which phone exists, who works where, or which part was wrong.
 */
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { REVOKE_REASONS } from '../models/RefreshToken.js';
import { ForbiddenError, InvalidCredentialsError, InvalidPinError, PinLockedError } from '../utils/errors.js';
import { recordAudit } from './auditService.js';
import { findPasswordResetPair, setPassword, verifyPin } from './authService.js';
import { compare, DUMMY_HASH } from './passwordService.js';
import { revokeAllForUser } from './tokenService.js';
import { assertCanResetPassword } from './userPermissionService.js';

export const RESET_REFUSED =
  'The password was not changed. Check both phone numbers and the PIN. Five wrong PINs lock it until the owner sets it again.';

export const RESET_SOURCE = 'SIGN_IN_SCREEN';

/** The person and approver may stand together, the approver may approve this person, and is not them. */
function mayApprove(pair) {
  if (!pair) return false;
  const { user, approver } = pair;
  // A PIN must never be the way into its own owner's account: it is shorter
  // than a password and typed on shared screens.
  if (String(approver._id) === String(user._id)) return false;
  try {
    assertCanResetPassword({ id: String(approver._id), role: approver.role }, user);
  } catch (error) {
    if (error instanceof ForbiddenError) return false;
    throw error;
  }
  return true;
}

export async function resetPasswordFromSignIn(req, { phone, email, newPassword, approval }) {
  const pair = await findPasswordResetPair({ phone, email }, approval.approverPhone);

  if (!mayApprove(pair)) {
    // The same cost as a PIN check, so a missing person or approver cannot be timed.
    await compare(approval.pin, DUMMY_HASH);
    throw new InvalidCredentialsError(RESET_REFUSED);
  }

  const { user, approver } = pair;
  try {
    await verifyPin({ restaurantId: user.restaurantId, branchId: approver.branchId, userId: approver._id }, approval.pin);
  } catch (error) {
    if (error instanceof InvalidPinError || error instanceof PinLockedError) throw new InvalidCredentialsError(RESET_REFUSED);
    throw error;
  }

  // Stamps passwordChangedAt, which ends the person's outstanding access tokens.
  await setPassword(user, newPassword);
  const sessionsRevoked = await revokeAllForUser(
    { restaurantId: user.restaurantId, userId: user._id },
    REVOKE_REASONS.PASSWORD_CHANGED,
  );

  // The approver is the actor: they are who let it happen.
  const scope = {
    restaurantId: user.restaurantId,
    branchId: user.branchId,
    user: { id: approver._id, role: approver.role },
  };
  await recordAudit(scope, {
    action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
    entityType: AUDIT_ENTITY_TYPES.USER,
    entityId: user._id,
    reason: 'Password set from the sign-in screen, approved by PIN.',
    details: { role: user.role, source: RESET_SOURCE },
  });

  req.log?.info(
    { restaurantId: String(user.restaurantId), targetUserId: String(user._id), approverId: String(approver._id), sessionsRevoked },
    'Password set from the sign-in screen. Sessions revoked.',
  );

  return { passwordSet: true };
}

export default { resetPasswordFromSignIn };
