/**
 * Password hashing.
 *
 * bcrypt, with the cost factor from config so it can be raised as hardware
 * gets faster without touching code.
 */
import bcrypt from 'bcrypt';

import { config } from '../config/env.js';

/**
 * bcrypt only reads the first 72 bytes of a password. A longer one is not
 * rejected, it is silently truncated, which is fine but worth knowing before
 * someone assumes 128 characters of entropy are all doing work.
 */
export const BCRYPT_MAX_EFFECTIVE_BYTES = 72;

export function hash(plain) {
  return bcrypt.hash(plain, config.BCRYPT_ROUNDS);
}

export function compare(plain, passwordHash) {
  // A missing hash must still cost a comparison, never an early false.
  if (typeof passwordHash !== 'string' || passwordHash.length === 0) {
    return compare(plain, DUMMY_HASH);
  }
  return bcrypt.compare(plain, passwordHash);
}

/**
 * A real bcrypt hash of a constant nobody can log in with.
 *
 * Login compares against this when the phone number is not found, so a missing
 * account and a wrong password take the same amount of time. Without it, the
 * "not found" path returns in about a millisecond and the "wrong password"
 * path takes the full bcrypt cost, and the difference lets an attacker
 * enumerate which phone numbers are registered on the platform.
 *
 * Generated once at boot at the configured cost, so it always matches the cost
 * of a real comparison. Hardcoding a hash from a different cost factor would
 * reintroduce exactly the timing gap this exists to close.
 *
 * The plaintext is random per process and thrown away. Nothing can match it.
 */
export const DUMMY_HASH = bcrypt.hashSync(
  `dummy:${Math.random().toString(36)}:${Date.now()}`,
  config.BCRYPT_ROUNDS,
);
