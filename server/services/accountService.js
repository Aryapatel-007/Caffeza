/**
 * On Hold accounts and their ledger. M16, built in P09.
 * docs/API-CONTRACT.md "M16 Settlement and Day Close" section 2.
 *
 * This file is the only place that writes `accountentries`. Every balance is
 * worked out from the entries, never stored, so the number on screen cannot
 * drift from the ledger behind it: outstanding is the UP amounts minus the
 * DOWN amounts.
 *
 * An On Hold bill is a sale on the day it was issued. The money arrives later,
 * as a collection, which counts in the drawer on the day it arrives and is
 * never a sale.
 */
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { Account } from '../models/Account.js';
import {
  ACCOUNT_ENTRY_TYPES,
  AccountEntry,
  ENTRY_DIRECTIONS,
  FIXED_DIRECTION,
} from '../models/AccountEntry.js';
import { Bill, BILL_STATUSES } from '../models/Bill.js';
import { Order, ORDER_STATUSES } from '../models/Order.js';
import { PAYMENT_METHOD_KINDS } from '../models/PaymentMethod.js';
import {
  AccountBalanceExceededError,
  BusinessRuleError,
  DuplicateError,
  NotFoundError,
  PaymentMethodNotAllowedError,
} from '../utils/errors.js';
import { sumPaise } from '../utils/money.js';
import { scoped } from '../utils/scopedQuery.js';
import { businessDateFor, nowUtc } from '../utils/time.js';
import { withOptionalTransaction } from '../utils/transaction.js';
import { recordAudit } from './auditService.js';
import { assertNotVoided } from './billPermissionService.js';
import { assertBillTakesMoney } from './billRevisionService.js';
import { assertDayOpen, todayBusinessDate } from './dayLockService.js';
import { methodByCode } from './paymentMethodService.js';
import { getSetting } from './settingsService.js';

const DUPLICATE_KEY = 11000;
const opts = (session) => (session ? { session } : {});

function startMinutesFor(req) {
  return getSetting(req.restaurantId, 'business.businessDayStartsAtMinutes', { req });
}

/** +amount for UP, -amount for DOWN. */
const signed = (entry) => (entry.direction === ENTRY_DIRECTIONS.UP ? entry.amountInPaise : -entry.amountInPaise);

/**
 * Writes one ledger entry. The only writer of `accountentries`.
 *
 * The direction is fixed by the type except for an ADJUSTMENT, the business
 * date is the business day of the moment of writing, and the time is the
 * service clock.
 */
async function recordEntry(req, entry, { session = null, at = nowUtc(), startMinutes } = {}) {
  const minutes = startMinutes ?? (await startMinutesFor(req));
  const [created] = await AccountEntry.create(
    [
      {
        ...scoped(req),
        ...entry,
        direction: FIXED_DIRECTION[entry.type] ?? entry.direction,
        businessDate: businessDateFor(at, minutes),
        at,
        by: req.user.id,
      },
    ],
    opts(session),
  );
  return created;
}

/** What an account owes now, from its entries. Never a stored running number. */
export async function outstandingFor(req, accountId, { session = null, asOf = null } = {}) {
  // P17: `asOf`, a business date, counts only entries on or before it, for R17.
  const entries = await AccountEntry.find({ ...scoped(req), accountId, ...(asOf ? { businessDate: { $lte: asOf } } : {}) })
    .select('direction amountInPaise')
    .setOptions(opts(session))
    .lean();
  return sumPaise(0, ...entries.map(signed));
}

/**
 * The business date of the oldest charge not yet covered.
 *
 * Every DOWN amount (collections, reversals, downward adjustments) is applied
 * to the UP entries oldest first; the first UP entry not fully covered is the
 * oldest money still owed. Null when nothing is owed.
 */
function oldestUncollectedDate(entries) {
  let covered = sumPaise(0, ...entries.filter((e) => e.direction === ENTRY_DIRECTIONS.DOWN).map((e) => e.amountInPaise));
  for (const entry of entries) {
    if (entry.direction !== ENTRY_DIRECTIONS.UP) continue;
    if (covered >= entry.amountInPaise) {
      covered -= entry.amountInPaise;
      continue;
    }
    return entry.businessDate;
  }
  return null;
}

