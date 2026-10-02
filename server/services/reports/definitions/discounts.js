/**
 * R14 Discounts. M19, built in P17. docs/API-CONTRACT.md "M19" R14.
 *
 * Every live bill with a discount, from the discount frozen on the bill: its
 * fixed reason code (P08), who applied it, and the amount. Sections by reason,
 * by person, and the bills themselves, paged.
 *
 * Words matter here more than anywhere: "Item total before discount" and "Bill
 * total after discount" are named in full, never "order amount", which is how
 * Caffeza's old system used one word for two numbers. Percent off is discount
 * over item total, in basis points, a total over a total for any group.
 */
import { DISCOUNT_REASONS, discountReasonText } from '../../../config/discountReasons.js';
import { Bill } from '../../../models/Bill.js';
import { averagePaise, sumPaise } from '../../../utils/money.js';
import { runRangeChecks } from '../../reconciliationService.js';
import { LABELS } from '../labels.js';
import { reportQuery } from '../params.js';
import { MANAGERS, toBills } from './shared.js';

const FUNDED_BY_WORDS = { RESTAURANT: 'Restaurant', PLATFORM: 'Platform' };

/** Discount over item total, in basis points. A ratio of two totals, rounded half away from zero. */
const percentOff = (discountInPaise, itemTotalInPaise) => averagePaise(discountInPaise * 10_000, itemTotalInPaise);

const reasonLabel = (code) => DISCOUNT_REASONS.find((reason) => reason.code === code)?.label ?? 'Not recorded';

const byReasonColumns = [
  { key: 'name', label: LABELS.DISCOUNT_REASON, type: 'text' },
  { key: 'billCount', label: LABELS.BILLS, type: 'count' },
  { key: 'discountInPaise', label: LABELS.DISCOUNT, type: 'money' },
  { key: 'percentOffBps', label: LABELS.PERCENT_OFF, type: 'percent' },
];

const byPersonColumns = [
  { key: 'name', label: LABELS.APPLIED_BY, type: 'text' },
  { key: 'billCount', label: LABELS.BILLS, type: 'count' },
  { key: 'discountInPaise', label: LABELS.DISCOUNT, type: 'money' },
];

const billColumns = [
  { key: 'billNumber', label: LABELS.INVOICE_NUMBER, type: 'text' },
  { key: 'billedAt', label: LABELS.TIME_ISSUED, type: 'time' },
  { key: 'tableName', label: LABELS.TABLE, type: 'text' },
  { key: 'captainName', label: LABELS.CAPTAIN, type: 'text' },
  { key: 'itemTotalInPaise', label: LABELS.ITEM_TOTAL_BEFORE_DISCOUNT, type: 'money' },
  { key: 'discountInPaise', label: LABELS.DISCOUNT, type: 'money' },
  { key: 'percentOffBps', label: LABELS.PERCENT_OFF, type: 'percent' },
  { key: 'billTotalInPaise', label: LABELS.BILL_TOTAL_AFTER_DISCOUNT, type: 'money' },
  { key: 'reason', label: LABELS.DISCOUNT_REASON, type: 'text' },
  { key: 'fundedBy', label: LABELS.DISCOUNT_FUNDED_BY, type: 'text' },
];

/** Adds up a group of bills: count, item total, discount, and percent off from those totals. */
function group(bills) {
  const itemTotalInPaise = sumPaise(0, ...bills.map((bill) => bill.subtotalInPaise));
  const discountInPaise = sumPaise(0, ...bills.map((bill) => bill.discount.amountInPaise));
  return { billCount: bills.length, itemTotalInPaise, discountInPaise, percentOffBps: percentOff(discountInPaise, itemTotalInPaise) };
}

