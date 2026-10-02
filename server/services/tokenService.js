/**
 * Access and refresh tokens.
 *
 * Access token: a short-lived JWT, stateless, cannot be revoked.
 * Refresh token: an opaque random string, stored hashed, revocable, rotating.
 *
 * This file is the only place that reads the refreshtokens collection.
 */
import { createHash, randomBytes } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { RefreshToken, REVOKE_REASONS } from '../models/RefreshToken.js';
import { InvalidRefreshTokenError } from '../utils/errors.js';

/** 64 bytes, per the token model in docs/API-CONTRACT.md. */
const REFRESH_TOKEN_BYTES = 64;

const MAX_USER_AGENT_LENGTH = 255;

const DURATION_UNITS_MS = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  y: 31_536_000_000,
};

/**
 * Parses the duration format config already validated, so this cannot be
 * handed something malformed. A bare number means seconds, matching
 * jsonwebtoken.
 */
function durationToMs(value) {
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w|y)?$/i.exec(String(value).trim());
  if (!match) throw new Error(`Cannot read "${value}" as a duration.`);
  const [, amount, unit] = match;
  return Number(amount) * DURATION_UNITS_MS[(unit ?? 's').toLowerCase()];
}

/** SHA-256, hex. The raw token is never stored, only this. */
export function hashRefreshToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * The refresh token lifetime in milliseconds.
 *
 * The cookie's Max-Age has to match the stored token's `expiresAt`, and both
 * come from `config.REFRESH_TOKEN_TTL`. Exposed so utils/authCookie.js reads it
 * from the same parse rather than duplicating the duration string.
 */
export function refreshTokenTtlMs() {
  return durationToMs(config.REFRESH_TOKEN_TTL);
}

/**
 * Signs an access token.
 *
 * The payload is locked by docs/API-CONTRACT.md and changing it means touching
 * the tenant middleware. Four claims and no more. Do not add the name, the
 * phone or the email: a JWT is base64, not encryption, and anyone holding the
 * token can read every claim in it.
 */
export function issueAccessToken(user) {
  return jwt.sign(
    {
      role: user.role,
      restaurantId: String(user.restaurantId),
      branchId: String(user.branchId),
    },
    config.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS256',
      subject: String(user._id ?? user.id),
      expiresIn: config.ACCESS_TOKEN_TTL,
    },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
}

/**
 * The lifetime the client is told about, in seconds.
 *
 * Read back off a token we just signed rather than parsing the config string
 * again, so the number in the response can never drift from the number in the
 * token.
 */
export function accessTokenLifetimeSeconds(accessToken) {
  const { iat, exp } = jwt.decode(accessToken);
  return exp - iat;
}

/**
 * Issues a refresh token and stores its hash.
 *
 * The raw value is returned here once and is never recoverable afterwards.
 */
export async function issueRefreshToken(user, { userAgent, ipAddress } = {}) {
  const rawToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');

  await RefreshToken.create({
    restaurantId: user.restaurantId,
    branchId: user.branchId,
    userId: user._id ?? user.id,
    tokenHash: hashRefreshToken(rawToken),
    expiresAt: new Date(Date.now() + durationToMs(config.REFRESH_TOKEN_TTL)),
    userAgent: userAgent ? String(userAgent).slice(0, MAX_USER_AGENT_LENGTH) : null,
    ipAddress: ipAddress ?? null,
  });

  return rawToken;
}

/**
 * Finds a stored token by its hash.
 *
 * At refresh time there is no access token, so there is no tenant context and
 * no restaurantId to filter on. The token hash is the only thing the server
 * has. The tenant is then read off the document that comes back, and every
 * query after this point is scoped by it.
 *
 * This is one of exactly two uses of the escape hatch in the whole server.
 */
function findByTokenHash(tokenHash) {
  // Genuinely tenant-less: the refresh lookup happens before any tenant is
  // known, which is why docs/DB-SCHEMA.md gives tokenHash its own unique index.
  return RefreshToken.findOne({ tokenHash }).setOptions({ skipTenantGuard: true });
}

/**
 * Revokes every active session for one user.
 *
 * Takes restaurantId as well as userId because the tenant guard requires it,
 * and because a bulk revoke that could reach across restaurants is exactly the
 * shape of query the guard exists to prevent.
 */
