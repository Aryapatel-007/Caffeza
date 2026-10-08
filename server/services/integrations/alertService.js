/**
 * Integration alerts. P25 Part L, API-CONTRACT M21 section 5.1.
 *
 * Derived on read from the records that cause them, never stored on their
 * own: a dead job, a platform order that failed or was charged differently, a
 * platform cancellation on a closed day, an unknown card machine payment, and
 * a Tally export that failed, partly posted or went unanswered. Acknowledging
 * one stamps its source record, and it is no longer listed.
 */
import { IntegrationConnection } from '../../models/IntegrationConnection.js';
import { IntegrationJob, JOB_STATUSES } from '../../models/IntegrationJob.js';
import { ATTENTION_REASONS, PLATFORM_ORDER_STATUSES, PlatformOrder } from '../../models/PlatformOrder.js';
import { TallyExport } from '../../models/TallyExport.js';
import { TERMINAL_STATUSES, TerminalTransaction } from '../../models/TerminalTransaction.js';
import { NotFoundError } from '../../utils/errors.js';
import { paiseToRupees } from '../../utils/money.js';
import { scoped } from '../../utils/scopedQuery.js';
import { nowUtc } from '../../utils/time.js';
import { providerFor } from './providers.js';
import { dateWords } from './tally/vouchers.js';

export const ALERT_KINDS = Object.freeze({
  JOB_DEAD: 'JOB_DEAD',
  PLATFORM_ACCEPT_FAILED: 'PLATFORM_ACCEPT_FAILED',
  PLATFORM_AMOUNT_MISMATCH: 'PLATFORM_AMOUNT_MISMATCH',
  PLATFORM_CANCELLED_CLOSED_DAY: 'PLATFORM_CANCELLED_CLOSED_DAY',
  TERMINAL_UNKNOWN: 'TERMINAL_UNKNOWN',
  TALLY_FAILED: 'TALLY_FAILED',
});

const rupees = (paise) => paiseToRupees(paise, { symbol: true });
const nameOf = (provider) => providerFor(provider)?.name ?? provider;
const platformName = (code) => (code === 'SWIGGY' ? 'Swiggy' : 'Zomato');

/** What a job was trying to do, in words: a channel call by its call, anything else by its type. */
const JOB_WORDS = Object.freeze({
  acceptOrder: 'accept an order',
  rejectOrder: 'reject an order',
  markFoodReady: 'mark food ready',
  setItemAvailability: 'change which dishes are available',
  setStoreStatus: 'open or close the store',
  pushMenu: 'send the menu',
  PROCESS_WEBHOOK_EVENT: 'read an event it sent',
  CHECK_TERMINAL: 'check a card machine payment',
});

function jobSentence(job, providerName) {
  const key = job.type === 'CHANNEL_CALL' ? job.payload?.call : job.type;
  const what = JOB_WORDS[key] ?? String(key ?? job.type).toLowerCase().replaceAll('_', ' ');
  const orderId = job.payload?.args?.platformOrderId;
  return `${providerName} did not answer after ${job.attempts} ${job.attempts === 1 ? 'try' : 'tries'}: ${what}${orderId ? ` for order ${orderId}` : ''}.`;
}

function tallySentence(row) {
  const day = dateWords(row.businessDate);
  if (row.status === 'UNKNOWN') return `Tally's answer for ${day} is not known. Check Tally's Day Book before sending it again.`;
  const first = row.lineErrors?.[0] ? ` ${row.lineErrors[0]}` : '';
  if (row.status === 'PARTIAL') return `Tally took only some vouchers for ${day}.${first}`;
  return `Tally refused the vouchers for ${day}.${first}`;
}

