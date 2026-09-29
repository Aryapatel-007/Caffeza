/**
 * Unmatched routes. Runs after every route, before the error handler.
 *
 * Without this, Express answers an unknown URL with an HTML error page, and a
 * client that expects the standard envelope everywhere gets a parse error
 * instead of a clean NOT_FOUND.
 */
import { NotFoundError } from '../utils/errors.js';

export function notFound(req, res, next) {
  next(new NotFoundError(`No route matches ${req.method} ${req.originalUrl}`));
}