export async function revokeAllForUser({ restaurantId, userId }, reason) {
  const result = await RefreshToken.updateMany(
    { restaurantId, userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
  return result.modifiedCount ?? 0;
}

/** Revokes one session. Used by logout, which must never fail loudly. */
export async function revokeOne(rawToken, reason) {
  const stored = await findByTokenHash(hashRefreshToken(rawToken));
  if (!stored || stored.revokedAt) return false;

  stored.revokedAt = new Date();
  stored.revokedReason = reason;
  await stored.save();
  return true;
}

/**
 * How long after a rotation the old token may still be presented once, as a
 * lost reply rather than theft. A constant, like the other auth limits.
 */
export const ROTATION_GRACE_MS = 30_000;

/**
 * True when a revoked token was revoked by rotation moments ago and the token
 * that replaced it has never been used. That is a refresh whose reply was lost,
 * not a replay: a thief who had the old token would be racing a replacement the
 * real browser never received, inside thirty seconds, and gets one session that
 * the next real refresh then shows up.
 */
async function isLostReply(stored) {
  if (stored.revokedReason !== REVOKE_REASONS.ROTATED || !stored.replacedByTokenHash) return false;
  if (Date.now() - stored.revokedAt.getTime() > ROTATION_GRACE_MS) return false;
  const replacement = await findByTokenHash(stored.replacedByTokenHash);
  return Boolean(replacement && !replacement.revokedAt);
}

/**
 * Rotates a refresh token, and catches replay while doing it.
 *
 * Every successful refresh issues a new token and revokes the old one, so a
 * token is valid exactly once. That is what makes the check below possible: if
 * an already-revoked token turns up, either it was stolen and the thief got
 * there second, or it was stolen and the real user got there second. There is
 * no way to tell which, so both sessions end.
 *
 * Throws InvalidRefreshTokenError for unknown, expired and revoked alike. One
 * error for all three, because "expired" would confirm the token was real.
 */
export async function rotateRefreshToken(rawToken, context = {}) {
  const stored = await findByTokenHash(hashRefreshToken(rawToken));

  if (!stored) throw new InvalidRefreshTokenError();

  if (stored.revokedAt && (await isLostReply(stored))) {
    /**
     * The reply to the refresh that rotated this token never reached the
     * browser: the page was reloaded or navigated while it was in flight, so
     * the browser still holds the old cookie. Not theft: the new token it was
     * replaced by has not been used. That unused replacement is retired and a
     * fresh token issued, so the person stays signed in. Added 2 October 2026
     * after a reload mid-refresh signed a captain out of every device.
     */
    const orphan = await findByTokenHash(stored.replacedByTokenHash);
    orphan.revokedAt = new Date();
    orphan.revokedReason = REVOKE_REASONS.ROTATED;
    const nextRawToken = await issueRefreshToken(
      { _id: stored.userId, restaurantId: stored.restaurantId, branchId: stored.branchId },
      context,
    );
    // The orphan was never delivered, so it points at nothing: presenting it
    // later is theft, never another lost reply.
    orphan.replacedByTokenHash = null;
    await orphan.save();
    return { refreshToken: nextRawToken, stored };
  }

  if (stored.revokedAt) {
    // Replay. End every session this user has, not just this one.
    const revokedCount = await revokeAllForUser(
      { restaurantId: stored.restaurantId, userId: stored.userId },
      REVOKE_REASONS.REUSE_DETECTED,
    );

    logger.warn(
      {
        userId: String(stored.userId),
        restaurantId: String(stored.restaurantId),
        revokedReason: stored.revokedReason,
        sessionsRevoked: revokedCount,
      },
      'Refresh token reuse detected. Every session for this user has been revoked.',
    );

    throw new InvalidRefreshTokenError();
  }

  if (stored.expiresAt.getTime() <= Date.now()) throw new InvalidRefreshTokenError();

  const user = {
    _id: stored.userId,
    restaurantId: stored.restaurantId,
    branchId: stored.branchId,
  };

  const nextRawToken = await issueRefreshToken(user, context);

  stored.revokedAt = new Date();
  stored.revokedReason = REVOKE_REASONS.ROTATED;
  stored.replacedByTokenHash = hashRefreshToken(nextRawToken);
  await stored.save();

  return { refreshToken: nextRawToken, stored };
}
