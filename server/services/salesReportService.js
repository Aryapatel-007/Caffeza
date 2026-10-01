/**
 * The sales side of M6: everything read out of `bills`.
 *
 * Six reports live here -- summary, by day, hourly, top items, payment
 * methods, tax, discounts -- because all seven aggregate the same collection
 * with the same opening stage, and splitting them across files would mean
 * seven copies of that stage.
 *
 * Nothing in this file computes tax, a line total, or a grand total. Every
 * one of those was computed once by M3, under a documented rounding rule, and
 * stored. M6 sums stored values. A second implementation here would disagree
 * with the printed bill by a rupee, which is the exact failure BUILD-PLAN
 * names and the reason `tax.js` exists as the only place tax is worked out.
 */
import { discountReasonText } from '../config/discountReasons.js';
import { config } from '../config/env.js';
import { Bill } from '../models/Bill.js';
import { Order, OCCUPYING_ORDER_STATUSES } from '../models/Order.js';
import { liveInRange, tenantMatch } from './reportRangeService.js';

/** Integer division, floored, for an average that is only ever displayed. */
function averageOf(totalInPaise, count) {
  return count > 0 ? Math.floor(totalInPaise / count) : 0;
}

/* ---------------------------------------------------------------------- *
 * 2. Sales summary
 * ---------------------------------------------------------------------- */

/**
 * Headline totals across a range.
 *
 * Voided bills are counted, separately and on purpose: `voidedBillCount` and
 * `voidedBillValueInPaise` are the one place they appear, because an owner
 * wants to watch that number rise. They reach no revenue figure. That is why
 * this one report opens on `tenantMatch` rather than `liveInRange` and splits
 * the two groups with `$cond` -- one pass over the range instead of two.
 */
export async function salesSummary(req, { from, to }) {
  const notVoided = { $eq: ['$isVoided', false] };
  const sumIfLive = (field) => ({ $sum: { $cond: [notVoided, field, 0] } });
  const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

  const [row] = await Bill.aggregate([
    tenantMatch(req, { businessDate: { $gte: from, $lte: to } }),
    {
      $group: {
        _id: null,
        grossSalesInPaise: sumIfLive('$grandTotalInPaise'),
        subtotalInPaise: sumIfLive('$subtotalInPaise'),
        totalDiscountInPaise: sumIfLive({ $ifNull: ['$discount.amountInPaise', 0] }),
        totalTaxInPaise: sumIfLive('$totalTaxInPaise'),
        totalRoundOffInPaise: sumIfLive('$roundOffInPaise'),
        billCount: countIf(notVoided),
        voidedBillCount: countIf({ $eq: ['$isVoided', true] }),
        voidedBillValueInPaise: {
          $sum: { $cond: [{ $eq: ['$isVoided', true] }, '$grandTotalInPaise', 0] },
        },
        dineInBillCount: countIf({ $and: [notVoided, { $eq: ['$orderType', 'DINE_IN'] }] }),
        dineInSalesInPaise: {
          $sum: {
            $cond: [
              { $and: [notVoided, { $eq: ['$orderType', 'DINE_IN'] }] },
              '$grandTotalInPaise',
              0,
            ],
          },
        },
        takeawayBillCount: countIf({ $and: [notVoided, { $eq: ['$orderType', 'TAKEAWAY'] }] }),
        takeawaySalesInPaise: {
          $sum: {
            $cond: [
              { $and: [notVoided, { $eq: ['$orderType', 'TAKEAWAY'] }] },
              '$grandTotalInPaise',
              0,
            ],
          },
        },
      },
    },
  ]);

  const empty = {
    grossSalesInPaise: 0,
    subtotalInPaise: 0,
    totalDiscountInPaise: 0,
    totalTaxInPaise: 0,
    totalRoundOffInPaise: 0,
    billCount: 0,
    voidedBillCount: 0,
    voidedBillValueInPaise: 0,
    dineInBillCount: 0,
    dineInSalesInPaise: 0,
    takeawayBillCount: 0,
    takeawaySalesInPaise: 0,
  };
  const totals = { ...empty, ...(row ?? {}) };

  return {
    from,
    to,
    grossSalesInPaise: totals.grossSalesInPaise,
    subtotalInPaise: totals.subtotalInPaise,
    totalDiscountInPaise: totals.totalDiscountInPaise,
    totalTaxInPaise: totals.totalTaxInPaise,
    totalRoundOffInPaise: totals.totalRoundOffInPaise,
    billCount: totals.billCount,
    voidedBillCount: totals.voidedBillCount,
    voidedBillValueInPaise: totals.voidedBillValueInPaise,
    averageBillInPaise: averageOf(totals.grossSalesInPaise, totals.billCount),
    dineIn: { billCount: totals.dineInBillCount, salesInPaise: totals.dineInSalesInPaise },
    takeaway: { billCount: totals.takeawayBillCount, salesInPaise: totals.takeawaySalesInPaise },
  };
}

