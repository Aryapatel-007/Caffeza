/**
 * Structured logging.
 *
 * Pretty printed in development, one JSON object per line in production.
 *
 * Nothing sensitive reaches the log. The redaction list below covers the keys
 * we never want on disk, and tests/logger.test.js proves it by logging a fake
 * object full of secrets and asserting none of the values come out.
 */
import { randomUUID } from 'node:crypto';

import pino from 'pino';
import pinoHttp from 'pino-http';

import { config } from './env.js';

/**
 * Keys whose values never get logged. Passwords and tokens are obvious.
 * Phone numbers are in here because they are personal data under the DPDP Act,
 * and the staff records we hold belong to our clients, not to us.
 */
export const SENSITIVE_KEYS = Object.freeze([
  'password',
  'pin',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'phone',
]);

export const REDACTION_CENSOR = '[REDACTED]';

/**
 * pino redaction is path based and its wildcard only spans one level, so the
 * paths are generated for the shapes we actually log: top level, one level
 * down, and the request and response objects pino-http attaches.
 *
 * Anything nested deeper than this must be redacted at the call site. The rule
 * is simpler than the mechanism: do not put a secret in a log line.
 */
function buildRedactionPaths(keys) {
  const prefixes = [
    '',
    '*.',
    'req.body.',
    'req.headers.',
    'req.query.',
    'res.headers.',
    'err.',
    'user.',
    'data.',
    'payload.',
  ];

  const paths = new Set();
  for (const key of keys) {
    for (const prefix of prefixes) paths.add(`${prefix}${key}`);
  }
  paths.add('req.headers.cookie');
  paths.add('req.headers["set-cookie"]');
  paths.add('res.headers["set-cookie"]');
  return [...paths];
}

export const REDACTION_PATHS = Object.freeze(buildRedactionPaths(SENSITIVE_KEYS));

function defaultLevel() {
  if (config.isTest) return 'silent';
  return config.isProduction ? 'info' : 'debug';
}

/**
 * Builds a logger with the real redaction settings. The application uses the
 * shared `logger` below. Tests use this factory with an in-memory destination
 * so they exercise the same configuration rather than a copy of it.
 */
export function createLogger({ level, destination, pretty } = {}) {
  const options = {
    level: level ?? defaultLevel(),
    redact: { paths: [...REDACTION_PATHS], censor: REDACTION_CENSOR },
    base: { service: 'restaurant-erp-server', env: config.NODE_ENV },
    formatters: { level: (label) => ({ level: label }) },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  // A transport and an explicit destination stream are mutually exclusive.
  const usePretty = pretty ?? (config.isDevelopment && destination === undefined);
  if (usePretty) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
        ignore: 'pid,hostname,service,env',
      },
    };
  }

  return destination === undefined ? pino(options) : pino(options, destination);
}

export const logger = createLogger();

/**
 * Request logging. Every request gets an id, the id goes back on the response
 * as X-Request-Id, and `req.log` is a child logger that stamps that id on
 * every line written during the request.
 *
 * Controllers and services should use `req.log`, not the shared logger, so a
 * problem can be traced back to one request.
 *
 * The id is generated here and never read from a client header. A client does
 * not get to choose what our logs are keyed on.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const id = randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customProps(req) {
    return {
      restaurantId: req.restaurantId ?? null,
      userId: req.user?.id ?? null,
    };
  },
  customLogLevel(req, res, error) {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