function present(account, entries) {
  const of = (type) => entries.filter((entry) => entry.type === type);
  const total = (list) => sumPaise(0, ...list.map((entry) => entry.amountInPaise));
  return {
    ...account.toJSON(),
    outstandingInPaise: sumPaise(0, ...entries.map(signed)),
    oldestUncollectedDate: oldestUncollectedDate(entries),
    // P17, for R17: the parts of the balance. Charged is net of charges reversed by a void.
    openingInPaise: total(of(ACCOUNT_ENTRY_TYPES.OPENING)),
    chargedInPaise: total(of(ACCOUNT_ENTRY_TYPES.CHARGE)) - total(of(ACCOUNT_ENTRY_TYPES.CHARGE_REVERSED)),
    collectedInPaise: total(of(ACCOUNT_ENTRY_TYPES.COLLECTION)),
    adjustedInPaise: sumPaise(0, ...of(ACCOUNT_ENTRY_TYPES.ADJUSTMENT).map(signed)),
  };
}

async function loadAccount(req, accountId, { session = null } = {}) {
  const account = await Account.findOne({ ...scoped(req), _id: accountId }).setOptions(opts(session));
  if (!account) throw new NotFoundError('Account not found.');
  return account;
}

function rethrowDuplicate(error) {
  if (error?.code === DUPLICATE_KEY) {
    throw new DuplicateError('An account with that name already exists.', {
      name: 'Already used by another account.',
    });
  }
  throw error;
}

/** GET /accounts. Each with its outstanding balance and oldest uncollected date. */
export async function listAccounts(req, { includeInactive = false, asOf = null } = {}) {
  const filter = { ...scoped(req) };
  if (!includeInactive) filter.isActive = true;
  const accounts = await Account.find(filter).sort({ nameLower: 1 });
  if (accounts.length === 0) return [];

  // P17: `asOf` reads the accounts as they stood at the end of that business date (R17).
  const entries = await AccountEntry.find({
    ...scoped(req),
    accountId: { $in: accounts.map((account) => account._id) },
    ...(asOf ? { businessDate: { $lte: asOf } } : {}),
  })
    .sort({ at: 1, _id: 1 })
    .select('accountId type direction amountInPaise businessDate')
    .lean();

  const byAccount = new Map(accounts.map((account) => [String(account._id), []]));
  for (const entry of entries) byAccount.get(String(entry.accountId))?.push(entry);

  return accounts.map((account) => present(account, byAccount.get(String(account._id))));
}

/** POST /accounts. A positive opening balance writes an OPENING entry in the same transaction. */
export async function createAccount(req, body) {
  const openingBalanceInPaise = body.openingBalanceInPaise ?? 0;
  const startMinutes = await startMinutesFor(req);

  const account = await withOptionalTransaction(async (session) => {
    const [created] = await Account.create(
      [
        {
          ...scoped(req),
          name: body.name,
          contactName: body.contactName ?? null,
          phone: body.phone ?? null,
          note: body.note ?? null,
          openingBalanceInPaise,
        },
      ],
      opts(session),
    ).catch(rethrowDuplicate);

    if (openingBalanceInPaise > 0) {
      await recordEntry(
        req,
        { accountId: created._id, type: ACCOUNT_ENTRY_TYPES.OPENING, amountInPaise: openingBalanceInPaise },
        { session, startMinutes },
      );
    }
    return created;
  });

  const entries = await AccountEntry.find({ ...scoped(req), accountId: account._id }).sort({ at: 1 }).lean();
  return present(account, entries);
}

/** PATCH /accounts/:accountId. Never the opening balance. */
export async function updateAccount(req, accountId, changes) {
  const account = await loadAccount(req, accountId);
  for (const [key, value] of Object.entries(changes)) account[key] = value;
  await account.save().catch(rethrowDuplicate);
  const entries = await AccountEntry.find({ ...scoped(req), accountId: account._id }).sort({ at: 1 }).lean();
  return present(account, entries);
}

/**
 * POST /bills/:billId/charge-to-account.
 *
 * The bill becomes ON_ACCOUNT, the order becomes BILLED and frees its table
 * exactly as a full payment does, a CHARGE entry, and the audit line, all in
 * one transaction. Only what is still owed goes on the account: a bill part
 * paid in cash first puts the remainder there.
 */