export default {
  id: 'R14',
  name: 'discounts',
  title: 'Discounts',
  roles: MANAGERS,
  schema: reportQuery(['discountReason'], { paged: true }),
  filters: ['discountReason'],
  dimensions: ['discountReason'],
  columns: billColumns,

  async query(req, baseMatch, params, ctx) {
    const bills = await Bill.find({
      ...baseMatch,
      'discount.amountInPaise': { $gt: 0 },
      ...(params.discountReason ? { 'discount.reasonCode': params.discountReason } : {}),
    })
      .sort({ billedAt: 1, billSequence: 1 })
      .select('billNumber billedAt orderType tableName platform captainName subtotalInPaise grandTotalInPaise discount')
      .lean();

    const range = { from: params.from, to: params.to };
    const names = await ctx.personNames(bills.map((bill) => bill.discount.appliedBy));

    const reasons = new Map();
    const people = new Map();
    for (const bill of bills) {
      const reasonKey = bill.discount.reasonCode ?? null;
      reasons.set(reasonKey, [...(reasons.get(reasonKey) ?? []), bill]);
      const personKey = String(bill.discount.appliedBy);
      people.set(personKey, [...(people.get(personKey) ?? []), bill]);
    }

    // By reason, in the order of the fixed list, so the screen never reshuffles.
    const order = (code) => {
      const index = DISCOUNT_REASONS.findIndex((reason) => reason.code === code);
      return index === -1 ? DISCOUNT_REASONS.length : index;
    };
    const byReasonRows = [...reasons.entries()]
      .sort(([a], [b]) => order(a) - order(b))
      .map(([code, list]) => ({
        name: reasonLabel(code),
        ...group(list),
        ...(code ? { drill: { billCount: toBills({ ...range, hasDiscount: true, discountReason: code }), discountInPaise: toBills({ ...range, hasDiscount: true, discountReason: code }) } } : {}),
      }));

    const byPersonRows = [...people.entries()]
      .map(([id, list]) => ({ name: names.get(id) ?? 'Unknown', ...group(list) }))
      .sort((a, b) => b.discountInPaise - a.discountInPaise || a.name.localeCompare(b.name));

    const all = group(bills);
    const billRows = bills.map((bill) => ({
      billNumber: bill.billNumber,
      billedAt: bill.billedAt,
      tableName: bill.tableName ?? (bill.platform ? `${bill.platform.name} ${bill.platform.orderId}` : bill.orderType === 'TAKEAWAY' ? 'Takeaway' : null),
      captainName: bill.captainName ?? null,
      itemTotalInPaise: bill.subtotalInPaise,
      discountInPaise: bill.discount.amountInPaise,
      percentOffBps: percentOff(bill.discount.amountInPaise, bill.subtotalInPaise),
      billTotalInPaise: bill.grandTotalInPaise,
      reason: discountReasonText(bill.discount),
      fundedBy: FUNDED_BY_WORDS[bill.discount.fundedBy] ?? bill.discount.fundedBy,
      drill: { billNumber: toBills({ ...range, billNumber: bill.billNumber }) },
    }));

    const { page, limit } = params;
    const billTotals = {
      itemTotalInPaise: all.itemTotalInPaise,
      discountInPaise: all.discountInPaise,
      percentOffBps: all.percentOffBps,
      billTotalInPaise: sumPaise(0, ...bills.map((bill) => bill.grandTotalInPaise)),
    };
    const counted = { billCount: all.billCount, discountInPaise: all.discountInPaise };

    return {
      sections: [
        { key: 'byReason', title: 'By reason', columns: byReasonColumns, rows: byReasonRows, totals: { ...counted, percentOffBps: all.percentOffBps } },
        { key: 'byPerson', title: 'By person', columns: byPersonColumns, rows: byPersonRows, totals: counted },
        { key: 'bills', title: 'Bills', columns: billColumns, rows: billRows.slice((page - 1) * limit, page * limit), totals: billTotals },
      ],
      meta: { page, limit, total: billRows.length },
    };
  },

  checks(req, params) {
    return runRangeChecks(req, { from: params.from, to: params.to }, ['C1', 'C2']);
  },
};
