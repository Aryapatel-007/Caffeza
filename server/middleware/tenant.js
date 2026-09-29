/**
 * Tenancy. Step 3 of the middleware chain.
 *
 * Sets req.restaurantId and req.branchId from the verified token, and from
 * nowhere else. Not the body, not the query string, not a header. This is the
 * single point where the tenant is decided, and everything downstream reads it
 * through utils/scopedQuery.js.
 */
import { logger } from '../config/logger.js';
import { UnauthenticatedError } from '../utils/errors.js';
import { replaceQuery } from '../utils/requestQuery.js';

const TENANT_KEYS = Object.freeze(['restaurantId', 'branchId']);

/** Header spellings that mean the same thing. Node lowercases header names. */
const TENANT_HEADERS = Object.freeze([
  'x-restaurant-id',
  'restaurantid',
  'restaurant-id',
  'x-branch-id',
  'branchid',
  'branch-id',
]);

export function tenant(req, res, next) {
  if (!req.user) {
    // The route is wired wrong: tenant runs after authenticate, always.
    return next(new UnauthenticatedError('Sign in to continue.'));
  }

  const stripped = [];

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    for (const key of TENANT_KEYS) {
      if (key in req.body) {
        delete req.body[key];
        stripped.push(`body.${key}`);
      }
    }
  }

  if (req.query && typeof req.query === 'object') {
    const sanitised = { ...req.query };
    let changed = false;
    for (const key of TENANT_KEYS) {
      if (key in sanitised) {
        delete sanitised[key];
        stripped.push(`query.${key}`);
        changed = true;
      }
    }
    if (changed) replaceQuery(req, sanitised);
  }

  for (const name of TENANT_HEADERS) {
    if (name in req.headers) {
      delete req.headers[name];
      stripped.push(`header.${name}`);
    }
  }

  if (stripped.length > 0) {
    /**
     * Strip it, log it, carry on. Deliberately not an error.
     *
     * A 400 saying "you may not send restaurantId" confirms to whoever is
     * probing that restaurantId is the lever worth pulling. Silence tells them
     * nothing. The warn line tells us everything.
     */
    (req.log ?? logger).warn(
      {
        userId: req.user.id,
        route: `${req.method} ${req.originalUrl}`,
        strippedFields: stripped,
      },
      'Client sent a tenant field. Ignored.',
    );
  }

  req.restaurantId = req.user.restaurantId;
  req.branchId = req.user.branchId;
  return next();
}