export async function chargeBillToAccount(req, billId, { accountId }) {
  const bill = await Bill.findOne({ ...scoped(req), _id: billId });
  if (!bill) throw new NotFoundError('Bill not found.');
  // P10: the bill's day, and today's, when the charge entry is written. Checked first.
  await assertDayOpen(req, [bill.businessDate, await todayBusinessDate(req)]);
  assertNotVoided(bill);
  if (bill.status !== BILL_STATUSES.UNPAID) {
    throw new BusinessRuleError('Only an unpaid bill can be charged to an account.');
  }
  // P29. Items added to the bill are still with the kitchen.
  await assertBillTakesMoney(req, bill);

  const account = await loadAccount(req, accountId);
  if (!account.isActive) {
    throw new BusinessRuleError('That account is switched off. Switch it on to charge to it.');
  }

  const chargedToAccountInPaise = bill.grandTotalInPaise - bill.amountPaidInPaise;
  if (chargedToAccountInPaise <= 0) {
    throw new BusinessRuleError('Nothing is left to charge on this bill.');
  }

  const at = nowUtc();
  const startMinutes = await startMinutesFor(req);

  return withOptionalTransaction((session) =>
    chargeInSession(req, { bill, account, chargedToAccountInPaise, at, startMinutes }, session),
  );
}

/**
 * The core of a charge, inside the transaction it is given. P25 Part E charges
 * a re-issued bill to the account its voided bill was on, through here.
 */
export async function chargeInSession(req, { bill, account, chargedToAccountInPaise, at = nowUtc(), startMinutes = null }, session) {
  const minutes = startMinutes ?? (await startMinutesFor(req));
  const charged = await Bill.findOneAndUpdate(
    { ...scoped(req), _id: bill._id, status: BILL_STATUSES.UNPAID, isVoided: false },
    {
      $set: {
        status: BILL_STATUSES.ON_ACCOUNT,
        account: { accountId: account._id, accountName: account.name },
        chargedToAccountInPaise,
        chargedAt: at,
        chargedBy: req.user.id,
      },
    },
    { new: true, ...opts(session) },
  );
  if (!charged) throw new BusinessRuleError('This bill changed while it was being charged. Open it again.');

  // The same targeted write a full payment makes: the pre hook frees the table.
  await Order.updateOne(
    { ...scoped(req), _id: bill.orderId },
    { $set: { status: ORDER_STATUSES.BILLED }, $inc: { version: 1 } },
    opts(session),
  );

  await recordEntry(
    req,
    {
      accountId: account._id,
      type: ACCOUNT_ENTRY_TYPES.CHARGE,
      amountInPaise: chargedToAccountInPaise,
      billId: bill._id,
      billNumber: bill.billNumber,
    },
    { session, at, startMinutes: minutes },
  );

  await recordAudit(
    req,
    {
      action: AUDIT_ACTIONS.BILL_CHARGED_TO_ACCOUNT,
      entityType: AUDIT_ENTITY_TYPES.BILL,
      entityId: bill._id,
      entityLabel: bill.billNumber,
      reason: `Charged to ${account.name}`,
      amountInPaise: chargedToAccountInPaise,
      details: { accountId: String(account._id), accountName: account.name },
    },
    session,
  );

  return charged;
}

/**
 * Called by billService.voidBill inside its transaction when the bill being
 * voided was charged to an account: the charge comes off the ledger again.
 */
export function reverseChargeForVoid(req, bill, { session = null } = {}) {
  if (bill.status !== BILL_STATUSES.ON_ACCOUNT || !bill.account?.accountId) return Promise.resolve(null);
  return recordEntry(
    req,
    {
      accountId: bill.account.accountId,
      type: ACCOUNT_ENTRY_TYPES.CHARGE_REVERSED,
      amountInPaise: bill.chargedToAccountInPaise,
      billId: bill._id,
      billNumber: bill.billNumber,
    },
    { session },
  );
}

/**
 * POST /accounts/:accountId/collections. Money received against a tab, by an
 * in-hand method, never more than is owed. Dated today; never a sale.
 */
