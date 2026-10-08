/**
 * The public page's calls. P23 (M14), API-CONTRACT M14 section 2.
 *
 * Deliberately not built on `client.js`: a guest has no session, so there is
 * no token to send and nothing to refresh, and the page must never start the
 * staff sign-in flow, so it imports nothing from the staff client. Same
 * envelope, same error shape.
 */

/** The same fields as the staff ApiError, without importing the staff client. */
export class PublicApiError extends Error {
  constructor({ code, message, status, ...rest }) {
    super(message ?? 'Something went wrong. Please try again.');
    this.name = 'PublicApiError';
    this.code = code ?? 'INTERNAL_ERROR';
    this.status = status;
    Object.assign(this, rest);
  }
}

const BASE = '/api/v1/public';

async function call(path, { method = 'GET', body, statusToken } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (statusToken) headers['X-Status-Token'] = statusToken;

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
    });
  } catch {
    throw new PublicApiError({ code: 'NETWORK', message: 'No connection. Check your internet and try again.', status: 0 });
  }

  let envelope;
  try {
    envelope = await response.json();
  } catch {
    throw new PublicApiError({ code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', status: response.status });
  }
  if (!response.ok || envelope?.success === false) {
    throw new PublicApiError({ ...(envelope?.error ?? {}), status: response.status });
  }
  return envelope.data;
}

const at = (slug, rest = '') => `/${encodeURIComponent(slug)}${rest}`;

export const getSite = (slug) => call(at(slug));
export const getPublicMenu = (slug) => call(at(slug, '/menu'));
export const getQuote = (slug, lines) => call(at(slug, '/quote'), { method: 'POST', body: { lines } });
export const placeOrder = (slug, body) => call(at(slug, '/orders'), { method: 'POST', body });
export const getOrderStatus = (slug, id, statusToken) => call(at(slug, `/orders/${id}`), { statusToken });
export const cancelOrder = (slug, id, statusToken) =>
  call(at(slug, `/orders/${id}/cancel`), { method: 'POST', statusToken });

export const getSlots = (slug, date, partySize) =>
  call(at(slug, `/reservations/slots?date=${encodeURIComponent(date)}&partySize=${partySize}`));
export const requestBooking = (slug, body) => call(at(slug, '/reservations'), { method: 'POST', body });
export const getBookingStatus = (slug, id, statusToken) => call(at(slug, `/reservations/${id}`), { statusToken });
export const cancelBooking = (slug, id, statusToken) =>
  call(at(slug, `/reservations/${id}/cancel`), { method: 'POST', statusToken });
