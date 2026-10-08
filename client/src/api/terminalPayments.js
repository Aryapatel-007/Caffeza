/** The card machine. P25 Part I, API-CONTRACT M21 section 8. */
import { api } from './client.js';

export const startTerminalPayment = (billId, { method, amountInPaise, terminalClientId }) =>
  api.post(`/bills/${billId}/terminal-payments`, { method, amountInPaise, terminalClientId });
export const readTerminalPayment = (id) => api.get(`/terminal-payments/${id}`);
export const cancelTerminalPayment = (id) => api.post(`/terminal-payments/${id}/cancel`, {});