/* ---------------------------------------------------------------------- *
 * 3. Sales by day
 * ---------------------------------------------------------------------- */

/** Every "YYYY-MM-DD" from `from` to `to` inclusive, by string arithmetic. */
function eachBusinessDate(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * One row per business day, ascending.
 *
 * Days with no bills come back as zeros rather than being omitted. A chart
 * that skips empty days draws a continuous line across a closed Monday and
 * makes a quiet week look like a busy one.
 *
 * The gap filling walks the string dates, which is only simple because
 * `businessDate` is stored as a `"YYYY-MM-DD"` string rather than a `Date`
 * (DB-SCHEMA section 7). Nothing here parses a business date back into an
 * instant.
 */
export async function salesByDay(req, { from, to }) {
  const rows = await Bill.aggregate([
    liveInRange(req, { from, to }),
    {
      $group: {
        _id: '$businessDate',
        grossSalesInPaise: { $sum: '$grandTotalInPaise' },
        billCount: { $sum: 1 },
        totalDiscountInPaise: { $sum: { $ifNull: ['$discount.amountInPaise', 0] } },
      },
    },
  ]);

  const byDate = new Map(rows.map((row) => [row._id, row]));

  return eachBusinessDate(from, to).map((businessDate) => {
    const row = byDate.get(businessDate);
    const grossSalesInPaise = row?.grossSalesInPaise ?? 0;
    const billCount = row?.billCount ?? 0;

    return {
      businessDate,
      grossSalesInPaise,
      billCount,
      averageBillInPaise: averageOf(grossSalesInPaise, billCount),
      totalDiscountInPaise: row?.totalDiscountInPaise ?? 0,
    };
  });
}

/* ---------------------------------------------------------------------- *
 * 4. Hourly
 * ---------------------------------------------------------------------- */

/**
 * Sales by hour of the IST clock. Always twenty-four rows.
 *
 * The one report that groups on a real instant rather than on `businessDate`,
 * because "which hour was busy" is a question about clock time and a business
 * date has no hour in it.
 *
 * The conversion is done by MongoDB, with `$hour` and an explicit timezone,
 * not in JavaScript after fetching. Fetching every bill in a range to bucket
 * it in memory is the version that falls over on a year of data, and doing
 * the timezone maths by hand is how a report ends up showing an 8pm rush at
 * 2:30pm.
 */
export async function hourly(req, { from, to }) {
  const rows = await Bill.aggregate([
    liveInRange(req, { from, to }),
    {
      $group: {
        _id: { $hour: { date: '$billedAt', timezone: config.DISPLAY_TIMEZONE } },
        grossSalesInPaise: { $sum: '$grandTotalInPaise' },
        billCount: { $sum: 1 },
      },
    },
  ]);

  const byHour = new Map(rows.map((row) => [row._id, row]));

  return Array.from({ length: 24 }, (_unused, hourIst) => ({
    hourIst,
    grossSalesInPaise: byHour.get(hourIst)?.grossSalesInPaise ?? 0,
    billCount: byHour.get(hourIst)?.billCount ?? 0,
  }));
}

/* ---------------------------------------------------------------------- *
 * 5. Top items
 * ---------------------------------------------------------------------- */

/**
 * What sold, by quantity or by revenue.
 *
 * Read from `bills.lines`, not `orders.lines`. A bill's lines already exclude
 * cancelled order lines, because M3 filtered them at bill creation, so
 * grouping over bills gives the sold figure with no filter to forget.
 * Grouping over orders would need one and it would eventually be forgotten by
 * whoever adds the next report.
 *
 * `itemName` comes from the most recent bill line rather than from
 * `menuitems`, so a renamed dish shows its current name while its whole
 * history stays grouped under one `menuItemId`. Reading the live menu here
 * would also be the one thing this project's copied-values rule forbids.
 */
export function topItems(req, { from, to, limit, sort }) {
  const sortStage =
    sort === 'revenue' ? { revenueInPaise: -1, quantity: -1 } : { quantity: -1, revenueInPaise: -1 };

  return Bill.aggregate([
    liveInRange(req, { from, to }),
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.menuItemId',
        quantity: { $sum: '$lines.quantity' },
        revenueInPaise: { $sum: '$lines.lineTotalInPaise' },
        billCount: { $sum: 1 },
        // The name as it was on the newest bill this item appears on.
        latestName: { $top: { output: '$lines.itemName', sortBy: { billedAt: -1 } } },
      },
    },
    { $sort: sortStage },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        menuItemId: { $toString: '$_id' },
        itemName: '$latestName',
        quantity: 1,
        revenueInPaise: 1,
        billCount: 1,
      },
    },
  ]);
}

