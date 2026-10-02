/**
 * Rate limiting. Step 1 of the middleware chain.
 *
 * Two limiters. The general one protects the API from a runaway client. The
 * strict one protects login, because a shared restaurant tablet sitting on the
 * counter is a soft target for someone trying PINs one after another.
 *
 * Both skip entirely when NODE_ENV is 'test'. See skipInTest below.
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
 * 600 in 15 minutes is generous. A busy tablet during a Friday rush polls
 * orders and fires KOTs, and a limiter that trips during service is worse than
 * no limiter at all.
 */
const GENERAL_WINDOW_MINUTES = 15;
const GENERAL_MAX_REQUESTS = 600;

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
