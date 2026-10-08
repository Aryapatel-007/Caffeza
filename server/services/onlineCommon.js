/**
 * What online takeaway and bookings share. P23 (M14).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { CURRENT_CONSENT_VERSION } from '../config/consentText.js';
import { User } from '../models/User.js';
import { NotFoundError } from '../utils/errors.js';
import { scoped } from '../utils/scopedQuery.js';
import { nextNumber } from './counterService.js';
import { getSettings } from './settingsService.js';

/**
 * A status token for the guest's page: 32 random bytes, sent once, stored only
 * as a SHA-256. A leaked database never hands anyone a working token.
 */
export function makeStatusToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/** Compares in constant time. A missing or malformed token is simply false. */
export function tokenMatches(storedHash, presented) {
  if (!storedHash || typeof presented !== 'string' || presented.length === 0 || presented.length > 200) return false;
  const a = Buffer.from(storedHash, 'hex');
  const b = Buffer.from(hashToken(presented), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The header a guest's page sends its token in. Never a query string, which lands in logs. */
export const STATUS_TOKEN_HEADER = 'x-status-token';

/** 404, the same as an unknown id, for a missing or wrong token. */
export function assertGuestToken(doc, req) {
  if (!doc || !tokenMatches(doc.statusTokenHash, req.get(STATUS_TOKEN_HEADER))) {
    throw new NotFoundError('Not found.');
  }
}

export async function nextReference(req, counterName, prefix) {
  const number = await nextNumber({ restaurantId: req.restaurantId, branchId: req.branchId, name: counterName });
  return `${prefix}-${number}`;
}

export function consentRecord(given, at) {
  return given
    ? { given: true, textVersion: CURRENT_CONSENT_VERSION, at }
    : { given: false, textVersion: null, at: null };
}

/** The settings M14 reads, in one call. */
export async function onlineSettings(req) {
  const settings = await getSettings(req.restaurantId, { req });
  return {
    online: settings.online,
    dayStartMinutes: settings.business.businessDayStartsAtMinutes,
    featureOn: settings.features.online,
  };
}

/** Staff names for `decidedBy` and friends, read once per list. Labels only. */
export async function namesFor(req, ids) {
  const wanted = [...new Set(ids.filter(Boolean).map(String))];
  if (wanted.length === 0) return new Map();
  const users = await User.find({ ...scoped(req), _id: { $in: wanted } }).select('name');
  return new Map(users.map((user) => [String(user._id), user.name]));
}

/** The pause, as the page and the inbox show it: null once it has passed. */
export function activePause(branch, now) {
  const until = branch?.online?.pausedUntil;
  return until && until > now ? until : null;
}
