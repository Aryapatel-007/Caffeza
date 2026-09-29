/**
 * Report endpoints. Every one is a read.
 *
 * Shapes come from the M6 section of docs/API-CONTRACT.md.
 *
 * There is no POST, PATCH, PUT or DELETE in this file and there will not be
 * one. M6 owns no collection and writes nothing; the moment a report starts
 * writing, it has become a different module.
 *
 * The range check runs here rather than in the Zod schema because
 * RANGE_TOO_LARGE is a 422 business rule and everything a schema rejects
 * comes back as a 400 -- the same reasoning M0-B used for the
 * new-password-equals-old check.
 */
import {
  labourHours,
  lowStock,
  staffOnShift,
  stockConsumption,
} from '../services/operationsReportService.js';
import { assertRange } from '../services/reportRangeService.js';
import {
  discounts,
  hourly,
  openOrders,
  paymentMethods,
  salesByDay,
  salesForDate,
  salesSummary,
  taxSummary,
  topItems,
  unpaidBills,
} from '../services/salesReportService.js';
import { getSetting } from '../services/settingsService.js';
import { sendSuccess } from '../utils/response.js';
import { businessDateFor, nowUtc } from '../utils/time.js';

/**
 * Today's business date, computed server-side from this restaurant's own
 * boundary. Never taken from the client: a dashboard that accepts a date is a
 * dashboard two people can be looking at differently while both believing
 * they see "today".
 */
async function todaysBusinessDate(req) {
  // Through settingsService as of M7: no controller reaches into
  // `restaurant.settings` itself, so a setting that moves moves in one file.
  const startMinutes = await getSetting(req.restaurantId, 'business.businessDayStartsAtMinutes', {
    req,
  });
  return businessDateFor(nowUtc(), startMinutes);
}

/** GET /reports/dashboard */
export async function getDashboard(req, res) {
  const businessDate = await todaysBusinessDate(req);

  /**
   * Six independent reads, run together rather than in sequence. This is the
   * one screen an owner opens every morning and it is the only endpoint in
   * the module that fans out, so the latency is worth removing here and
   * nowhere else.
   */
  const [sales, orders, items, stock, staff, unpaid] = await Promise.all([
    salesForDate(req, businessDate),
    openOrders(req),
    topItems(req, { from: businessDate, to: businessDate, limit: 5, sort: 'quantity' }),
    lowStock(req, { limit: 10 }),
    staffOnShift(req),
    unpaidBills(req, businessDate),
  ]);

  return sendSuccess(res, {
    businessDate,
    sales,
    openOrders: orders,
    topItems: items,
    lowStock: stock,
    staffOnShift: staff,
    unpaidBills: unpaid,
  });
}

/** GET /reports/sales-summary */
export async function getSalesSummary(req, res) {
  const range = assertRange(req.query);
  return sendSuccess(res, await salesSummary(req, range));
}

/** GET /reports/sales-by-day */
export async function getSalesByDay(req, res) {
  const range = assertRange(req.query);
  return sendSuccess(res, await salesByDay(req, range));
}

/** GET /reports/hourly */
export async function getHourly(req, res) {
  const range = assertRange(req.query);
  return sendSuccess(res, await hourly(req, range));
}

/** GET /reports/top-items */
export async function getTopItems(req, res) {
  const range = assertRange(req.query);
  const { limit, sort } = req.query;
  return sendSuccess(res, await topItems(req, { ...range, limit, sort }));
}

/** GET /reports/payment-methods. OWNER only; see the route file. */
export async function getPaymentMethods(req, res) {
  const range = assertRange(req.query);
  return sendSuccess(res, await paymentMethods(req, range));
}

/** GET /reports/tax-summary */
export async function getTaxSummary(req, res) {
  const range = assertRange(req.query);
  return sendSuccess(res, await taxSummary(req, range));
}

/** GET /reports/discounts */
export async function getDiscounts(req, res) {
  const range = assertRange(req.query);
  const { page, limit } = req.query;
  const { data, meta } = await discounts(req, { ...range, page, limit });

  /**
   * The only report with a paginated inner list. `data` is an object rather
   * than an array, so this uses sendSuccess with the paging carried inside
   * it, not sendList -- sendList is for a response whose `data` IS the array,
   * and forcing this shape into it would misdescribe what is paginated.
   */
  return sendSuccess(res, { ...data, recentPaging: meta });
}

/** GET /reports/stock-consumption */
export async function getStockConsumption(req, res) {
  const range = assertRange(req.query);
  const { ingredientId } = req.query;
  return sendSuccess(res, await stockConsumption(req, { ...range, ingredientId }));
}

/** GET /reports/labour-hours */
export async function getLabourHours(req, res) {
  const range = assertRange(req.query);
  const { userId } = req.query;
  return sendSuccess(res, await labourHours(req, { ...range, userId }));
}
