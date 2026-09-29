/**
 * Rejects a request that did not set a custom header.
 *
 * Applied to the two auth endpoints that read the refresh token from a cookie
 * the browser attaches on its own: POST /auth/refresh and POST /auth/logout. A
 * body-borne token did not need this; a cookie-borne one does.
 *
 * How it defends: a cross-site `<form>` submit or an `<img>` can make the
 * browser send the cookie but cannot set a custom request header. A cross-origin
 * `fetch` that sets one is no longer a "simple request", so the browser sends a
 * CORS preflight first, and this API's origin allowlist answers it for our
 * origin only. Either way an attacker's page cannot reach these endpoints.
 *
 * This is defence in depth alongside `SameSite=Lax` on the cookie itself.
 * docs/API-CONTRACT.md "Token model" says both are load-bearing; do not remove
 * one thinking the other covers it.
 */
import { ForbiddenError } from '../utils/errors.js';

const HEADER = 'x-requested-with';

export function requireCsrfHeader(req, res, next) {
  if (!req.get(HEADER)) {
    return next(new ForbiddenError('This request must be made by the app.'));
  }
  return next();
}
