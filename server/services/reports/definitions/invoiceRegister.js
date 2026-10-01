/**
 * R10 Invoice Register. M19, built in P15. docs/API-CONTRACT.md "M19" R10.
 *
 * Every bill, voided included, in series then sequence order. A number missing
 * between the first and last of a series is its own row, "Missing number". A
 * null invoiceSeries belongs to its financial year's series.
 */
import { BILL_VOID_REASONS, reasonText } from '../../../config/cancelReasons.js';
import { Bill } from '../../../models/Bill.js';
import { sumPaise } from '../../../utils/money.js';
import { numberInSeries, seriesOf } from '../../dayFiguresService.js';
import { runRangeChecks } from '../../reconciliationService.js';
import { LABELS } from '../labels.js';
import { reportQuery } from '../params.js';
import { MANAGERS, toBills } from './shared.js';

const ORDER_TYPE_WORDS = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };
const STATUS_WORDS = { UNPAID: 'Unpaid', PAID: 'Paid', ON_ACCOUNT: 'On Hold' };

const columns = [
  { key: 'billNumber', label: LABELS.INVOICE_NUMBER, type: 'text' },
  { key: 'businessDate', label: LABELS.BUSINESS_DATE, type: 'date' },
  { key: 'billedAt', label: LABELS.TIME_ISSUED, type: 'time' },
  { key: 'orderType', label: LABELS.ORDER_TYPE, type: 'text' },
  { key: 'tableName', label: LABELS.TABLE, type: 'text' },
  { key: 'billTotalInPaise', label: LABELS.BILL_TOTAL, type: 'money' },
  { key: 'status', label: LABELS.STATUS, type: 'text' },
  { key: 'voidReason', label: LABELS.VOID_REASON, type: 'text' },
];

export default {
  id: 'R10',
  name: 'invoice-register',
  title: 'Invoice Register',
  roles: MANAGERS,
  schema: reportQuery([], { paged: true }),
  filters: [],
  dimensions: [],
  columns,
  includesVoided: () => true,

  async query(req, baseMatch, params) {
    const bills = await Bill.find(baseMatch)
      .select('billNumber billSequence invoiceSeries financialYear businessDate billedAt orderType tableName grandTotalInPaise status isVoided voidReasonCode voidReason')
      .lean();

    const bySeries = new Map();
    for (const bill of bills) bySeries.set(seriesOf(bill), [...(bySeries.get(seriesOf(bill)) ?? []), bill]);

    const all = [];
    for (const series of [...bySeries.keys()].sort()) {
      const list = bySeries.get(series).sort((a, b) => a.billSequence - b.billSequence);
      for (let index = 0; index < list.length; index += 1) {
        const bill = list[index];
        const previous = list[index - 1];
        if (previous) {
          for (let sequence = previous.billSequence + 1; sequence < bill.billSequence; sequence += 1) {
            all.push({ billNumber: numberInSeries(series, sequence), status: 'Missing number', missing: true });
          }
        }
        all.push({
          billNumber: bill.billNumber,
          businessDate: bill.businessDate,
          billedAt: bill.billedAt,
          orderType: ORDER_TYPE_WORDS[bill.orderType] ?? bill.orderType,
          tableName: bill.tableName ?? null,
          billTotalInPaise: bill.grandTotalInPaise,
          status: bill.isVoided ? 'Voided' : STATUS_WORDS[bill.status] ?? bill.status,
          voidReason: bill.isVoided
            ? bill.voidReasonCode ? reasonText(BILL_VOID_REASONS, bill.voidReasonCode, bill.voidReason) : bill.voidReason
            : null,
          drill: { billTotalInPaise: toBills({ from: bill.businessDate, to: bill.businessDate, billNumber: bill.billNumber, ...(bill.isVoided ? { status: 'VOIDED' } : {}) }) },
        });
      }
    }

    const { page, limit } = params;
    const live = all.filter((row) => !row.missing && row.status !== 'Voided');
    return {
      rows: all.slice((page - 1) * limit, page * limit),
      totals: {
        issued: all.filter((row) => !row.missing).length,
        voided: all.filter((row) => row.status === 'Voided').length,
        missing: all.filter((row) => row.missing).length,
        billTotalInPaise: sumPaise(0, ...live.map((row) => row.billTotalInPaise)),
      },
      meta: { page, limit, total: all.length },
    };
  },

  checks(req, params) {
    return runRangeChecks(req, { from: params.from, to: params.to }, ['C6']);
  },
};