/* ---------------------------------------------------------------------- *
 * 6. Payment methods
 * ---------------------------------------------------------------------- */

const ALL_METHODS = ['CASH', 'UPI', 'CARD', 'OTHER'];

/**
 * What was collected, by method, plus what is still outstanding.
 *
 * OWNER only. The cash figure is the number a dishonest manager most wants to
 * see and most wants to control, which is the whole reason this report is
 * gated one role tighter than every other sales report in the module.
 *
 * All four methods always appear, with zeros where unused: a method silently
 * missing from a list reads as "no data" rather than "none taken", and those
 * are different answers.
 */
export async function paymentMethods(req, { from, to }) {
  const collected = await Bill.aggregate([
    liveInRange(req, { from, to }),
    { $unwind: '$payments' },
    {
      $group: {
        _id: '$payments.method',
        amountInPaise: { $sum: '$payments.amountInPaise' },
        paymentCount: { $sum: 1 },
      },
    },
  ]);

  const [unpaid] = await Bill.aggregate([
    { $match: { ...liveInRange(req, { from, to }).$match, status: 'UNPAID' } },
    {
      $group: {
        _id: null,
        unpaidInPaise: { $sum: { $subtract: ['$grandTotalInPaise', '$amountPaidInPaise'] } },
      },
    },
  ]);

  const byMethod = new Map(collected.map((row) => [row._id, row]));
  // P08: methods are configured, so any other code that was used is listed
  // after the four built-ins rather than silently left out of the total.
  const others = [...byMethod.keys()].filter((code) => !ALL_METHODS.includes(code)).sort();
  const methods = [...ALL_METHODS, ...others].map((method) => ({
    method,
    amountInPaise: byMethod.get(method)?.amountInPaise ?? 0,
    paymentCount: byMethod.get(method)?.paymentCount ?? 0,
  }));

  return {
    from,
    to,
    methods,
    totalCollectedInPaise: methods.reduce((total, row) => total + row.amountInPaise, 0),
    unpaidInPaise: unpaid?.unpaidInPaise ?? 0,
  };
}

/* ---------------------------------------------------------------------- *
 * 7. Tax summary
 * ---------------------------------------------------------------------- */

