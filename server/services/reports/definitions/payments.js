/**
 * R5 Payments. M19, built in P15. docs/API-CONTRACT.md "M19" R5. OWNER only.
 *
 * Money by the day it arrived: each payment counts on its own frozen
 * `businessDate` (a null reads as its bill's), so B14's payment at 12:02 AM on
 * 27 September counts on 26 September. One column per method: every active
 * method and every method used in the range, zeros where unused, labelled with
 * the payments' frozen names. On Hold is what was charged to accounts on bills
 * of each date; collections are in their own section and are never sales.
 */
import { Account } from '../../../models/Account.js';
import { ACCOUNT_ENTRY_TYPES, AccountEntry } from '../../../models/AccountEntry.js';
import { Bill, BILL_STATUSES } from '../../../models/Bill.js';
import { sumPaise } from '../../../utils/money.js';
import { scoped, scopedForAggregate } from '../../../utils/scopedQuery.js';
import { datesBetween, runRangeChecks } from '../../reconciliationService.js';
import { LABELS } from '../labels.js';
import { reportQuery } from '../params.js';
import { OWNER_ONLY, toBills } from './shared.js';

const baseColumns = {
  date: { key: 'businessDate', label: LABELS.BUSINESS_DATE, type: 'date' },
  inHand: { key: 'inHandInPaise', label: LABELS.MONEY_IN_HAND, type: 'money' },
  platform: { key: 'platformInPaise', label: LABELS.PLATFORM_MONEY, type: 'money' },
  onHold: { key: 'onHoldInPaise', label: LABELS.ON_HOLD, type: 'money' },
  unpaid: { key: 'unpaidInPaise', label: LABELS.UNPAID, type: 'money' },
  total: { key: 'billTotalInPaise', label: LABELS.BILL_TOTAL, type: 'money' },
};

const collectionColumns = [
  { key: 'businessDate', label: LABELS.BUSINESS_DATE, type: 'date' },
  { key: 'accountName', label: LABELS.ACCOUNT, type: 'text' },
  { key: 'methodName', label: LABELS.PAYMENT_METHOD, type: 'text' },
  { key: 'amountInPaise', label: LABELS.COLLECTION, type: 'money' },
];

