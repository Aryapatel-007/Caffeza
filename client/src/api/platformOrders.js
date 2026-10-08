/** Delivery platform orders. P25 Part H, API-CONTRACT M21 section 7.3. */
import { api } from './client.js';

export function listPlatformOrders({ status, date, limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (date) params.set('date', date);
  params.set('limit', String(limit));
  return api.get(`/platform-orders?${params}`);
}

export function acceptPlatformOrder(id, { prepMinutes, acknowledgeHandling } = {}) {
  return api.post(`/platform-orders/${id}/accept`, {
    ...(prepMinutes ? { prepMinutes } : {}),
    ...(acknowledgeHandling ? { acknowledgeHandling: true } : {}),
  });
}

export function rejectPlatformOrder(id, body) {
  return api.post(`/platform-orders/${id}/reject`, body);
}

export function handOverPlatformOrder(id) {
  return api.post(`/platform-orders/${id}/handed-over`, {});
}