/**
 * The number an accountant files from.
 *
 * SUMS STORED VALUES. Never recomputes. M3 worked the tax out once per slab
 * under a documented rounding rule and froze it onto the bill; recalculating
 * it here from line totals would disagree with the printed bill by a rupee
 * and there would be no way to tell an auditor which of the two was right.
 *
 * A slab with no sales in the range is omitted rather than returned as a zero
 * row -- unlike the twenty-four hours or the gap-filled days, a tax slab that
 * did not occur is genuinely absent from the return, not a quiet period.
 */
export async function taxSummary(req, { from, to }) {
  const slabs = await Bill.aggregate([
    liveInRange(req, { from, to }),
    { $unwind: '$taxBreakdown' },
    {
      $group: {
        _id: '$taxBreakdown.taxRateBps',
        taxableInPaise: { $sum: '$taxBreakdown.taxableInPaise' },
        cgstInPaise: { $sum: '$taxBreakdown.cgstInPaise' },
        sgstInPaise: { $sum: '$taxBreakdown.sgstInPaise' },
        taxInPaise: { $sum: '$taxBreakdown.taxInPaise' },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        taxRateBps: '$_id',
        taxableInPaise: 1,
        cgstInPaise: 1,
        sgstInPaise: 1,
        taxInPaise: 1,
      },
    },
  ]);

  return {
    from,
    to,
    slabs,
    totalTaxableInPaise: slabs.reduce((total, slab) => total + slab.taxableInPaise, 0),
    totalCgstInPaise: slabs.reduce((total, slab) => total + slab.cgstInPaise, 0),
    totalSgstInPaise: slabs.reduce((total, slab) => total + slab.sgstInPaise, 0),
    totalTaxInPaise: slabs.reduce((total, slab) => total + slab.taxInPaise, 0),
  };
}

/* ---------------------------------------------------------------------- *
 * 8. Discounts
 * ---------------------------------------------------------------------- */

/**
 * How much was given away, and by whom.
 *
 * `byUser` is the point of this report. "How much did each person discount"
 * is what an owner actually wants and cannot get from anywhere else, and it
 * is the same instinct behind M8's planned trust summary.
 *
 * Read from `bills.discount`, not from `auditlogs`. The bill is the
 * authoritative record of what was actually charged; the audit log is the
 * trail of who did it. They should agree, and if they ever disagree the bill
 * is right, so the money figure comes from the bill.
 */
