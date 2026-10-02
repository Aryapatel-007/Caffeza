/**
 * R17 On Hold Accounts. M19, built in P17. docs/API-CONTRACT.md "M19" R17.
 *
 * Every account as it stood at the end of `asOf`, a business date, today when
 * not given. Every balance comes from `accountService`, the one place that
 * adds up the ledger: outstanding is never worked out a second time here.
 * With `accountId`, the M16 statement for `from` to `to` follows, exactly as
 * P09 built it.
 */
import { z } from 'zod';

import { businessDateFor, nowUtc } from '../../../utils/time.js';
import { listAccounts, statementFor } from '../../accountService.js';
import { runRangeChecks } from '../../reconciliationService.js';
import { getSetting } from '../../settingsService.js';
import { LABELS } from '../labels.js';
import { FILTERS } from '../params.js';
import { businessDate } from '../../../validators/common.js';
import { MANAGERS, toBills } from './shared.js';

const ENTRY_WORDS = {
  OPENING: 'Opening balance',
  CHARGE: 'Charged',
  CHARGE_REVERSED: 'Charge reversed',
  COLLECTION: 'Collected',
  ADJUSTMENT: 'Adjusted',
};

const accountColumns = [
  { key: 'name', label: LABELS.ACCOUNT, type: 'text' },
  { key: 'openingInPaise', label: LABELS.OPENING_BALANCE, type: 'money' },
  { key: 'chargedInPaise', label: LABELS.CHARGED, type: 'money' },
  { key: 'collectedInPaise', label: LABELS.COLLECTED, type: 'money' },
  { key: 'outstandingInPaise', label: LABELS.OUTSTANDING, type: 'money' },
  { key: 'oldestUnpaidDate', label: LABELS.OLDEST_UNPAID_BILL, type: 'date' },
  { key: 'oldestUnpaidAgeDays', label: LABELS.AGE_IN_DAYS, type: 'count' },
];

const statementColumns = [
  { key: 'businessDate', label: LABELS.BUSINESS_DATE, type: 'date' },
  { key: 'entry', label: LABELS.FIGURE, type: 'text' },
  { key: 'billNumber', label: LABELS.INVOICE_NUMBER, type: 'text' },
  { key: 'amountInPaise', label: LABELS.VALUE, type: 'money' },
  { key: 'balanceInPaise', label: LABELS.OUTSTANDING, type: 'money' },
];

const dayCount = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export default {
  id: 'R17',
  name: 'accounts',
  title: 'On Hold Accounts',
  roles: MANAGERS,
  schema: z
    .object({
      asOf: businessDate.optional(),
      accountId: FILTERS.accountId.optional(),
      from: businessDate.optional(),
      to: businessDate.optional(),
      format: z.enum(['json', 'xlsx'], { error: 'Must be json or xlsx.' }).default('json'),
    })
    .strict('Is not a filter on this report.'),
  filters: ['accountId'],
  dimensions: [],
  columns: accountColumns,

  /** `asOf` defaults to today's business date; the range defaults to that one day. */
  async prepare(req, params) {
    const startMinutes = await getSetting(req.restaurantId, 'business.businessDayStartsAtMinutes', { req });
    const asOf = params.asOf ?? businessDateFor(nowUtc(), startMinutes);
    return { ...params, asOf, from: params.from ?? asOf, to: params.to ?? asOf };
  },

  async query(req, baseMatch, params) {
    const accounts = await listAccounts(req, { includeInactive: true, asOf: params.asOf });
    const rows = accounts
      .filter((account) => account.isActive || account.outstandingInPaise !== 0)
      .map((account) => ({
        name: account.name,
        openingInPaise: account.openingInPaise,
        chargedInPaise: account.chargedInPaise,
        collectedInPaise: account.collectedInPaise,
        outstandingInPaise: account.outstandingInPaise,
        oldestUnpaidDate: account.oldestUncollectedDate,
        oldestUnpaidAgeDays: account.oldestUncollectedDate ? dayCount(account.oldestUncollectedDate, params.asOf) : null,
        drill: { chargedInPaise: toBills({ from: params.from, to: params.to, accountId: account.id }) },
      }));
    const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
    const sections = [
      {
        key: 'accounts',
        title: 'Accounts',
        columns: accountColumns,
        rows,
        totals: {
          openingInPaise: sum('openingInPaise'),
          chargedInPaise: sum('chargedInPaise'),
          collectedInPaise: sum('collectedInPaise'),
          outstandingInPaise: sum('outstandingInPaise'),
        },
      },
    ];

    if (params.accountId) {
      const statement = await statementFor(req, params.accountId, { from: params.from, to: params.to });
      sections.push({
        key: 'statement',
        title: `Statement: ${statement.account.name}`,
        columns: statementColumns,
        rows: statement.entries.map((entry) => ({
          businessDate: entry.businessDate,
          entry: ENTRY_WORDS[entry.type] ?? entry.type,
          billNumber: entry.billNumber ?? null,
          amountInPaise: entry.direction === 'DOWN' ? -entry.amountInPaise : entry.amountInPaise,
          balanceInPaise: entry.balanceInPaise,
        })),
        totals: { openingBalanceInPaise: statement.openingBalanceInPaise, balanceInPaise: statement.closingBalanceInPaise },
      });
    }

    return { sections, extra: { asOf: params.asOf } };
  },

  checks(req, params) {
    return runRangeChecks(req, { from: params.from, to: params.to }, ['C10']);
  },
};
