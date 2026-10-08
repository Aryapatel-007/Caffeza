/** Customers. P27, API-CONTRACT M22. Search is a POST, so a phone never sits in a URL. */
import { api, downloadFile, requestWithMeta } from './client.js';

export const listCustomers = ({ page = 1, offers = false } = {}) => requestWithMeta(`/customers?page=${page}&limit=50${offers ? '&offers=true' : ''}`);
export const searchCustomers = ({ query, offers = false }) => api.post('/customers/search', { query, ...(offers ? { offers: true } : {}) });
export const getCustomer = (id) => api.get(`/customers/${id}`);
export const updateCustomer = (id, body) => api.patch(`/customers/${id}`, body);
export const downloadCustomers = () => downloadFile('/customers/export');
