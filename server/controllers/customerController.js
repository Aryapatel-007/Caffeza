/** Customers. P27, API-CONTRACT M22. Thin: every rule is in services/customerService.js. */
import { exportCustomers, listCustomers, readCustomer, searchCustomers, updateCustomer } from '../services/customerService.js';
import { sendList, sendSuccess } from '../utils/response.js';

/** GET /customers */
export async function getCustomers(req, res) {
  const { rows, total, page, limit } = await listCustomers(req, req.query);
  return sendList(res, rows, { page, limit, total });
}

/** POST /customers/search */
export async function postSearchCustomers(req, res) {
  return sendSuccess(res, await searchCustomers(req, req.body));
}

/** GET /customers/:customerId */
export async function getCustomer(req, res) {
  return sendSuccess(res, await readCustomer(req, req.params.customerId));
}

/** PATCH /customers/:customerId */
export async function patchCustomer(req, res) {
  return sendSuccess(res, await updateCustomer(req, req.params.customerId, req.body));
}

/** GET /customers/export. A CSV file. */
export async function getCustomersExport(req, res) {
  const { csv, fileName } = await exportCustomers(req);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.status(200).send(csv);
}