/** GET /integrations/alerts. OWNER, MANAGER. Newest first. */
export async function listAlerts(req) {
  const open = { ...scoped(req), acknowledgedAt: null };
  const [connections, jobs, platformOrders, terminals, exports] = await Promise.all([
    IntegrationConnection.find(scoped(req)).select('provider').lean(),
    // A bridge's dead post already shows as its Tally export.
    IntegrationJob.find({ ...open, status: JOB_STATUSES.DEAD, forBridge: false }).sort({ updatedAt: -1 }).limit(100).lean(),
    PlatformOrder.find({
      ...open,
      $or: [
        { status: PLATFORM_ORDER_STATUSES.FAILED },
        { amountMismatch: { $ne: null } },
        { status: PLATFORM_ORDER_STATUSES.NEEDS_ATTENTION, attentionReasons: ATTENTION_REASONS.DAY_CLOSED },
      ],
    }).sort({ updatedAt: -1 }).limit(100).lean(),
    TerminalTransaction.find({ ...open, status: TERMINAL_STATUSES.UNKNOWN }).sort({ updatedAt: -1 }).limit(100).lean(),
    TallyExport.find({ ...open, status: { $in: ['FAILED', 'PARTIAL', 'UNKNOWN'] } }).sort({ updatedAt: -1 }).limit(100).lean(),
  ]);
  const providerById = new Map(connections.map((connection) => [String(connection._id), connection.provider]));
  const alerts = [];

  for (const job of jobs) {
    const provider = providerById.get(String(job.connectionId)) ?? null;
    alerts.push({ kind: ALERT_KINDS.JOB_DEAD, id: String(job._id), at: job.updatedAt, provider, sentence: jobSentence(job, nameOf(provider)), link: `/settings/integrations/${provider ?? ''}` });
  }
  for (const record of platformOrders) {
    const name = platformName(record.platformCode);
    const base = { id: String(record._id), at: record.updatedAt, provider: record.provider, link: `/online?platformOrder=${record._id}` };
    if (record.status === PLATFORM_ORDER_STATUSES.FAILED) {
      alerts.push({ ...base, kind: ALERT_KINDS.PLATFORM_ACCEPT_FAILED, sentence: `Accepted on ${name} but not created here: order ${record.platformOrderId}. Enter it by hand.` });
    } else if (record.attentionReasons?.includes(ATTENTION_REASONS.DAY_CLOSED) && record.status === PLATFORM_ORDER_STATUSES.NEEDS_ATTENTION) {
      alerts.push({ ...base, kind: ALERT_KINDS.PLATFORM_CANCELLED_CLOSED_DAY, sentence: `${name} cancelled order ${record.platformOrderId} on ${dateWords(record.businessDate)}, a closed day. Reopen it to void the bill.` });
    } else if (record.amountMismatch) {
      alerts.push({
        ...base,
        kind: ALERT_KINDS.PLATFORM_AMOUNT_MISMATCH,
        link: record.billId ? `/bills/${record.billId}` : base.link,
        sentence: `${name} order ${record.platformOrderId}: the platform charged ${rupees(record.amountMismatch.platformInPaise)}, our bill says ${rupees(record.amountMismatch.oursInPaise)}.`,
      });
    }
  }
  for (const record of terminals) {
    const approved = record.result?.amountInPaise;
    const sentence = Number.isInteger(approved) && approved !== record.amountInPaise
      ? `The card machine approved ${rupees(approved)} for bill ${record.billNumber}, but ${rupees(record.amountInPaise)} was asked for. Check the machine's slip.`
      : `A card machine payment of ${rupees(record.amountInPaise)} for bill ${record.billNumber} is not known. Check the machine's slip.`;
    alerts.push({ kind: ALERT_KINDS.TERMINAL_UNKNOWN, id: String(record._id), at: record.updatedAt, provider: 'PINE_LABS', sentence, link: `/bills/${record.billId}` });
  }
  for (const row of exports) {
    alerts.push({ kind: ALERT_KINDS.TALLY_FAILED, id: String(row._id), at: row.updatedAt, provider: 'TALLY', sentence: tallySentence(row), link: '/settings/tally' });
  }
  return alerts.sort((a, b) => new Date(b.at) - new Date(a.at));
}

const SOURCES = Object.freeze({
  JOB_DEAD: IntegrationJob,
  PLATFORM_ACCEPT_FAILED: PlatformOrder,
  PLATFORM_AMOUNT_MISMATCH: PlatformOrder,
  PLATFORM_CANCELLED_CLOSED_DAY: PlatformOrder,
  TERMINAL_UNKNOWN: TerminalTransaction,
  TALLY_FAILED: TallyExport,
});

/** POST /integrations/alerts/acknowledge. Stamps the source record. */
export async function acknowledgeAlert(req, { kind, id }) {
  const model = SOURCES[kind];
  const updated = await model.updateOne({ ...scoped(req), _id: id, acknowledgedAt: null }, { $set: { acknowledgedAt: nowUtc(), acknowledgedBy: req.user.id } });
  if (updated.matchedCount === 0) throw new NotFoundError('That alert is not open.');
  return { kind, id };
}

export default { acknowledgeAlert, ALERT_KINDS, listAlerts };
