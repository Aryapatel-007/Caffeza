/**
 * Authentication. Step 2 of the middleware chain.
 *
 * Reads the Bearer token, verifies it, loads the user, and attaches req.user.
 * It does not decide what the user is allowed to do. That is the permission
 * middleware.
 *
 * M0-B added the database read. Part A could only inspect the token, because
 * the User model did not exist yet.
 */
import { isValidRole } from '../config/roles.js';
import { Restaurant } from '../models/Restaurant.js';
import { User } from '../models/User.js';
import { userLimiter } from './rateLimit.js';
import { verifyAccessToken } from '../services/tokenService.js';
import { TokenExpiredError, UnauthenticatedError } from '../utils/errors.js';

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

/**
 * The access token payload, locked by docs/API-CONTRACT.md.
 *
 *   sub           the user id
 *   role          one of the six roles
 *   restaurantId  the tenant
 *   branchId      the outlet
 */
export function readClaims(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const claims = {
    id: typeof payload.sub === 'string' ? payload.sub : null,
    role: payload.role,
    restaurantId: typeof payload.restaurantId === 'string' ? payload.restaurantId : null,
    branchId: typeof payload.branchId === 'string' ? payload.branchId : null,
    issuedAtSeconds: typeof payload.iat === 'number' ? payload.iat : null,
  };

  // A token we signed but cannot read is not a token we trust. Fail closed.
  if (!claims.id || !claims.restaurantId || !claims.branchId) return null;
  if (!isValidRole(claims.role)) return null;
  if (claims.issuedAtSeconds === null) return null;

  return claims;
}

/**
 * Was this token issued before the user last changed their password?
 *
 * A refresh token can be revoked because it lives in the database. An access
 * token cannot: it is stateless and good for 15 minutes. This closes that
 * window, so a token stolen at 10:00 stops working the moment the user changes
 * their password at 10:01 because of that theft.
 *
 * A JWT `iat` only has one second of resolution, so a token issued at
 * 10:00:00.200 and a password changed at 10:00:00.900 are indistinguishable.
 * The comparison is therefore <= rather than <, which rejects everything
 * issued during the same second as the change.
 *
 * That is the fail-closed direction. Being strict costs a user who signs in
 * again within the same second one retry, which no human does because typing a
 * password takes longer than that. Being lenient would leave a real, if
 * narrow, hole in exactly the mechanism this exists to provide.
 */
export function issuedBeforePasswordChange(issuedAtSeconds, passwordChangedAt) {
  if (!passwordChangedAt) return false;
  return issuedAtSeconds <= Math.floor(passwordChangedAt.getTime() / 1000);
}

export async function authenticate(req, res, next) {
  const header = req.get('authorization');
  const match = typeof header === 'string' ? BEARER_PATTERN.exec(header.trim()) : null;

  if (!match) {
    return next(new UnauthenticatedError('Sign in to continue.'));
  }

  let payload;
  try {
    payload = verifyAccessToken(match[1]);
  } catch (error) {
    // A separate code, not just a separate message. The client needs to tell
    // "refresh and retry" apart from "send the user back to the login screen".
    if (error?.name === 'TokenExpiredError') {
      return next(new TokenExpiredError());
    }
    return next(new UnauthenticatedError('Your session is not valid. Please sign in again.'));
  }

  const claims = readClaims(payload);
  if (!claims) {
    return next(new UnauthenticatedError('Your session is not valid. Please sign in again.'));
  }

  /**
   * Two database reads on every authenticated request, deliberately uncached.
   *
   * A stale permission cache is a security bug waiting to happen, and at this
   * scale there is no performance problem to justify one. Do not add a cache
   * here without a measurement that says it is needed.
   *
   * The user is scoped by the restaurantId in the token, so the tenant guard
   * is satisfied and a token cannot reach a user in another restaurant. The
   * restaurant is legitimate unguarded query pattern 1: a lookup by _id from a
   * verified token.
   *
   * P31. The two reads do not depend on each other, so they run together: with
   * the server in Singapore and the database in Mumbai, one after the other was
   * two round trips on the front of every request. The checks below still run
   * in the same order as before, the user first.
   *
   * The restaurant stays fully loaded, `settings` and all, although only
   * `isActive` is checked here. `settingsService.getSettings` reads
   * `req.currentRestaurant` and checks only that its `_id` matches, so a
   * document trimmed of `settings` would hand every caller schema defaults (the
   * wrong tax rate, business day and invoice series) with nothing failing. To
   * trim it, `getSettings` must first check for the settings themselves. The
   * heavy fields, logo bytes and sealed secrets, are already `select: false`.
   */
  const [user, restaurant] = await Promise.all([
    User.findOne({ _id: claims.id, restaurantId: claims.restaurantId }),
    Restaurant.findById(claims.restaurantId),
  ]);

  if (!user || user.isActive === false) {
    return next(new UnauthenticatedError('Your session is not valid. Please sign in again.'));
  }

  if (issuedBeforePasswordChange(claims.issuedAtSeconds, user.passwordChangedAt)) {
    // Expired rather than unauthenticated: the client should try refreshing.
    // The refresh token was revoked by the password change, so that attempt
    // fails too and the user lands on the login screen, which is correct.
    return next(new TokenExpiredError('Your password changed. Please sign in again.'));
  }

  if (!restaurant || restaurant.isActive === false) {
    return next(new UnauthenticatedError('Your session is not valid. Please sign in again.'));
  }

  req.user = Object.freeze({
    id: String(user._id),
    // The role comes from the database, not the token. We have already paid
    // for the read, and a token issued before a demotion should not keep the
    // old permissions for the rest of its 15 minutes.
    role: user.role,
    restaurantId: claims.restaurantId,
    branchId: claims.branchId,
  });

  // Handed on so /auth/me and PATCH /restaurant do not read the same two
  // documents a second time in the same request.
  req.currentUser = user;
  req.currentRestaurant = restaurant;

  // The per-user limit, now that we know who is asking. See rateLimit.js.
  return userLimiter(req, res, next);
}
