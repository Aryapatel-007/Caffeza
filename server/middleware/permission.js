/**
 * Permission. Step 4 of the middleware chain.
 *
 * Hiding a button in React is a hint. This is the part that actually stops the
 * action.
 *
 *   router.post(
 *     "/bills/:billId/void",
 *     authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER),
 *     validate(voidBillSchema), voidBill,
 *   );
 */
import { isValidRole, ROLE_VALUES } from '../config/roles.js';
import { ForbiddenError, UnauthenticatedError } from '../utils/errors.js';

/**
 * Builds a middleware that allows only the listed roles.
 *
 * The role names are checked when the route is defined, not when it is called.
 * A misspelled role would otherwise lock everybody out of one endpoint
 * quietly, and nobody would find out until a manager complained on a Saturday.
 * It crashes at boot instead.
 */
export function requireRole(...allowedRoles) {
  if (allowedRoles.length === 0) {
    throw new Error('requireRole() needs at least one role. A route that allows nobody is a bug.');
  }

  const unknown = allowedRoles.filter((role) => !isValidRole(role));
  if (unknown.length > 0) {
    throw new Error(
      `requireRole() got role names that do not exist: ${unknown.join(', ')}. Valid roles are: ${ROLE_VALUES.join(', ')}.`,
    );
  }

  const allowed = new Set(allowedRoles);

  return function checkRole(req, res, next) {
    if (!req.user) {
      // Wrong middleware order. Fail closed rather than guessing.
      return next(new UnauthenticatedError('Sign in to continue.'));
    }

    // An unrecognised role value is failure, never success. A user record
    // carrying a role we do not know about is a user who can do nothing.
    if (!isValidRole(req.user.role) || !allowed.has(req.user.role)) {
      return next(new ForbiddenError());
    }

    return next();
  };
}
