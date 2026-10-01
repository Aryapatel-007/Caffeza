/**
 * R9 Tally Export. M19, built in P15. docs/API-CONTRACT.md "M19" R9.
 *
 * A file only, in the shape Caffeza's accountant imports. Two sheets:
 *
 *   Sales by rate: each rate's net sales, CGST and SGST straight from the
 *   bills' taxBreakdown, the platform's 0% as "Sales 0%", round-off on its own
 *   row.
 *
 *   Sales by payment method: each bill's net sales, CGST and SGST divided
 *   across its payments, its account charge and any unpaid part by
 *   splitBillAcrossPayments in utils/tax.js, then added up by frozen method
 *   code with its frozen Tally code. On Hold uses the Tally code P03.
 *
 * Both sheets always total the same net sales, CGST and SGST. The export
 * refuses to build while any ERROR check fails.
 */
import { z } from 'zod';

import { Bill } from '../../../models/Bill.js';
import { sumPaise } from '../../../utils/money.js';
import { splitBillAcrossPayments } from '../../../utils/tax.js';
import { checkC5, runRangeChecks } from '../../reconciliationService.js';
import { LABELS } from '../labels.js';
import { MANAGERS } from './shared.js';
import { businessDate } from '../../../validators/common.js';

/** Caffeza's Tally code for On Hold, from docs/CAFFEZA-PROFILE.md section 10, fixed by the contract. */
export const ON_HOLD_TALLY_CODE = 'P03';

const rateColumns = [
  { key: 'taxRate', label: LABELS.TAX_RATE, type: 'text' },
  { key: 'netSalesInPaise', label: LABELS.NET_SALES, type: 'money' },
  { key: 'cgstInPaise', label: LABELS.CGST, type: 'money' },
  { key: 'sgstInPaise', label: LABELS.SGST, type: 'money' },
  { key: 'billTotalInPaise', label: LABELS.BILL_TOTAL, type: 'money' },
];

const methodColumns = [
  { key: 'tallyLedgerCode', label: LABELS.TALLY_CODE, type: 'text' },
  { key: 'methodName', label: LABELS.PAYMENT_METHOD, type: 'text' },
  { key: 'netSalesInPaise', label: LABELS.NET_SALES, type: 'money' },
  { key: 'cgstInPaise', label: LABELS.CGST, type: 'money' },
  { key: 'sgstInPaise', label: LABELS.SGST, type: 'money' },
  { key: 'billTotalInPaise', label: LABELS.BILL_TOTAL, type: 'money' },
];

const SUMMED = ['netSalesInPaise', 'cgstInPaise', 'sgstInPaise', 'billTotalInPaise'];
const totalOf = (rows) => Object.fromEntries(SUMMED.map((key) => [key, sumPaise(0, ...rows.map((row) => row[key] ?? 0))]));

export default {
  id: 'R9',
  name: 'tally-export',
  title: 'Tally Export',
  roles: MANAGERS,
  // A file only: json is refused with a 400 by the schema.
  schema: z
    .object({ from: businessDate, to: businessDate, format: z.literal('xlsx', { error: 'The Tally export is a file. Use format=xlsx.' }) })
    .strict('Is not a filter on this report.'),
  filters: [],
  dimensions: [],
  columns: methodColumns,
  requiresPassingChecks: true,
  sheetPerSection: true,

  async query(req, baseMatch) {
    const bills = await Bill.find(baseMatch).lean();

    // Sales by rate.
    const rates = new Map();
    for (const bill of bills) {
      const platformCollects = bill.taxTreatment === 'PLATFORM_COLLECTS';
      for (const slab of bill.taxBreakdown) {
        const key = platformCollects ? 'platform' : String(slab.taxRateBps);
        const row = rates.get(key) ?? {
          taxRate: platformCollects ? 'Sales 0%' : `${slab.taxRateBps / 100}%`,
          order: platformCollects ? -1 : slab.taxRateBps,
          netSalesInPaise: 0,
          cgstInPaise: 0,
          sgstInPaise: 0,
        };
        row.netSalesInPaise = sumPaise(row.netSalesInPaise, slab.taxableInPaise);
        row.cgstInPaise = sumPaise(row.cgstInPaise, slab.cgstInPaise);
        row.sgstInPaise = sumPaise(row.sgstInPaise, slab.sgstInPaise);
        rates.set(key, row);
      }
    }
    const rateRows = [...rates.values()]
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...row }) => ({ ...row, billTotalInPaise: sumPaise(row.netSalesInPaise, row.cgstInPaise, row.sgstInPaise) }));
    const roundOffInPaise = sumPaise(0, ...bills.map((bill) => bill.roundOffInPaise));
    const byRate = [...rateRows, { taxRate: 'Round-off', netSalesInPaise: 0, cgstInPaise: 0, sgstInPaise: 0, billTotalInPaise: roundOffInPaise }];

    // Sales by payment method.
    const methods = new Map();
    for (const bill of bills) {
      for (const part of splitBillAcrossPayments(bill)) {
        const key = part.kind === 'PAYMENT' ? part.method : part.kind;
        const row = methods.get(key) ?? {
          tallyLedgerCode: part.kind === 'ON_HOLD' ? ON_HOLD_TALLY_CODE : part.tallyLedgerCode,
          methodName: part.kind === 'ON_HOLD' ? 'On Hold' : part.kind === 'UNPAID' ? 'Unpaid' : part.methodName,
          netSalesInPaise: 0,
          cgstInPaise: 0,
          sgstInPaise: 0,
          billTotalInPaise: 0,
        };
        row.netSalesInPaise = sumPaise(row.netSalesInPaise, part.netSalesInPaise);
        row.cgstInPaise = sumPaise(row.cgstInPaise, part.cgstInPaise);
        row.sgstInPaise = sumPaise(row.sgstInPaise, part.sgstInPaise);
        row.billTotalInPaise = sumPaise(row.billTotalInPaise, part.amountInPaise);
        methods.set(key, row);
      }
    }
    const byMethod = [...methods.values()];

    return {
      sections: [
        { key: 'byRate', title: 'Sales by rate', columns: rateColumns, rows: byRate, totals: totalOf(byRate) },
        { key: 'byMethod', title: 'Sales by payment method', columns: methodColumns, rows: byMethod, totals: totalOf(byMethod) },
      ],
      rateRows,
      wholeNetSalesInPaise: totalOf(rateRows).netSalesInPaise,
      bills,
    };
  },

  async checks(req, params, result) {
    const [c1] = await runRangeChecks(req, { from: params.from, to: params.to }, ['C1']);
    const net = sumPaise(0, ...result.bills.map((bill) => sumPaise(0, ...bill.taxBreakdown.map((slab) => slab.taxableInPaise))));
    return [c1, checkC5(7, result.rateRows, 'netSalesInPaise', net)];
  },
};