export default {
  id: 'R5',
  name: 'payments',
  title: 'Payments',
  roles: OWNER_ONLY,
  schema: reportQuery([]),
  filters: [],
  dimensions: [],
  columns: Object.values(baseColumns),

  async query(req, baseMatch, params, ctx) {
    const { from, to } = params;
    const tenant = scopedForAggregate(req);

    const payments = await Bill.aggregate([
      { $match: { ...tenant, isVoided: false, $or: [{ 'payments.businessDate': { $gte: from, $lte: to } }, { businessDate: { $gte: from, $lte: to } }] } },
      { $unwind: '$payments' },
      { $addFields: { paymentDate: { $ifNull: ['$payments.businessDate', '$businessDate'] } } },
      { $match: { paymentDate: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { date: '$paymentDate', method: '$payments.method' },
          amountInPaise: { $sum: '$payments.amountInPaise' },
          methodName: { $last: { $ifNull: ['$payments.methodName', '$payments.method'] } },
          methodKind: { $last: { $ifNull: ['$payments.methodKind', 'IN_HAND'] } },
        },
      },
    ]);

    const bills = await Bill.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: '$businessDate',
          billTotalInPaise: { $sum: '$grandTotalInPaise' },
          onHoldInPaise: { $sum: { $ifNull: ['$chargedToAccountInPaise', 0] } },
          unpaidInPaise: {
            $sum: {
              $cond: [
                { $eq: ['$status', BILL_STATUSES.UNPAID] },
                { $subtract: ['$grandTotalInPaise', { $sum: '$payments.amountInPaise' }] },
                0,
              ],
            },
          },
        },
      },
    ]);
    const billsByDate = new Map(bills.map(({ _id, ...row }) => [_id, row]));

    // Columns: every active method, then any other method used in the range.
    const configured = await ctx.paymentMethods();
    const methods = new Map();
    for (const method of configured.filter((entry) => entry.isActive)) {
      methods.set(method.code, { code: method.code, name: method.name, kind: method.kind });
    }
    for (const row of payments) {
      if (!methods.has(row._id.method)) methods.set(row._id.method, { code: row._id.method, name: row.methodName, kind: row.methodKind });
    }
    // The column's label is the frozen name the payments carry, where any exist.
    for (const row of payments) methods.get(row._id.method).name = row.methodName;
    const inHand = [...methods.values()].filter((method) => method.kind === 'IN_HAND');
    const platform = [...methods.values()].filter((method) => method.kind === 'PLATFORM');

    const openDays = new Set(await ctx.openDays());
    const rows = datesBetween(from, to).map((date) => {
      const row = { businessDate: date, drill: {} };
      for (const method of [...inHand, ...platform]) {
        row[method.code] = sumPaise(0, ...payments.filter((entry) => entry._id.date === date && entry._id.method === method.code).map((entry) => entry.amountInPaise));
        row.drill[method.code] = toBills({ from: date, to: date, method: method.code });
      }
      row.inHandInPaise = sumPaise(0, ...inHand.map((method) => row[method.code]));
      row.platformInPaise = sumPaise(0, ...platform.map((method) => row[method.code]));
      const billRow = billsByDate.get(date) ?? { billTotalInPaise: 0, onHoldInPaise: 0, unpaidInPaise: 0 };
      row.onHoldInPaise = billRow.onHoldInPaise;
      row.unpaidInPaise = openDays.has(date) ? billRow.unpaidInPaise : 0;
      row.billTotalInPaise = billRow.billTotalInPaise;
      row.drill.onHoldInPaise = toBills({ from: date, to: date, status: 'ON_ACCOUNT' });
      row.drill.billTotalInPaise = toBills({ from: date, to: date });
      return row;
    });

    const moneyKeys = [...inHand, ...platform].map((method) => method.code).concat(['inHandInPaise', 'platformInPaise', 'onHoldInPaise', 'unpaidInPaise', 'billTotalInPaise']);
    const totals = Object.fromEntries(moneyKeys.map((key) => [key, sumPaise(0, ...rows.map((row) => row[key]))]));

    const columns = [
      baseColumns.date,
      ...inHand.map((method) => ({ key: method.code, label: method.name, type: 'money' })),
      baseColumns.inHand,
      ...platform.map((method) => ({ key: method.code, label: method.name, type: 'money' })),
      baseColumns.platform,
      baseColumns.onHold,
      baseColumns.unpaid,
      baseColumns.total,
    ];

    const entries = await AccountEntry.find({ ...scoped(req), type: ACCOUNT_ENTRY_TYPES.COLLECTION, businessDate: { $gte: from, $lte: to } })
      .sort({ at: 1 })
      .lean();
    const accounts = await Account.find({ ...scoped(req), _id: { $in: [...new Set(entries.map((entry) => String(entry.accountId)))] } }).select('name').lean();
    const accountName = new Map(accounts.map((account) => [String(account._id), account.name]));
    const collections = entries.map((entry) => ({
      businessDate: entry.businessDate,
      accountName: accountName.get(String(entry.accountId)) ?? 'Unknown account',
      methodName: entry.methodName ?? entry.method,
      amountInPaise: entry.amountInPaise,
      drill: { amountInPaise: { report: 'R17', query: { accountId: String(entry.accountId) } } },
    }));

    return {
      sections: [
        { key: 'days', title: 'Payments', columns, rows, totals },
        { key: 'collections', title: 'Collections', columns: collectionColumns, rows: collections, totals: { amountInPaise: sumPaise(0, ...collections.map((row) => row.amountInPaise)) } },
      ],
    };
  },

  checks(req, params) {
    return runRangeChecks(req, { from: params.from, to: params.to }, ['C3', 'C4']);
  },
};
