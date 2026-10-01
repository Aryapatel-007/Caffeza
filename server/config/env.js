/**
 * Environment configuration.
 *
 * This is the ONLY file in the server that is allowed to read the raw
 * environment. Everything else imports the frozen `config` object from here.
 * Run this to prove it:
 *
 *   grep -rn "process.env" server/ --exclude-dir=node_modules
 *
 * Every variable listed in .env.example is validated below. If anything is
 * missing or malformed the server prints exactly what is wrong and exits.
 * We fail loudly at boot, not quietly at 9pm on a Saturday.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { z } from 'zod';

import { parseTrustProxy } from './trustProxy.js';

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CONFIG_DIR, '..', '..');
const ENV_FILE = path.join(REPO_ROOT, '.env');

// dotenv never overwrites a variable that is already set, so a real deployment
// can inject values without a file on disk.
dotenv.config({ path: ENV_FILE });

const MIN_SECRET_LENGTH = 32;

const missingMessage = (name) =>
  `${name} is missing or empty. Add it to .env — copy .env.example and fill it in.`;

/** A variable that must be present and non-empty. */
function requiredVar(name) {
  return z.preprocess(
    (value) => (value === undefined || value === null ? '' : String(value).trim()),
    z.string().min(1, missingMessage(name)),
  );
}

/** A variable that falls back to a documented default when absent. */
function optionalVar(name, fallback) {
  return z.preprocess((value) => {
    const text = value === undefined || value === null ? '' : String(value).trim();
    return text === '' ? fallback : text;
  }, z.string().min(1, missingMessage(name)));
}

/**
 * Wraps a check so it only runs on a value that is actually present. Without
 * this, one missing variable reports both "is missing" and "is malformed".
 */
const whenPresent = (predicate) => (value) => value.length === 0 || predicate(value);

/**
 * A whole number within bounds. All the checking happens in one refinement so
 * a bad value produces one clear sentence instead of three overlapping ones.
 */
function intVar(name, { min, max, fallback } = {}) {
  const base = fallback === undefined ? requiredVar(name) : optionalVar(name, String(fallback));
  const bounds = [];
  if (min !== undefined) bounds.push(`at least ${min}`);
  if (max !== undefined) bounds.push(`at most ${max}`);
  const rule = `${name} must be a whole number${bounds.length > 0 ? `, ${bounds.join(' and ')}` : ''}.`;

  return base
    .refine((text) => {
      if (!/^\d+$/.test(text)) return false;
      const parsed = Number(text);
      if (!Number.isSafeInteger(parsed)) return false;
      if (min !== undefined && parsed < min) return false;
      if (max !== undefined && parsed > max) return false;
      return true;
    }, rule)
    .transform((text) => Number(text));
}

function enumVar(name, allowed, fallback) {
  return optionalVar(name, fallback).refine(
    (value) => allowed.includes(value),
    `${name} must be one of: ${allowed.join(', ')}.`,
  );
}

function secretVar(name) {
  return requiredVar(name)
    .refine(
      whenPresent((value) => !/replace_me/i.test(value)),
      `${name} is still the placeholder from .env.example. Generate a real one with: openssl rand -base64 48`,
    )
    .refine(
      whenPresent((value) => value.length >= MIN_SECRET_LENGTH),
      `${name} must be at least ${MIN_SECRET_LENGTH} characters long.`,
    );
}

// The duration format the `ms` package understands, which is what
// jsonwebtoken accepts for expiresIn. A bare number means seconds.
const DURATION_PATTERN = /^\d+(?:\.\d+)?\s*(?:ms|s|m|h|d|w|y)?$/i;

function durationVar(name, fallback) {
  return optionalVar(name, fallback).refine(
    whenPresent((value) => DURATION_PATTERN.test(value)),
    `${name} must be a duration like 15m, 24h, 30d, or a plain number of seconds.`,
  );
}

/** An origin is scheme + host + port. No path, no trailing slash — CORS compares it literally. */
function isHttpOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.origin === value;
  } catch {
    return false;
  }
}

/**
 * TRUST_PROXY, parsed by config/trustProxy.js.
 *
 * Not `optionalVar`: that replaces an absent value with its fallback, and
 * production has to tell "absent" apart from "set to false" (see the refine on
 * the schema below). So the raw text travels alongside the parsed value until
 * that check has run, and only the parsed value reaches `config`.
 */
