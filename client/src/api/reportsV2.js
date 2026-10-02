/**
 * M19 report calls. P14. Every report is GET /reports/v2/{name}; the shapes are
 * docs/API-CONTRACT.md "M19 Reports v2".
 */
import { api, downloadFile, requestWithMeta } from './client.js';

/** A query string from an object, leaving out empty values. */
export function reportQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  return search.toString();
}

/** R19. `{ data: envelope, meta }`. */
export function getBillList(params) {
  return requestWithMeta(`/reports/v2/bills?${reportQuery(params)}`);
}

/** One bill in full, with its timeline. */
export function getBillDetail(billId) {
  return api.get(`/reports/v2/bills/${billId}`);
}

/** Any report as an Excel file: `{ blob, fileName }`. */
export function downloadReport(name, params) {
  return downloadFile(`/reports/v2/${name}?${reportQuery({ ...params, format: 'xlsx' })}`);
}

/** Any M19 report as JSON: `{ data: envelope, meta }`. P18. */
export function getReport(name, params) {
  return requestWithMeta(`/reports/v2/${name}?${reportQuery(params)}`);
}
