/**
 * Bill endpoints.
 *
 * Controllers read the request, call a service, and send the answer. Every
 * business rule is in services/billService.js and every permission rule is in
 * services/billPermissionService.js, so "what may a cashier do" is one file to
 * read rather than eight handlers.
 *
 * Nothing here computes money. If you find yourself adding a `+` to a paise
 * figure in this file, it belongs in utils/tax.js.
 */
import { Bill } from '../models/Bill.js';
import { Restaurant } from '../models/Restaurant.js';
import {
  applyDiscount,
  createBill,
  readBill,
  recordPayment,
  voidBill,
} from '../services/billService.js';
import { assertCanDiscount, assertCanVoid } from '../services/billPermissionService.js';
import { renderReceipt } from '../services/receiptService.js';
import { getSetting } from '../services/settingsService.js';
import { sendList, sendSuccess } from '../utils/response.js';
import { scoped, scopedForAggregate } from '../utils/scopedQuery.js';
import { businessDateFor, nowUtc } from '../utils/time.js';

/**
 * The business-date range a list or summary covers.
 *
 * Defaults to today's business day, which is what a cashier's screen wants and
 * what stops an unqualified GET returning every bill a restaurant has ever
 * issued.
 */
async function resolveRange(req, { from, to }) {
  if (from && to) return { from, to };

  // Through settingsService as of M7: no controller reaches into
  // `restaurant.settings` itself. The boundary and the arithmetic are both
  // unchanged; only where the number is read from moved.
  const startMinutes = await getSetting(req.restaurantId, 'business.businessDayStartsAtMinutes', {
    req,
  });
  const today = businessDateFor(nowUtc(), startMinutes);

  return { from: from ?? today, to: to ?? today };
}

/** POST /bills */
export async function postBill(req, res) {
  const bill = await createBill(req, req.body);
  return sendSuccess(res, bill, 201);
}

/** GET /bills/:billId */
export async function getBill(req, res) {
  return sendSuccess(res, await readBill(req, req.params.billId));
}

/** GET /bills */
export async function listBills(req, res) {
  const { page, limit, status, includeVoided } = req.query;
  const { from, to } = await resolveRange(req, req.query);

  const filter = { ...scoped(req), businessDate: { $gte: from, $lte: to } };
  if (status) filter.status = status;
  if (!includeVoided) filter.isVoided = false;

  const [bills, total] = await Promise.all([
    Bill.find(filter)
      .sort({ billedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Bill.countDocuments(filter),
  ]);

  /**
   * The running total covers the WHOLE matched range, not this page.
   *
   * A cashier's screen shows "today so far", and a figure that only adds up
   * the fifty rows currently visible is a wrong number on a busy evening.
   *
   * Voided bills are excluded from every figure except voidedCount. This is
   * the soft-delete leak from BUILD-PLAN section 8, and the aggregate is
   * scoped exactly like the query above so it cannot drift from it.
   *
   * scopedForAggregate, not scoped: a pipeline is not cast against the schema,
   * and req.restaurantId is a string off the JWT. Matching a string against an
   * ObjectId returns zero with no error at all. See utils/scopedQuery.js.
   */
  const totalsFilter = { ...scopedForAggregate(req), businessDate: { $gte: from, $lte: to } };
  const [totals] = await Bill.aggregate([
    { $match: totalsFilter },
    {
      $group: {
        _id: null,
        grandTotalInPaise: {
          $sum: { $cond: [{ $eq: ['$isVoided', false] }, '$grandTotalInPaise', 0] },
        },
        amountPaidInPaise: {
          $sum: { $cond: [{ $eq: ['$isVoided', false] }, '$amountPaidInPaise', 0] },
        },
        billCount: { $sum: { $cond: [{ $eq: ['$isVoided', false] }, 1, 0] } },
        voidedCount: { $sum: { $cond: [{ $eq: ['$isVoided', true] }, 1, 0] } },
      },
    },
  ]);

  return sendList(res, bills, {
    page,
    limit,
    total,
    totals: {
      grandTotalInPaise: totals?.grandTotalInPaise ?? 0,
      amountPaidInPaise: totals?.amountPaidInPaise ?? 0,
      billCount: totals?.billCount ?? 0,
      voidedCount: totals?.voidedCount ?? 0,
    },
    from,
    to,
  });
}

/** POST /bills/:billId/discount */
export async function postDiscount(req, res) {
  assertCanDiscount(req.user);
  return sendSuccess(res, await applyDiscount(req, req.params.billId, req.body));
}

/** POST /bills/:billId/payments */
export async function postPayment(req, res) {
  return sendSuccess(res, await recordPayment(req, req.params.billId, req.body));
}

/** POST /bills/:billId/void */
export async function postVoid(req, res) {
  assertCanVoid(req.user);
  return sendSuccess(res, await voidBill(req, req.params.billId, req.body));
}

/** GET /bills/:billId/receipt */
export async function getReceipt(req, res) {
  const bill = await readBill(req, req.params.billId);

  // Tenancy root, looked up by _id from a verified token. See DB-SCHEMA.
  const restaurant = await Restaurant.findById(req.restaurantId);
  const { width } = req.query;

  return sendSuccess(res, { width, text: renderReceipt({ restaurant, bill, width }) });
}

/** GET /bills/summary */
export async function getSummary(req, res) {
  const { from, to } = req.query;
  const match = { ...scoped(req), businessDate: { $gte: from, $lte: to } };

  const bills = await Bill.find(match).select(
    'grandTotalInPaise totalTaxInPaise roundOffInPaise subtotalInPaise discount taxBreakdown payments isVoided',
  );

  const live = bills.filter((bill) => !bill.isVoided);
  const voided = bills.filter((bill) => bill.isVoided);

  const slabs = new Map();
  for (const bill of live) {
    for (const slab of bill.taxBreakdown) {
      const running = slabs.get(slab.taxRateBps) ?? {
        taxRateBps: slab.taxRateBps,
        taxableInPaise: 0,
        cgstInPaise: 0,
        sgstInPaise: 0,
      };
      running.taxableInPaise += slab.taxableInPaise;
      running.cgstInPaise += slab.cgstInPaise;
      running.sgstInPaise += slab.sgstInPaise;
      slabs.set(slab.taxRateBps, running);
    }
  }

  const methods = new Map();
  for (const bill of live) {
    for (const payment of bill.payments) {
      const running = methods.get(payment.method) ?? {
        method: payment.method,
        amountInPaise: 0,
        billCount: 0,
      };
      running.amountInPaise += payment.amountInPaise;
      running.billCount += 1;
      methods.set(payment.method, running);
    }
  }

  const sum = (list, pick) => list.reduce((total, item) => total + pick(item), 0);

  return sendSuccess(res, {
    from,
    to,
    billCount: live.length,
    grossInPaise: sum(live, (bill) => bill.subtotalInPaise),
    discountInPaise: sum(live, (bill) => bill.discount?.amountInPaise ?? 0),
    taxInPaise: sum(live, (bill) => bill.totalTaxInPaise),
    netInPaise: sum(live, (bill) => bill.grandTotalInPaise),
    roundOffInPaise: sum(live, (bill) => bill.roundOffInPaise),
    byTaxSlab: [...slabs.values()].sort((a, b) => a.taxRateBps - b.taxRateBps),
    byPaymentMethod: [...methods.values()].sort((a, b) => a.method.localeCompare(b.method)),
    voidedCount: voided.length,
    voidedInPaise: sum(voided, (bill) => bill.grandTotalInPaise),
  });
}