export async function discounts(req, { from, to, page, limit }) {
  const discounted = {
    ...liveInRange(req, { from, to }).$match,
    discount: { $ne: null },
  };

  const [totals] = await Bill.aggregate([
    { $match: discounted },
    {
      $group: {
        _id: null,
        totalDiscountInPaise: { $sum: '$discount.amountInPaise' },
        discountedBillCount: { $sum: 1 },
        subtotalOfDiscountedInPaise: { $sum: '$subtotalInPaise' },
      },
    },
  ]);

  const byUser = await Bill.aggregate([
    { $match: discounted },
    {
      $group: {
        _id: '$discount.appliedBy',
        amountInPaise: { $sum: '$discount.amountInPaise' },
        billCount: { $sum: 1 },
      },
    },
    { $sort: { amountInPaise: -1 } },
    {
      $lookup: {
        from: 'users',
        // Batched, not one query per row: the N+1 read problem BUILD-PLAN
        // names, and a discount report is exactly where it would appear.
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    {
      $project: {
        _id: 0,
        userId: { $toString: '$_id' },
        name: { $ifNull: [{ $first: '$user.name' }, 'Unknown user'] },
        amountInPaise: 1,
        billCount: 1,
      },
    },
  ]);

  const [recent, recentTotal] = await Promise.all([
    Bill.aggregate([
      { $match: discounted },
      { $sort: { 'discount.appliedAt': -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $lookup: { from: 'users', localField: 'discount.appliedBy', foreignField: '_id', as: 'user' } },
      {
        $project: {
          _id: 0,
          billId: { $toString: '$_id' },
          billNumber: 1,
          businessDate: 1,
          amountInPaise: '$discount.amountInPaise',
          reason: '$discount.reason',
          reasonCode: '$discount.reasonCode',
          appliedBy: { $ifNull: [{ $first: '$user.name' }, 'Unknown user'] },
          appliedAt: '$discount.appliedAt',
        },
      },
    ]),
    Bill.countDocuments(discounted),
  ]);

  // P08: the reason reads as its label and note; older discounts keep their text.
  for (const row of recent) {
    row.reason = discountReasonText(row);
    delete row.reasonCode;
  }

  const totalDiscountInPaise = totals?.totalDiscountInPaise ?? 0;
  const subtotalOfDiscounted = totals?.subtotalOfDiscountedInPaise ?? 0;

  return {
    data: {
      from,
      to,
      totalDiscountInPaise,
      discountedBillCount: totals?.discountedBillCount ?? 0,
      /**
       * Basis points, integer, the same convention as every other rate in
       * this project. Measured against the subtotal of the bills that were
       * actually discounted, not against all sales: "we discount 27% of what
       * we discount" is a number about discounting behaviour, which is what
       * this report is for.
       */
      discountAsPercentOfSubtotalBps:
        subtotalOfDiscounted > 0
          ? Math.round((totalDiscountInPaise * 10000) / subtotalOfDiscounted)
          : 0,
      byUser,
      recent,
    },
    meta: { page, limit, total: recentTotal },
  };
}

/* ---------------------------------------------------------------------- *
 * Dashboard pieces that read bills and orders
 * ---------------------------------------------------------------------- */

/** Today's headline sales figures, for the dashboard. */
export async function salesForDate(req, businessDate) {
  const summary = await salesSummary(req, { from: businessDate, to: businessDate });

  return {
    grossSalesInPaise: summary.grossSalesInPaise,
    billCount: summary.billCount,
    averageBillInPaise: summary.averageBillInPaise,
    totalTaxInPaise: summary.totalTaxInPaise,
    totalDiscountInPaise: summary.totalDiscountInPaise,
  };
}

/**
 * Orders still on the floor, with what they are worth so far.
 *
 * `OCCUPYING_ORDER_STATUSES` from M2 is the single definition of "still on the
 * floor" -- OPEN and READY_TO_BILL -- reused rather than restated, so this
 * cannot drift from the table occupancy the floor screen shows.
 *
 * The running value sums live lines only. A cancelled line keeps its snapshot
 * on the order as evidence but nobody is paying for it, exactly as M2's own
 * `serialiseOrder` treats it.
 */
export async function openOrders(req) {
  const [row] = await Order.aggregate([
    tenantMatch(req, { status: { $in: [...OCCUPYING_ORDER_STATUSES] } }),
    {
      $addFields: {
        liveLines: {
          $filter: { input: '$lines', as: 'line', cond: { $ne: ['$$line.status', 'CANCELLED'] } },
        },
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        runningValueInPaise: {
          $sum: {
            $reduce: {
              input: '$liveLines',
              initialValue: 0,
              in: {
                $add: [
                  '$$value',
                  {
                    $multiply: [
                      {
                        $add: [
                          '$$this.unitPriceInPaise',
                          { $sum: '$$this.addOns.priceInPaise' },
                        ],
                      },
                      '$$this.quantity',
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    },
  ]);

  return { count: row?.count ?? 0, runningValueInPaise: row?.runningValueInPaise ?? 0 };
}

/** Bills billed but not yet settled. The cashier's outstanding list, as a total. */
export async function unpaidBills(req, businessDate) {
  const [row] = await Bill.aggregate([
    {
      $match: {
        ...liveInRange(req, { from: businessDate, to: businessDate }).$match,
        status: 'UNPAID',
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        amountInPaise: { $sum: { $subtract: ['$grandTotalInPaise', '$amountPaidInPaise'] } },
      },
    },
  ]);

  return { count: row?.count ?? 0, amountInPaise: row?.amountInPaise ?? 0 };
}

export default {
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
};