export async function recordCollection(req, accountId, { method, amountInPaise, reference = null, note = null }) {
  const account = await loadAccount(req, accountId);

  const paymentMethod = await methodByCode(req, method);
  if (!paymentMethod || !paymentMethod.isActive) {
    throw new PaymentMethodNotAllowedError(`${paymentMethod?.name ?? method} is not an active payment method.`);
  }
  if (paymentMethod.kind !== PAYMENT_METHOD_KINDS.IN_HAND) {
    throw new PaymentMethodNotAllowedError(
      `${paymentMethod.name} is platform money. A collection is cash, card or UPI in hand.`,
    );
  }

  const today = await todayBusinessDate(req);

  return withOptionalTransaction(async (session) => {
    await assertDayOpen(req, today, { session });
    const outstanding = await outstandingFor(req, account._id, { session });
    if (amountInPaise > outstanding) {
      throw new AccountBalanceExceededError(
        `${account.name} owes less than that. Record what was collected, up to the balance owed.`,
      );
    }
    return recordEntry(
      req,
      {
        accountId: account._id,
        type: ACCOUNT_ENTRY_TYPES.COLLECTION,
        amountInPaise,
        method: paymentMethod.code,
        methodName: paymentMethod.name,
        methodKind: paymentMethod.kind,
        reference: reference ?? null,
        note: note ?? null,
      },
      { session },
    );
  });
}

/** POST /accounts/:accountId/adjustments. OWNER. A write-off or an addition, audited. */
export async function adjustBalance(req, accountId, { direction, amountInPaise, reason }) {
  const account = await loadAccount(req, accountId);

  const today = await todayBusinessDate(req);

  return withOptionalTransaction(async (session) => {
    await assertDayOpen(req, today, { session });
    if (direction === ENTRY_DIRECTIONS.DOWN) {
      const outstanding = await outstandingFor(req, account._id, { session });
      if (amountInPaise > outstanding) {
        throw new AccountBalanceExceededError(`${account.name} owes less than that.`);
      }
    }
    const entry = await recordEntry(
      req,
      { accountId: account._id, type: ACCOUNT_ENTRY_TYPES.ADJUSTMENT, direction, amountInPaise, note: reason },
      { session },
    );
    await recordAudit(
      req,
      {
        action: AUDIT_ACTIONS.ACCOUNT_BALANCE_ADJUSTED,
        entityType: AUDIT_ENTITY_TYPES.ACCOUNT,
        entityId: account._id,
        entityLabel: account.name,
        reason,
        amountInPaise: direction === ENTRY_DIRECTIONS.UP ? amountInPaise : -amountInPaise,
        details: { direction },
      },
      session,
    );
    return entry;
  });
}

/**
 * GET /accounts/:accountId/statement. The balance before `from`, every entry
 * in the range in order with a running balance, and the balance after `to`.
 * Both dates are business dates, inclusive, and either may be left out.
 */
export async function statementFor(req, accountId, { from = null, to = null } = {}) {
  const account = await loadAccount(req, accountId);
  const entries = await AccountEntry.find({ ...scoped(req), accountId: account._id })
    .sort({ at: 1, _id: 1 })
    .lean();

  let balance = 0;
  let openingInPaise = 0;
  const rows = [];
  for (const entry of entries) {
    if (from && entry.businessDate < from) {
      openingInPaise += signed(entry);
      balance = openingInPaise;
      continue;
    }
    if (to && entry.businessDate > to) break;
    balance += signed(entry);
    rows.push({
      id: String(entry._id),
      type: entry.type,
      direction: entry.direction,
      amountInPaise: entry.amountInPaise,
      billId: entry.billId ? String(entry.billId) : null,
      billNumber: entry.billNumber,
      method: entry.method,
      methodName: entry.methodName,
      reference: entry.reference,
      note: entry.note,
      businessDate: entry.businessDate,
      at: entry.at,
      balanceInPaise: balance,
    });
  }

  return {
    account: account.toJSON(),
    from,
    to,
    openingBalanceInPaise: openingInPaise,
    entries: rows,
    closingBalanceInPaise: balance,
  };
}

export default {
  adjustBalance,
  chargeBillToAccount,
  createAccount,
  listAccounts,
  outstandingFor,
  recordCollection,
  reverseChargeForVoid,
  statementFor,
  updateAccount,
};
