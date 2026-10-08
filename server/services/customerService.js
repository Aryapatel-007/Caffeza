/**
 * Customers. P27, API-CONTRACT M22.
 *
 * A customer is one phone number at one restaurant, built from orders: every
 * order opened with a phone records a visit. Offers consent is recorded only
 * when given, with the wording's version, how and by whom, and a withdrawal is
 * kept in the history. A phone is never logged, never audited, never in a URL.
 */
import { CURRENT_CONSENT_VERSION } from '../config/consentText.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { Bill } from '../models/Bill.js';
import { CONSENT_SOURCES, Customer } from '../models/Customer.js';
import { Order } from '../models/Order.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { sumPaise } from '../utils/money.js';
import { scoped } from '../utils/scopedQuery.js';
import { nowUtc } from '../utils/time.js';
import { recordAudit } from './auditService.js';

const SEARCH_LIMIT = 50;

/** Consent ticked by staff at the table or the counter, in the current wording. */
export const staffConsent = () => ({ given: true, textVersion: CURRENT_CONSENT_VERSION, at: nowUtc(), source: CONSENT_SOURCES.STAFF });

/** A guest's own consent from the page (P23), if they gave it. */
export const onlineConsent = (marketingConsent) =>
  marketingConsent?.given ? { given: true, textVersion: marketingConsent.textVersion ?? null, at: marketingConsent.at ?? nowUtc(), source: CONSENT_SOURCES.ONLINE } : null;

/**
 * Records one visit for the order's phone. `consent` is null, or
 * `{ given: true, textVersion, at, source }`. Never withdraws consent.
 */
export function recordVisit(req, order, consent = null) {
  if (!order.customerPhone) return Promise.resolve(null);
  const at = order.openedAt ?? nowUtc();
  const update = {
    $setOnInsert: { ...scoped(req), phone: order.customerPhone, firstVisitAt: at },
    $set: { lastVisitAt: at, lastOrderId: order._id, ...(order.customerName ? { name: order.customerName } : {}) },
    $inc: { visitCount: 1 },
  };
  if (consent?.given) {
    update.$set.offers = { given: true, textVersion: consent.textVersion, at: consent.at, source: consent.source };
    update.$push = { offersHistory: { ...consent, by: consent.source === CONSENT_SOURCES.STAFF ? req.user?.id ?? null : null } };
  }
  return Customer.findOneAndUpdate({ ...scoped(req), phone: order.customerPhone }, update, { upsert: true, new: true });
}

const present = (customer) => {
  const plain = customer.toJSON ? customer.toJSON() : customer;
  const { offersHistory = [], ...rest } = plain;
  return { ...rest, id: String(plain.id ?? plain._id), offersHistory };
};

/** GET /customers */
export async function listCustomers(req, { page = 1, limit = 50, offers = undefined }) {
  const filter = { ...scoped(req), ...(offers === 'true' ? { 'offers.given': true } : {}) };
  const [rows, total] = await Promise.all([
    Customer.find(filter).sort({ lastVisitAt: -1 }).skip((page - 1) * limit).limit(limit),
    Customer.countDocuments(filter),
  ]);
  return { rows: rows.map(present), total, page, limit };
}

/** POST /customers/search: a name, or three or more digits at the end of a phone. */
export async function searchCustomers(req, { query, offers = false }) {
  const text = query.trim();
  const digits = text.replace(/\D/g, '');
  const byPhone = digits.length >= 3 && digits.length === text.replace(/[\s+-]/g, '').length;
  const filter = {
    ...scoped(req),
    ...(byPhone ? { phone: { $regex: `${digits.slice(-10)}$` } } : { name: { $regex: escapeRegex(text), $options: 'i' } }),
    ...(offers ? { 'offers.given': true } : {}),
  };
  const rows = await Customer.find(filter).sort({ lastVisitAt: -1 }).limit(SEARCH_LIMIT);
  return rows.map(present);
}

async function loadCustomer(req, id) {
  const customer = await Customer.findOne({ ...scoped(req), _id: id });
  if (!customer) throw new NotFoundError('Customer not found.');
  return customer;
}

/** GET /customers/:customerId, with recent orders and their live bills. */
export async function readCustomer(req, id) {
  const customer = await loadCustomer(req, id);
  const orders = await Order.find({ ...scoped(req), customerPhone: customer.phone })
    .sort({ openedAt: -1 })
    .limit(50)
    .select('orderNumber orderType tableName openedAt status')
    .lean();
  const bills = await Bill.find({ ...scoped(req), orderId: { $in: orders.map((order) => order._id) }, isVoided: false })
    .select('orderId billNumber grandTotalInPaise')
    .lean();
  const billFor = new Map(bills.map((bill) => [String(bill.orderId), bill]));
  const visits = orders.map((order) => {
    const bill = billFor.get(String(order._id));
    return {
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      tableName: order.tableName ?? null,
      openedAt: order.openedAt,
      status: order.status,
      bill: bill ? { billId: String(bill._id), billNumber: bill.billNumber, grandTotalInPaise: bill.grandTotalInPaise } : null,
    };
  });
  return { ...present(customer), visits, totalSpentInPaise: sumPaise(0, ...bills.map((bill) => bill.grandTotalInPaise)) };
}

/** PATCH /customers/:customerId: a name, or consent given or withdrawn at the counter. */
export async function updateCustomer(req, id, { name, offersConsent, reason = null }) {
  const customer = await loadCustomer(req, id);
  if (name !== undefined) customer.name = name;
  if (offersConsent !== undefined) {
    if (!reason) throw new ValidationError('Say why.', { reason: 'Say why the consent changed.' });
    const entry = { given: offersConsent, textVersion: offersConsent ? CURRENT_CONSENT_VERSION : customer.offers?.textVersion ?? null, at: nowUtc(), source: CONSENT_SOURCES.STAFF, by: req.user.id, reason };
    customer.offers = { given: offersConsent, textVersion: entry.textVersion, at: entry.at, source: CONSENT_SOURCES.STAFF };
    customer.offersHistory.push(entry);
  }
  await customer.save();
  return readCustomer(req, id);
}

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** GET /customers/export. OWNER. Only those who agreed to offers. Audited by count. */
export async function exportCustomers(req) {
  const rows = await Customer.find({ ...scoped(req), 'offers.given': true }).sort({ lastVisitAt: -1 }).lean();
  const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');
  const lines = [
    ['Name', 'Mobile number', 'Visits', 'Last visit', 'Agreed on', 'Consent text version'].join(','),
    ...rows.map((row) => [row.name, row.phone, row.visitCount, day(row.lastVisitAt), day(row.offers?.at), row.offers?.textVersion].map(csvCell).join(',')),
  ];
  await recordAudit(req, {
    action: AUDIT_ACTIONS.CUSTOMERS_EXPORTED,
    entityType: AUDIT_ENTITY_TYPES.SETTINGS,
    entityId: req.restaurantId,
    entityLabel: 'Customers who agreed to offers',
    reason: `${rows.length} customers downloaded`,
    details: { count: rows.length },
  });
  return { csv: `${lines.join('\n')}\n`, fileName: `customers-offers-${day(nowUtc())}.csv` };
}

export default { exportCustomers, listCustomers, readCustomer, recordVisit, searchCustomers, updateCustomer };
