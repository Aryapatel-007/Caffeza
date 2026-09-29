/**
 * Response envelope.
 *
 * Controllers never build a response object by hand. If the envelope ever
 * changes, it changes here and nowhere else.
 *
 * The failure envelope is built in middleware/errorHandler.js, because the
 * only way to produce one should be to throw.
 */

/**
 * Success envelope.
 *
 *   { "success": true, "data": { } }
 */
export function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

/**
 * List envelope, with paging beside the array rather than wrapped around it.
 *
 *   { "success": true, "data": [ ], "meta": { page, limit, total } }
 *
 * `total` is the count of matching records before paging, not the length of
 * this page. A client cannot render "213 results" from a page of 50.
 */
export function sendList(res, data, { page, limit, total, ...extraMeta }) {
  if (!Array.isArray(data)) {
    throw new TypeError('sendList expects an array. Use sendSuccess for a single record.');
  }

  /**
   * `extraMeta` is for figures that belong beside the page rather than inside a
   * row: M3's bill list carries a running total for the whole matched range,
   * because a cashier's "today so far" cannot be added up from one page of
   * fifty. Paging keys stay first so the shape a client already parses is
   * unchanged.
   */
  return res.status(200).json({
    success: true,
    data,
    meta: { page, limit, total, ...extraMeta },
  });
}
