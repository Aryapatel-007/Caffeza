/**
 * Rate limiting. Step 1 of the middleware chain.
 *
 * Two limiters. The general one protects the API from a runaway client. The
 * strict one protects login, because a shared restaurant tablet sitting on the
 * counter is a soft target for someone trying PINs one after another.
 *
 * Every limiter skips entirely when NODE_ENV is 'test'. See skipInTest below.
 */
import { createHash } from 'node:crypto';

import rateLimit from 'express-rate-limit';

import { config } from '../config/env.js';
import { readRefreshCookie } from '../utils/authCookie.js';
import { RateLimitError } from '../utils/errors.js';
import { normalisePhoneIndia } from '../validators/common.js';

const MINUTE_MS = 60_000;

/**
 * General API limits.
 *
 * These are constants rather than environment variables because .env.example
 * only carries the login limits, and adding a variable means telling the other
 * developer in the same commit. If these ever need to differ per environment,
 * promote them to .env.example and config together.
 *
 * Two limits, 8 October 2026. The per-address one used to be 600 in 15
 * minutes, and every device in a cafe shares one address: the floor, kitchen
 * and dashboard polls alone came to about 555 at Caffeza's staff numbers,
 * before anyone tapped anything, and the 600th request locked out every
 * device in the building. The address ceiling is now a backstop against a
 * flood, sized for a busy floor with headroom. The per-user limit, applied by
 * `authenticate` once it knows who is asking, is what bounds one runaway
 * session: a phone polling the floor every 15 seconds uses 60 of it.
 */
const GENERAL_WINDOW_MINUTES = 15;
const GENERAL_MAX_REQUESTS = 5000;
const USER_WINDOW_MINUTES = 15;
const USER_MAX_REQUESTS = 1000;

/**
 * P23. The public page has its own limiters, in publicRoutes.js. A guest on a
 * mobile network shares an address with strangers, and must never use up the
 * cafe's own budget, nor the cafe a guest's.
 */
const PUBLIC_PATH = /^\/public(\/|$)/;

/**
 * Session refreshes, 2 October 2026. A refresh is not a sign-in: it is every
 * device restoring its session on a page load. Only a refresh that carries a
 * cookie the server refuses is counted, per address, against this ceiling.
 * Every device in a cafe shares one address, so this sits well above a busy
 * floor's reloads, and a 64-byte random token is not guessable at this rate.
 */
const REFRESH_WINDOW_MINUTES = 15;
const REFRESH_MAX_FAILURES = 300;

/**
 * Collapses an IPv6 address to its /64 prefix.
 *
 * A single machine is routinely handed a whole /64, so keying on the full
 * address means an attacker gets a fresh bucket per request. IPv4 is used
 * as-is.
 */
function normaliseIp(ip) {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  return `${ip.split(':').slice(0, 4).join(':')}::/64`;
}

/** One hop through our own error handler, so a 429 uses the standard envelope. */
function limitReached(req, res, next) {
  next(new RateLimitError());
}

/**
 * Skips both limiters in the test environment, and nowhere else.
 *
 * A test file drives a real server through hundreds of requests in a tight
 * loop, which a limiter tuned for a restaurant's own traffic patterns has no
 * way to tell apart from abuse. Without this a growing test file eventually
 * has to be restructured around a request budget rather than around what is
 * clearest to read, which is what happened once already in orders.test.js.
 * Development and production still enforce both limits exactly as configured.
 */
const skipInTest = () => config.isTest;

export const generalLimiter = rateLimit({
  windowMs: GENERAL_WINDOW_MINUTES * MINUTE_MS,
  limit: GENERAL_MAX_REQUESTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => normaliseIp(req.ip),
  // Mounted on the API prefix only, so req.path is relative to it. Static
  // files, the built client, are never counted.
  skip: (req) => skipInTest() || PUBLIC_PATH.test(req.path),
  handler: limitReached,
});

/**
 * Per signed-in user. Called by `authenticate` after the token is verified,
 * so the key is a user id we issued, never a value the client chose.
 */
export const userLimiter = rateLimit({
  windowMs: USER_WINDOW_MINUTES * MINUTE_MS,
  limit: USER_MAX_REQUESTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `user|${req.user.id}`,
  skip: skipInTest,
  handler: limitReached,
});

