/**
 * Tally exports: closed days built into vouchers, kept, downloaded, redone.
 * P25 Part J, API-CONTRACT M21 section 9.3.
 *
 * Only closed days, read from values frozen when each event happened. A date
 * that may already be in Tally (downloaded, queued, posted, partly posted, or
 * an answer nobody understood) is not built again until the owner confirms
 * deleting its vouchers in Tally. Reopening a day marks its exports STALE
 * (dayCloseService.reopenDay).
 */
import { createHash } from 'node:crypto';

import mongoose from 'mongoose';

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../../models/AuditLog.js';
import { Account } from '../../../models/Account.js';
import { AccountEntry } from '../../../models/AccountEntry.js';
import { Bill } from '../../../models/Bill.js';
import { CashMovement } from '../../../models/CashMovement.js';
import { DAY_STATUSES, DayClosure } from '../../../models/DayClosure.js';
import { PlatformPayout } from '../../../models/PlatformPayout.js';
import { TALLY_EXPORT_HOLDING, TALLY_EXPORT_STATUSES, TallyExport } from '../../../models/TallyExport.js';
import {
  BusinessRuleError,
  DayNotClosedError,
  NotFoundError,
  TallyAlreadyExportedError,
  TallyMappingIncompleteError,
  ValidationError,
} from '../../../utils/errors.js';
import { sumPaise } from '../../../utils/money.js';
import { scoped } from '../../../utils/scopedQuery.js';
import { nowUtc } from '../../../utils/time.js';
import { recordAudit } from '../../auditService.js';
import { coveredPayments } from '../../payoutService.js';
import { activeConnection } from '../connectionService.js';
import { profileFor } from './profiles.js';
import { dateWords, SIDES, sideTotal, unbalanced, vouchersFromRecords } from './vouchers.js';
import { ledgerMastersXml, toTallyXml } from './xml.js';

export const MAX_EXPORT_DATES = 31;
export const MAX_CALENDAR_DATES = 92;

