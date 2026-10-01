/**
 * Every M19 report, by id. M19, built in P14; P15 to P17 add theirs.
 *
 * reportV2Routes mounts each one at GET /api/v1/reports/v2/{name} with its
 * roles. A test checks every definition has a title, roles, a schema, columns
 * whose labels are glossary terms, and checks.
 */
import bills from './definitions/bills.js';
import cashTill from './definitions/cashTill.js';
import dayClose from './definitions/dayClose.js';
import gst from './definitions/gst.js';
import hours from './definitions/hours.js';
import invoiceRegister from './definitions/invoiceRegister.js';
import payments from './definitions/payments.js';
import platformMoney from './definitions/platformMoney.js';
import salesByDay from './definitions/salesByDay.js';
import tallyExport from './definitions/tallyExport.js';

export const REPORTS = Object.freeze([
  dayClose,
  salesByDay,
  hours,
  payments,
  platformMoney,
  cashTill,
  gst,
  tallyExport,
  invoiceRegister,
  bills,
]);

export const REPORTS_BY_NAME = Object.freeze(Object.fromEntries(REPORTS.map((report) => [report.name, report])));

export default REPORTS;