const trustProxyVar = z
  .preprocess((value) => (value === undefined || value === null ? '' : String(value).trim()), z.string())
  .transform((raw, ctx) => {
    try {
      return { raw, value: parseTrustProxy(raw) };
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: error.message });
      return z.NEVER;
    }
  });

function isValidTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const envSchema = z
  .object({
    NODE_ENV: enumVar('NODE_ENV', ['development', 'test', 'production'], 'development'),
    PORT: intVar('PORT', { min: 1, max: 65535, fallback: 5000 }),

    MONGO_URI: requiredVar('MONGO_URI').refine(
      whenPresent((value) => /^mongodb([+]srv)?:[/][/].+/.test(value)),
      'MONGO_URI must start with mongodb:// or mongodb+srv://',
    ),

    JWT_ACCESS_SECRET: secretVar('JWT_ACCESS_SECRET'),
    JWT_REFRESH_SECRET: secretVar('JWT_REFRESH_SECRET'),
    ACCESS_TOKEN_TTL: durationVar('ACCESS_TOKEN_TTL', '15m'),
    REFRESH_TOKEN_TTL: durationVar('REFRESH_TOKEN_TTL', '30d'),
    BCRYPT_ROUNDS: intVar('BCRYPT_ROUNDS', { min: 10, max: 15, fallback: 12 }),

    CLIENT_ORIGIN: requiredVar('CLIENT_ORIGIN').refine(
      whenPresent(isHttpOrigin),
      'CLIENT_ORIGIN must be a bare origin with no trailing slash, for example http://localhost:5173',
    ),

    LOGIN_RATE_LIMIT_WINDOW_MINUTES: intVar('LOGIN_RATE_LIMIT_WINDOW_MINUTES', {
      min: 1,
      max: 1440,
      fallback: 15,
    }),
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS: intVar('LOGIN_RATE_LIMIT_MAX_ATTEMPTS', {
      min: 1,
      max: 1000,
      fallback: 10,
    }),

    DISPLAY_TIMEZONE: optionalVar('DISPLAY_TIMEZONE', 'Asia/Kolkata').refine(
      whenPresent(isValidTimeZone),
      'DISPLAY_TIMEZONE must be an IANA time zone name, for example Asia/Kolkata.',
    ),

    TRUST_PROXY: trustProxyVar,
  })
  .refine((values) => values.JWT_ACCESS_SECRET !== values.JWT_REFRESH_SECRET, {
    error: 'JWT_REFRESH_SECRET must be a different value from JWT_ACCESS_SECRET.',
    path: ['JWT_REFRESH_SECRET'],
  })
  // In development and test an absent TRUST_PROXY means false. In production
  // someone has to have decided, even if the decision is false.
  .refine((values) => values.NODE_ENV !== 'production' || values.TRUST_PROXY?.raw !== '', {
    error:
      'TRUST_PROXY must be set in production. Use 1 when the host puts one proxy in front of the ' +
      'server, or false when nothing sits in front of it.',
    path: ['TRUST_PROXY'],
  });

function reportAndExit(error) {
  const lines = new Set(
    error.issues.map((issue) => {
      const name = issue.path.length > 0 ? String(issue.path[0]) : 'environment';
      return `  - ${name}: ${issue.message}`;
    }),
  );

  // console, not the logger. The logger imports this file, and a half-configured
  // process should say what is wrong in the plainest way available.
  console.error('');
  console.error('The server cannot start. The environment is not configured correctly.');
  console.error(`Looked for a .env file at: ${ENV_FILE}`);
  console.error('');
  console.error(`Problems found (${lines.size}):`);
  for (const line of lines) console.error(line);
  console.error('');
  console.error('Fix these in .env and start again. .env.example lists every variable.');
  console.error('');
  process.exit(1);
}

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) reportAndExit(parsed.error);

export const config = Object.freeze({
  ...parsed.data,
  // false, a number of proxies, or an array of trusted addresses.
  TRUST_PROXY: parsed.data.TRUST_PROXY.value,
  isDevelopment: parsed.data.NODE_ENV === 'development',
  isTest: parsed.data.NODE_ENV === 'test',
  isProduction: parsed.data.NODE_ENV === 'production',
});