/** Every business date from `from` to `to`, inclusive. */
export function datesBetween(from, to) {
  const dates = [];
  const day = new Date(`${from}T00:00:00Z`);
  const last = new Date(`${to}T00:00:00Z`);
  while (day <= last) {
    dates.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return dates;
}

/** The sentence the owner types before a redo. */
export const redoConfirmationFor = (businessDate) => `I have deleted the vouchers for ${dateWords(businessDate)} from Tally.`;

/** The day's frozen records, read for Tally. */
async function recordsFor(req, connection, businessDate) {
  const [bills, entries, cashMovements, payouts] = await Promise.all([
    Bill.find({ ...scoped(req), businessDate, isVoided: false }).sort({ billedAt: 1, _id: 1 }).lean(),
    AccountEntry.find({ ...scoped(req), businessDate, type: 'COLLECTION' }).sort({ at: 1, _id: 1 }).lean(),
    CashMovement.find({ ...scoped(req), businessDate, isVoided: false, type: { $in: ['PAID_OUT', 'PAID_IN'] } }).sort({ at: 1, _id: 1 }).lean(),
    connection.config.exportPayouts ? PlatformPayout.find({ ...scoped(req), receivedOn: businessDate, isVoided: false }).sort({ recordedAt: 1, _id: 1 }).lean() : [],
  ]);
  const accountIds = [...new Set(entries.map((entry) => String(entry.accountId)))];
  const accounts = accountIds.length > 0 ? await Account.find({ ...scoped(req), _id: { $in: accountIds } }).select('name').lean() : [];
  const names = new Map(accounts.map((account) => [String(account._id), account.name]));
  const collections = entries.map((entry) => ({ ...entry, accountName: names.get(String(entry.accountId)) ?? null }));
  const withGross = await Promise.all(
    payouts.map(async (payout) => ({ ...payout, grossInPaise: sumPaise(0, ...(await coveredPayments(req, payout)).map((payment) => payment.amountInPaise)) })),
  );
  return { bills, collections, cashMovements, payouts: withGross };
}

/**
 * buildDay: one closed date's vouchers, or the reason it cannot be built.
 * Returns `{ vouchers, missing }`.
 */
export async function buildDay(req, connection, businessDate, { batchId = '' } = {}) {
  const records = await recordsFor(req, connection, businessDate);
  return vouchersFromRecords(records, { businessDate, batchId, ledgers: connection.config.ledgers ?? {}, voucherTypes: connection.config.voucherTypes, granularity: connection.config.granularity, exportPayouts: connection.config.exportPayouts });
}

async function closuresFor(req, dates) {
  const closures = await DayClosure.find({ ...scoped(req), businessDate: { $in: dates } }).lean();
  return new Map(closures.map((closure) => [closure.businessDate, closure]));
}

/** The latest export of each date that is not stale. */
async function liveExportsFor(req, connection, dates) {
  const rows = await TallyExport.find({ ...scoped(req), connectionId: connection._id, businessDate: { $in: dates }, status: { $ne: TALLY_EXPORT_STATUSES.STALE } }).sort({ createdAt: -1 }).lean();
  const latest = new Map();
  for (const row of rows) if (!latest.has(row.businessDate)) latest.set(row.businessDate, row);
  return latest;
}

const present = (row) => {
  const { xml: _xml, response: _response, ...rest } = row.toJSON ? row.toJSON() : { ...row, id: String(row._id) };
  delete rest._id;
  delete rest.__v;
  return rest;
};

/** Builds one export row, in memory, for a closed date. Throws when it cannot. */
async function buildExport(req, connection, closure, { redoneFromId = null } = {}) {
  const id = new mongoose.Types.ObjectId();
  const { vouchers, missing } = await buildDay(req, connection, closure.businessDate, { batchId: String(id) });
  if (missing.length > 0) throw new TallyMappingIncompleteError(missing);
  const off = unbalanced(vouchers);
  if (off) throw new BusinessRuleError(`Voucher ${off.number} does not balance: debits and credits differ by ${off.differenceInPaise} paise. Nothing was built.`);
  const xml = toTallyXml(vouchers, profileFor(connection.config.version), connection.config.companyName);
  return {
    _id: id,
    ...scoped(req),
    connectionId: connection._id,
    businessDate: closure.businessDate,
    granularity: connection.config.granularity,
    version: connection.config.version,
    status: TALLY_EXPORT_STATUSES.BUILT,
    voucherCount: vouchers.length,
    debitInPaise: sumPaise(0, ...vouchers.map((voucher) => sideTotal(voucher, SIDES.DEBIT))),
    creditInPaise: sumPaise(0, ...vouchers.map((voucher) => sideTotal(voucher, SIDES.CREDIT))),
    xml,
    xmlSha256: createHash('sha256').update(xml).digest('hex'),
    builtFromCloseAt: closure.closedAt,
    createdBy: req.user.id,
    redoneFromId,
  };
}

function checkRange(from, to, max) {
  if (from > to) throw new ValidationError('The first date is after the last.', { to: 'Must be on or after the first date.' });
  const dates = datesBetween(from, to);
  if (dates.length > max) throw new ValidationError(`At most ${max} dates at a time.`, { to: `At most ${max} dates from the first.` });
  return dates;
}

/** GET /integrations/tally/days */
export async function listDays(req, { from, to }) {
  const dates = checkRange(from, to, MAX_CALENDAR_DATES);
  const connection = await activeConnection(req, 'TALLY');
  const [closures, exports] = await Promise.all([closuresFor(req, dates), liveExportsFor(req, connection, dates)]);
  return dates.map((businessDate) => {
    const latest = exports.get(businessDate);
    return {
      businessDate,
      closed: closures.get(businessDate)?.status === DAY_STATUSES.CLOSED,
      export: latest ? present(latest) : null,
    };
  });
}

/** POST /integrations/tally/exports. All dates are checked before anything is written. */
export async function createExports(req, { from, to }) {
  const dates = checkRange(from, to, MAX_EXPORT_DATES);
  const connection = await activeConnection(req, 'TALLY');
  const closures = await closuresFor(req, dates);
  const open = dates.filter((date) => closures.get(date)?.status !== DAY_STATUSES.CLOSED);
  if (open.length > 0) throw new DayNotClosedError(open);
  const live = await liveExportsFor(req, connection, dates);
  const held = dates.filter((date) => TALLY_EXPORT_HOLDING.includes(live.get(date)?.status));
  if (held.length > 0) throw new TallyAlreadyExportedError(held);

  const built = [];
  const missing = new Set();
  for (const date of dates) {
    try {
      built.push(await buildExport(req, connection, closures.get(date)));
    } catch (error) {
      if (!(error instanceof TallyMappingIncompleteError)) throw error;
      for (const head of error.details.missing) missing.add(head);
    }
  }
  if (missing.size > 0) throw new TallyMappingIncompleteError([...missing]);

  // A built export never left the server; a new build replaces it.
  await TallyExport.updateMany(
    { ...scoped(req), connectionId: connection._id, businessDate: { $in: dates }, status: { $in: [TALLY_EXPORT_STATUSES.BUILT, TALLY_EXPORT_STATUSES.FAILED] } },
    { $set: { status: TALLY_EXPORT_STATUSES.STALE } },
  );
  const rows = await TallyExport.insertMany(built);
  return rows.map(present);
}

async function loadExport(req, id, { withXml = false } = {}) {
  const query = TallyExport.findOne({ ...scoped(req), _id: id });
  if (withXml) query.select('+xml');
  const row = await query;
  if (!row) throw new NotFoundError('Tally export not found.');
  return row;
}

/** GET /integrations/tally/exports/:id/file. Marks a built export DOWNLOADED. */
export async function exportFile(req, id) {
  const row = await loadExport(req, id, { withXml: true });
  if (row.status === TALLY_EXPORT_STATUSES.STALE) throw new BusinessRuleError('This export was replaced. Download the newer one.');
  await TallyExport.updateOne({ ...scoped(req), _id: row._id, status: TALLY_EXPORT_STATUSES.BUILT }, { $set: { status: TALLY_EXPORT_STATUSES.DOWNLOADED } });
  return { xml: row.xml, fileName: `tally-${row.businessDate}-${String(row._id).slice(-6)}.xml` };
}

/** POST /integrations/tally/exports/:id/redo. OWNER, with the exact confirmation. */
export async function redoExport(req, id, { confirmation }) {
  const row = await loadExport(req, id);
  if (row.status === TALLY_EXPORT_STATUSES.STALE) throw new BusinessRuleError('This export was already replaced.');
  const expected = redoConfirmationFor(row.businessDate);
  if (confirmation !== expected) throw new ValidationError('Type the sentence exactly as shown.', { confirmation: `Type: ${expected}` });

  const connection = await activeConnection(req, 'TALLY');
  const closure = await DayClosure.findOne({ ...scoped(req), businessDate: row.businessDate }).lean();
  if (closure?.status !== DAY_STATUSES.CLOSED) throw new DayNotClosedError([row.businessDate]);
  const built = await buildExport(req, connection, closure, { redoneFromId: row._id });

  await TallyExport.updateMany(
    { ...scoped(req), connectionId: connection._id, businessDate: row.businessDate, status: { $ne: TALLY_EXPORT_STATUSES.STALE } },
    { $set: { status: TALLY_EXPORT_STATUSES.STALE } },
  );
  const [created] = await TallyExport.insertMany([built]);
  await recordAudit(req, {
    action: AUDIT_ACTIONS.TALLY_EXPORT_REDONE,
    entityType: AUDIT_ENTITY_TYPES.TALLY_EXPORT,
    entityId: created._id,
    entityLabel: row.businessDate,
    reason: expected,
    details: { replacedExportId: String(row._id), replacedStatus: row.status },
  });
  return present(created);
}

/**
 * Reopening a day: every export of that date is STALE. Called inside
 * reopenDay's transaction.
 */
export async function markDayStale(req, businessDate, session = null) {
  await TallyExport.updateMany(
    { ...scoped(req), businessDate, status: { $ne: TALLY_EXPORT_STATUSES.STALE } },
    { $set: { status: TALLY_EXPORT_STATUSES.STALE } },
    session ? { session } : {},
  );
}

/** Tally's own group names, used when the owner has chosen none. */
const DEFAULT_GROUPS = Object.freeze({
  sales: 'Sales Accounts',
  tax: 'Duties & Taxes',
  payment: 'Current Assets',
  onHold: 'Sundry Debtors',
  expense: 'Indirect Expenses',
  income: 'Indirect Incomes',
  bank: 'Bank Accounts',
});

/** Every mapped ledger with the parent group chosen for its head. */
export function ledgersOf(mapping = {}) {
  const groups = { ...DEFAULT_GROUPS, ...(mapping.parentGroups ?? {}) };
  const out = new Map();
  const add = (name, parent) => {
    if (typeof name === 'string' && name.trim() && !out.has(name.trim())) out.set(name.trim(), parent);
  };
  for (const name of Object.values(mapping.salesByRate ?? {})) add(name, groups.sales);
  add(mapping.platformSales, groups.sales);
  add(mapping.cgst, groups.tax);
  add(mapping.sgst, groups.tax);
  add(mapping.roundOff, groups.expense);
  for (const name of Object.values(mapping.paymentMethods ?? {})) add(name, groups.payment);
  add(mapping.onHold?.ledger, groups.onHold);
  for (const name of Object.values(mapping.onHold?.byAccount ?? {})) add(name, groups.onHold);
  add(mapping.paidOut, groups.expense);
  add(mapping.paidIn, groups.income);
  add(mapping.bank, groups.bank);
  for (const name of Object.values(mapping.commissionByMethod ?? {})) add(name, groups.expense);
  return [...out.entries()].map(([name, parent]) => ({ name, parent }));
}

/** GET /integrations/tally/ledger-masters/file. OWNER. */
export async function ledgerMastersFile(req) {
  const connection = await activeConnection(req, 'TALLY');
  const ledgers = ledgersOf(connection.config.ledgers);
  if (ledgers.length === 0) throw new BusinessRuleError('Map at least one ledger first.');
  return { xml: ledgerMastersXml(ledgers, profileFor(connection.config.version), connection.config.companyName), fileName: 'tally-ledgers.xml' };
}

/** Marks an export as Tally answered. Part K's bridge calls it; `nowUtc` stamps a post. */
export async function recordTallyAnswer(req, exportId, { status, lineErrors = [], response = null }) {
  const row = await loadExport(req, exportId);
  const update = { status, lineErrors, response: response ? String(response).slice(0, 64 * 1024) : null };
  if (status === TALLY_EXPORT_STATUSES.POSTED) update.postedAt = nowUtc();
  await TallyExport.updateOne({ ...scoped(req), _id: row._id }, { $set: update });
  if (status === TALLY_EXPORT_STATUSES.POSTED) {
    await recordAudit(req, {
      action: AUDIT_ACTIONS.TALLY_EXPORT_POSTED,
      entityType: AUDIT_ENTITY_TYPES.TALLY_EXPORT,
      entityId: row._id,
      entityLabel: row.businessDate,
      reason: `${row.voucherCount} vouchers posted`,
      amountInPaise: row.debitInPaise,
    });
  }
  return present(await loadExport(req, exportId));
}

export default { buildDay, createExports, exportFile, ledgerMastersFile, ledgersOf, listDays, markDayStale, recordTallyAnswer, redoExport };
