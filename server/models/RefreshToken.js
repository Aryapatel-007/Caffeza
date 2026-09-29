/**
 * One document per active session. This is what makes logout real.
 *
 * Only the SHA-256 hash of a refresh token is stored. The raw value exists in
 * one response body, once, and is never recoverable from the database. A
 * dump of this collection gives an attacker nothing to log in with.
 */
import mongoose from 'mongoose';

import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

/** The reasons a session ends. Anything outside this list is a bug. */
export const REVOKE_REASONS = Object.freeze({
  LOGOUT: 'LOGOUT',
  LOGOUT_ALL: 'LOGOUT_ALL',
  ROTATED: 'ROTATED',
  REUSE_DETECTED: 'REUSE_DETECTED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
});

const REVOKE_REASON_VALUES = Object.freeze(Object.values(REVOKE_REASONS));

/** 255 characters is plenty. A user agent string is a hint, not evidence. */
const MAX_USER_AGENT_LENGTH = 255;

const refreshTokenSchema = new mongoose.Schema({
  /** TODO(M0-C): add `ref: 'User'` if a session list ever needs to populate. */
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

  /** SHA-256 of the raw token, hex. The raw token is never stored. */
  tokenHash: { type: String, required: true },

  /** 30 days from issue. */
  expiresAt: { type: Date, required: true },

  /** Null while the session is active. */
  revokedAt: { type: Date, default: null },

  revokedReason: { type: String, enum: [...REVOKE_REASON_VALUES, null], default: null },

  /**
   * Set on rotation, pointing at the token that replaced this one.
   *
   * This is the chain reuse detection walks. If a revoked token is presented,
   * someone is replaying an old link in the chain.
   */
  replacedByTokenHash: { type: String, default: null },

  userAgent: { type: String, default: null, maxlength: MAX_USER_AGENT_LENGTH },

  /** Kept for session review. Never written to a log line. */
  ipAddress: { type: String, default: null },
});

refreshTokenSchema.plugin(baseSchemaPlugin);
refreshTokenSchema.plugin(tenantGuardPlugin);

/**
 * Deliberately does NOT lead with restaurantId.
 *
 * At refresh time the token is the only thing the server has. There is no
 * access token, so there is no tenant context yet, and the lookup has to be by
 * hash alone. The tenant is read off the document that comes back. Do not
 * "fix" this to match the convention. See services/tokenService.js, which is
 * the only place that performs this lookup.
 */
refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });

/** Listing and bulk-revoking one user sessions. */
refreshTokenSchema.index({ restaurantId: 1, userId: 1, revokedAt: 1 });

/**
 * TTL index. Mongo deletes a document once expiresAt passes.
 *
 * This looks like a violation of the no-hard-delete rule in CLAUDE.md. It is
 * not. That rule covers a bill, an order and a stock entry, all of which are
 * financial records with audit value. A refresh token is session state, it has
 * no audit value once expired, and keeping every session row forever grows
 * without bound for no benefit.
 *
 * Revoked-but-unexpired tokens are NOT removed. They stay until their natural
 * expiry, which is precisely what makes reuse detection work: a replayed token
 * still has a row to be caught by.
 *
 * Do not remove this index believing you are enforcing the rule.
 */
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

export default RefreshToken;
