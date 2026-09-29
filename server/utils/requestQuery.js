/**
 * Replacing req.query safely.
 *
 * In Express 5 `req.query` is a getter with no setter, so a plain assignment
 * throws in strict mode. Both the tenant middleware (which strips fields a
 * client must not control) and the validate middleware (which writes back
 * parsed values) need to replace it, so the mechanics live here.
 *
 * Defining an own property shadows the prototype getter, and every later read
 * of req.query sees the replacement.
 */
export function replaceQuery(req, value) {
  Object.defineProperty(req, 'query', {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return req.query;
}
