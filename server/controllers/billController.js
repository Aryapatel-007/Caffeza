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
import { ROLES } from '../config/roles.js';
import { Bill } from '../models/Bill.js';
import { Order } from '../models/Order.js';
import { Restaurant } from '../models/Restaurant.js';
import {
  advanceOnBill,
  applyDiscount,
  correctPayment,
  createBill,
  readBill,
  recordPayment,
  voidBill,
} from '../services/billService.js';
import {
  assertCanBill,
  assertCanCorrectPayment,
  assertCanDiscount,
  assertCanTakePayment,
  assertCanVoid,
} from '../services/billPermissionService.js';
import { cancelLinesAfterBilling, listRefunds as findRefunds, markRefundDone } from '../services/billCancelLinesService.js';
import { markPrinted, printQueue, requestPrint } from '../services/billPrintService.js';
import { buildInvoiceData, renderReceipt } from '../services/receiptService.js';
import { getSetting, getSettings } from '../services/settingsService.js';
import { sendList, sendSuccess } from '../utils/response.js';
import { scoped, scopedForAggregate } from '../utils/scopedQuery.js';
import { businessDateFor, nowUtc } from '../utils/time.js';
import { reopenBill } from '../services/billReopenService.js';

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
  // P25 Part D. A captain may bill by the owner's setting; the till always may.
  if (req.user.role === ROLES.WAITER) {
    const order = await Order.findOne({ ...scoped(req), _id: req.body.orderId }).select('orderType').lean();
    assertCanBill(req.user, order, await getSettingsGroup(req, 'billing'));
  }
  const bill = await createBill(req, req.body);
  return sendSuccess(res, bill, 201);
}

/** GET /bills/:billId */
export async function getBill(req, res) {
  const bill = await readBill(req, req.params.billId);
  // P24. An order paid online carries its advance, for the Apply advance button.
  const advance = await advanceOnBill(req, bill);
  return sendSuccess(res, advance ? { ...bill.toJSON(), advance } : bill);
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
  // P08: a cashier may give a platform discount when the owner allows it.
  const cashierMayApplyPlatformDiscounts = await getSetting(
    req.restaurantId,
    'discounts.cashierMayApplyPlatformDiscounts',
    { req },
  );
  assertCanDiscount(req.user, { reasonCode: req.body.reasonCode, cashierMayApplyPlatformDiscounts });
  return sendSuccess(res, await applyDiscount(req, req.params.billId, req.body));
}

/** POST /bills/:billId/payments */
export async function postPayment(req, res) {
  if (req.user.role === ROLES.WAITER) {
    assertCanTakePayment(req.user, await readBill(req, req.params.billId), await getSettingsGroup(req, 'billing'));
  }
  return sendSuccess(res, await recordPayment(req, req.params.billId, req.body));
}

/** POST /bills/:billId/payments/:paymentId/correct. P08. */
export async function postCorrectPayment(req, res) {
  assertCanCorrectPayment(req.user);
  return sendSuccess(
    res,
    await correctPayment(req, req.params.billId, req.params.paymentId, req.body),
  );
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
  const { receipt } = await getSettings(req.restaurantId, { req });

  return sendSuccess(res, {
    width,
    text: renderReceipt({ restaurant, bill, width, receipt }),
    // P25 C5. The client draws this as a QR code under the text.
    reviewLinkUrl: receipt.reviewLinkUrl ?? null,
  });
}

/**
 * GET /bills/:billId/invoice. P25 C4. The same data the receipt is laid out
 * from, for a full A4 or A5 page drawn on the client.
 */
export async function getInvoice(req, res) {
  const bill = await readBill(req, req.params.billId);
  const restaurant = await Restaurant.findById(req.restaurantId);
  const { receipt } = await getSettings(req.restaurantId, { req });
  return sendSuccess(res, buildInvoiceData({ restaurant, bill, receipt }));
}

/** POST /bills/:billId/print-request. P25 Part D. */
export async function postPrintRequest(req, res) {
  return sendSuccess(res, await requestPrint(req, req.params.billId));
}

/** GET /bills/print-queue. P25 Part D. */
export async function getPrintQueue(req, res) {
  return sendSuccess(res, await printQueue(req));
}

/** POST /bills/:billId/printed. P25 Part D. */
export async function postPrinted(req, res) {
  return sendSuccess(res, await markPrinted(req, req.params.billId));
}

/** POST /bills/:billId/cancel-lines. P25 Part E. The service decides who may, and checks the PIN. */
export async function postCancelLines(req, res) {
  return sendSuccess(res, await cancelLinesAfterBilling(req, req.params.billId, req.body));
}

/** POST /bills/:billId/reopen. P26. The service decides who may, and checks the PIN. */
export async function postReopenBill(req, res) {
  return sendSuccess(res, await reopenBill(req, req.params.billId, req.body ?? {}));
}

/** GET /refunds. P25 Part E. */
export async function getRefunds(req, res) {
  const { rows, total, page, limit } = await findRefunds(req, req.query);
  return sendList(res, rows, { page, limit, total });
}

/** POST /refunds/:refundId/done. P25 Part E. */
export async function postRefundDone(req, res) {
  return sendSuccess(res, await markRefundDone(req, req.params.refundId, req.body));
}

/** One settings group, as the API shapes it. */
async function getSettingsGroup(req, group) {
  return (await getSettings(req.restaurantId, { req }))[group];
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
