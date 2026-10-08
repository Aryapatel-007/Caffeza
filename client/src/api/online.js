/**
 * Online takeaway and bookings, the staff side. P23 (M14), API-CONTRACT M14
 * section 3. Accepting, declining and seating are decided on the server; these
 * calls only ask.
 */
import { api, requestWithMeta } from './client.js';

function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** The poll behind the alert. */
export const getInbox = () => api.get('/online/inbox');

export const listOnlineOrders = (params = {}) => requestWithMeta(`/online/orders${toQuery(params)}`);
export const acceptOnlineOrder = (id, body = {}) => api.post(`/online/orders/${id}/accept`, body);
export const declineOnlineOrder = (id, body) => api.post(`/online/orders/${id}/decline`, body);

export const listReservations = (params = {}) => api.get(`/online/reservations${toQuery(params)}`);
export const createPhoneReservation = (body) => api.post('/online/reservations', body);
export const confirmReservation = (id, body = {}) => api.post(`/online/reservations/${id}/confirm`, body);
export const declineReservation = (id, body) => api.post(`/online/reservations/${id}/decline`, body);
export const seatReservation = (id, body) => api.post(`/online/reservations/${id}/seat`, body);
export const noShowReservation = (id) => api.post(`/online/reservations/${id}/no-show`, {});
export const cancelReservation = (id, body) => api.post(`/online/reservations/${id}/cancel`, body);

export const pauseTakeaway = (body) => api.post('/online/pause', body);
export const resumeTakeaway = () => api.post('/online/resume', {});

/** P24. Retries a refund the gateway refused. OWNER and MANAGER. */
export const retryRefund = (paymentId) => api.post(`/online/payments/${paymentId}/refund`, {});

export const setPageAddress = (publicSlug) => api.patch('/online/site', { publicSlug });
