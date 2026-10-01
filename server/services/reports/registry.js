/**
 * Every M19 report, by id. M19, built in P14; P15 to P17 add theirs.
 *
 * reportV2Routes mounts each one at GET /api/v1/reports/v2/{name} with its
 * roles. A test checks every definition has a title, roles, a schema, columns
 * whose labels are glossary terms, and checks.
 */
import bills from './definitions/bills.js';

export const REPORTS = Object.freeze([bills]);

export const REPORTS_BY_NAME = Object.freeze(Object.fromEntries(REPORTS.map((report) => [report.name, report])));

export default REPORTS;