/**
 * Login limiter. Keyed on the IP and the identifier being tried, together.
 *
 * Keying on IP alone lets one attacker lock out a whole restaurant from behind
 * their own router. Keying on the identifier alone lets a botnet do the same
 * from anywhere. Both together limits the thing we actually care about, which is
 * guesses against one account from one place.
 *
 * The identifier is the submitted phone or, if that is absent, the submitted
 * email. The key is hashed. The store keeps a digest, never a phone number or
 * an address, and neither is written to a log line in any form.
 */
/**
 * Refresh limiter. Kept apart from the login limiter on 2 October 2026: they
 * shared one, and a refresh with no cookie, which every sign-in screen sends,
 * failed and counted as a failed sign-in for the whole address. Ten of those
 * in fifteen minutes and every device in the cafe was refused its refresh and
 * signed out on its next reload. A request with no refresh cookie at all is a
 * person who is not signed in, not a guess, and is never counted.
 */
export const refreshLimiter = rateLimit({
  windowMs: REFRESH_WINDOW_MINUTES * MINUTE_MS,
  limit: REFRESH_MAX_FAILURES,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: (req) => skipInTest() || !readRefreshCookie(req),
  keyGenerator: (req) => createHash('sha256').update(`refresh|${normaliseIp(req.ip)}`).digest('hex'),
  handler: limitReached,
});

export const authLimiter = rateLimit({
  windowMs: config.LOGIN_RATE_LIMIT_WINDOW_MINUTES * MINUTE_MS,
  limit: config.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Failed attempts are what we are counting. A successful login should not
  // eat into the allowance of the next person on a shared tablet.
  skipSuccessfulRequests: true,
  skip: skipInTest,
  keyGenerator(req) {
    // Phone is normalised first, so reformatting the same number does not look
    // like a different account and win a fresh set of attempts.
    const phone = normalisePhoneIndia(req.body?.phone);
    const email =
      typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const identifier = (typeof phone === 'string' && phone) || email || '';
    return createHash('sha256').update(`${normaliseIp(req.ip)}|${identifier}`).digest('hex');
  },
  handler: limitReached,
});

/* ------------------------------------------------------------------------- *
 * The public page. P23 (M14), API-CONTRACT M14 section 1.
 *
 * Kept apart from the general limiter in both directions: guests never use up
 * the cafe's own budget, and the cafe never uses up the guests'.
 * ------------------------------------------------------------------------- */

const PUBLIC_READ_WINDOW_MINUTES = 5;
const PUBLIC_READ_MAX = 300;
const PUBLIC_WRITE_WINDOW_MINUTES = 15;
const PUBLIC_WRITE_MAX = 6;

/** Reads: the menu, the slots, a guest's status page polling. Per address. */
export const publicReadLimiter = rateLimit({
  windowMs: PUBLIC_READ_WINDOW_MINUTES * MINUTE_MS,
  limit: PUBLIC_READ_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `public-read|${normaliseIp(req.ip)}`,
  skip: skipInTest,
  handler: limitReached,
});

/** Placing an order or a booking, and cancelling one. Per address. */
export const publicWriteLimiter = rateLimit({
  windowMs: PUBLIC_WRITE_WINDOW_MINUTES * MINUTE_MS,
  limit: PUBLIC_WRITE_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `public-write|${normaliseIp(req.ip)}`,
  skip: skipInTest,
  handler: limitReached,
});

/**
 * Placing, per phone number, across addresses: someone switching networks
 * to flood one cafe with one number still runs out. Hashed, like the login
 * key, so the store never holds a phone number.
 */
export const publicPhoneLimiter = rateLimit({
  windowMs: PUBLIC_WRITE_WINDOW_MINUTES * MINUTE_MS,
  limit: PUBLIC_WRITE_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator(req) {
    const phone = normalisePhoneIndia(req.body?.customerPhone ?? req.body?.guestPhone);
    return createHash('sha256').update(`public-phone|${typeof phone === 'string' ? phone : ''}`).digest('hex');
  },
  skip: skipInTest,
  handler: limitReached,
});

/**
 * P25 Part G. A partner's webhook, per webhook key: 120 a minute. The key is
 * hashed, like the login key, so the store never holds one.
 */
export const webhookLimiter = rateLimit({
  windowMs: MINUTE_MS,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => createHash('sha256').update(`webhook|${req.params?.webhookKey ?? ''}`).digest('hex'),
  skip: skipInTest,
  handler: limitReached,
});
