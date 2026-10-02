/**
 * The audit trail, M8, read. P17 built it; R18 Activity Log reads it. P18.
 * docs/API-CONTRACT.md "M8 Audit Trail".
 */
import { requestWithMeta } from './client.js';
import { reportQuery } from './reportsV2.js';

/** GET /audit: `{ data: lines, meta }`. A manager's view is narrowed on the server. */
export function listAudit(params) {
  return requestWithMeta(`/audit?${reportQuery(params)}`);
}
