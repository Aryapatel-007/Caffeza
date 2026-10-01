/**
 * R6 Platform Money. M19, built in P15. docs/API-CONTRACT.md "M19" R6.
 *
 * One row per live payout batch whose period overlaps the range, with its
 * expected payout from payoutService.expectedFor, which reads each covered
 * payment's frozen commission. Below, every platform payment in the range that
 * no live payout covers yet. A payment with no commission rate is listed as
 * "rate not set" and never estimated.
 */
import { Bill } from '../../../models/Bill.js';
import { PlatformPayout } from '../../../models/PlatformPayout.js';
import { applyBasisPoints, sumPaise } from '../../../utils/money.js';
import { scoped, scopedForAggregate } from '../../../utils/scopedQuery.js';
import { expectedFor } from '../../payoutService.js';
import { runRangeChecks } from '../../reconciliationService.js';
import { LABELS } from '../labels.js';
import { reportQuery } from '../params.js';
import { MANAGERS, toBills } from './shared.js';

const payoutColumns = [
  { key: 'methodName', label: LABELS.PLATFORM, type: 'text' },
  { key: 'period', label: LABELS.PERIOD, type: 'text' },
  { key: 'paymentCount', label: LABELS.BILLS, type: 'count' },
  { key: 'amountReceivedInPaise', label: LABELS.RECEIVED_PAYOUT, type: 'money' },
  { key: 'expectedInPaise', label: LABELS.EXPECTED_PAYOUT, type: 'money' },
  { key: 'differenceInPaise', label: LABELS.PAYOUT_DIFFERENCE, type: 'money' },
  { key: 'rateNotSetCount', label: LABELS.COMMISSION, type: 'count' },
];

const uncoveredColumns = [
  { key: 'billNumber', label: LABELS.INVOICE_NUMBER, type: 'text' },
  { key: 'businessDate', label: LABELS.BUSINESS_DATE, type: 'date' },
  { key: 'methodName', label: LABELS.PLATFORM, type: 'text' },
  { key: 'platformOrderId', label: LABELS.PLATFORM_ORDER_ID, type: 'text' },
  { key: 'amountInPaise', label: LABELS.BILL_TOTAL, type: 'money' },
  { key: 'commission', label: LABELS.COMMISSION, type: 'text' },
  { key: 'expectedInPaise', label: LABELS.EXPECTED_PAYOUT, type: 'money' },
];

export default {
  id: 'R6',
  name: 'platform-money',
  title: 'Platform Money',
  roles: MANAGERS,
  schema: reportQuery(['method']),
  filters: ['method'],
  dimensions: [],
  columns: payoutColumns,

  async query(req, baseMatch, params) {
    const { from, to } = params;
    const payouts = await PlatformPayout.find({
      ...scoped(req),
      isVoided: false,
      periodFrom: { $lte: to },
      periodTo: { $gte: from },
      ...(params.method ? { method: params.method } : {}),
    })
      .sort({ periodFrom: 1 })
      .lean();

    const payoutRows = [];
    for (const payout of payouts) {
      const expected = await expectedFor(req, payout);
      payoutRows.push({
        payoutId: String(payout._id),
        methodName: payout.methodName,
        period: payout.periodFrom === payout.periodTo ? payout.periodFrom : `${payout.periodFrom} to ${payout.periodTo}`,
        paymentCount: expected.includedPaymentCount + expected.rateNotSet.length,
        amountReceivedInPaise: payout.amountReceivedInPaise,
        expectedInPaise: expected.expectedInPaise,
        differenceInPaise: payout.amountReceivedInPaise - expected.expectedInPaise,
        rateNotSetCount: expected.rateNotSet.length,
        rateNotSet: expected.rateNotSet,
        drill: { paymentCount: toBills({ from: payout.periodFrom, to: payout.periodTo, method: payout.method }) },
        method: payout.method,
        periodFrom: payout.periodFrom,
        periodTo: payout.periodTo,
      });
    }

    const platformPayments = await Bill.aggregate([
      { $match: { ...scopedForAggregate(req), isVoided: false, 'payments.methodKind': 'PLATFORM' } },
      { $unwind: '$payments' },
      { $addFields: { paymentDate: { $ifNull: ['$payments.businessDate', '$businessDate'] } } },
      {
        $match: {
          'payments.methodKind': 'PLATFORM',
          paymentDate: { $gte: from, $lte: to },
          ...(params.method ? { 'payments.method': params.method } : {}),
        },
      },
      { $sort: { 'payments.receivedAt': 1 } },
      {
        $project: {
          _id: 0,
          billNumber: 1,
          businessDate: '$paymentDate',
          method: '$payments.method',
          methodName: { $ifNull: ['$payments.methodName', '$payments.method'] },
          platformOrderId: '$platform.orderId',
          amountInPaise: '$payments.amountInPaise',
          commissionBps: { $ifNull: ['$payments.commissionBps', null] },
        },
      },
    ]);

    const covered = (payment) =>
      payoutRows.some((payout) => payout.method === payment.method && payout.periodFrom <= payment.businessDate && payout.periodTo >= payment.businessDate);
    const uncovered = platformPayments.filter((payment) => !covered(payment)).map((payment) => ({
      ...payment,
      platformOrderId: payment.platformOrderId ?? null,
      commission: payment.commissionBps === null ? 'Rate not set' : `${payment.commissionBps / 100}%`,
      expectedInPaise: payment.commissionBps === null ? null : applyBasisPoints(payment.amountInPaise, 10000 - payment.commissionBps),
      drill: { amountInPaise: toBills({ billNumber: payment.billNumber, from: payment.businessDate, to: payment.businessDate }) },
    }));

    const sum = (rows, key) => sumPaise(0, ...rows.map((row) => row[key] ?? 0));
    return {
      sections: [
        {
          key: 'payouts',
          title: 'Payouts',
          columns: payoutColumns,
          rows: payoutRows,
          totals: {
            paymentCount: payoutRows.reduce((total, row) => total + row.paymentCount, 0),
            amountReceivedInPaise: sum(payoutRows, 'amountReceivedInPaise'),
            expectedInPaise: sum(payoutRows, 'expectedInPaise'),
            differenceInPaise: sum(payoutRows, 'differenceInPaise'),
            rateNotSetCount: payoutRows.reduce((total, row) => total + row.rateNotSetCount, 0),
          },
        },
        {
          key: 'uncovered',
          title: 'Not yet paid out',
          columns: uncoveredColumns,
          rows: uncovered,
          totals: { amountInPaise: sum(uncovered, 'amountInPaise'), expectedInPaise: sum(uncovered, 'expectedInPaise') },
        },
      ],
    };
  },

  checks(req, params) {
    return runRangeChecks(req, { from: params.from, to: params.to }, ['C11']);
  },
};
