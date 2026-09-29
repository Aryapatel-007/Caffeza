/**
 * Report API calls. Every one is a GET.
 *
 * Shapes come from the M6 section of docs/API-CONTRACT.md.
 *
 * There is no write function in this file and there will not be one: M6 owns
 * no collection. Every `from` and `to` is a `"YYYY-MM-DD"` business date, not
 * a calendar date and not an instant -- the server matches them as strings
 * against what it stored, and nothing on this side converts them.
 */
import { api } from './client.js';

function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** Today's business day. Takes nothing: the server decides which day that is. */
export function getDashboard() {
  return api.get('/reports/dashboard');
}

export function getSalesSummary({ from, to }) {
  return api.get(`/reports/sales-summary${toQuery({ from, to })}`);
}

export function getSalesByDay({ from, to }) {
  return api.get(`/reports/sales-by-day${toQuery({ from, to })}`);
}

export function getHourly({ from, to }) {
  return api.get(`/reports/hourly${toQuery({ from, to })}`);
}

/** `sort` is 'quantity' or 'revenue'. `limit` is 1 to 100. */
export function getTopItems({ from, to, limit, sort }) {
  return api.get(`/reports/top-items${toQuery({ from, to, limit, sort })}`);
}

/** OWNER only on the server. The screen hides it for a manager; the server refuses it. */
export function getPaymentMethods({ from, to }) {
  return api.get(`/reports/payment-methods${toQuery({ from, to })}`);
}

export function getTaxSummary({ from, to }) {
  return api.get(`/reports/tax-summary${toQuery({ from, to })}`);
}

export function getDiscounts({ from, to, page, limit }) {
  return api.get(`/reports/discounts${toQuery({ from, to, page, limit })}`);
}

export function getStockConsumption({ from, to, ingredientId }) {
  return api.get(`/reports/stock-consumption${toQuery({ from, to, ingredientId })}`);
}

export function getLabourHours({ from, to, userId }) {
  return api.get(`/reports/labour-hours${toQuery({ from, to, userId })}`);
}
