/**
 * Taking a payment on the card machine. P25 Part I, API-CONTRACT M21 section 8.
 *
 * The amount goes to Pine Labs, the cashier picks its PTRID on the machine,
 * and the result is read back with GetStatus: when the screen asks, when a
 * job checks every 30 seconds, or when Pine Labs posts a hint. However it is
 * learnt, an approval is recorded once: the transaction moves to APPROVED only
 * from WAITING, inside the same transaction as the payment, and its
 * `paymentId` is unique. An approved amount different from the one asked for
 * records nothing and raises an alert for a manager.
 */
import { CONNECTION_STATUSES, IntegrationConnection } from '../../../models/IntegrationConnection.js';
import { TERMINAL_STATUSES, TerminalTransaction } from '../../../models/TerminalTransaction.js';
import { BusinessRuleError, IntegrationNotActiveError, NotFoundError, PartnerCallFailedError } from '../../../utils/errors.js';
import { scoped } from '../../../utils/scopedQuery.js';
import { nowUtc } from '../../../utils/time.js';
import { withOptionalTransaction } from '../../../utils/transaction.js';
import { assertNotVoided, assertPaymentFits } from '../../billPermissionService.js';
import { readBill, recordPayment } from '../../billService.js';
import { assertBillTakesMoney } from '../../billRevisionService.js';
import { assertDayOpen, todayBusinessDate } from '../../dayLockService.js';
import { methodForBill } from '../../paymentMethodService.js';
import { secretsOf } from '../connectionService.js';
import { enqueueJob, registerJobHandler } from '../jobRunner.js';
import { asIntegration } from '../systemActor.js';
import { cancelTransaction, getStatus, uploadBilledTransaction } from './pineLabs.js';

export const CHECK_TERMINAL = 'CHECK_TERMINAL';
export const CHECK_EVERY_MS = 30_000;
/** A screen asking for the status triggers a GetStatus at most this often. */
export const READ_REFRESH_MS = 3_000;
const MINUTE_MS = 60_000;
const OPEN = [TERMINAL_STATUSES.CREATED, TERMINAL_STATUSES.WAITING];

async function pineLabsConnection(req) {
  const connection = await IntegrationConnection.findOne({ ...scoped(req), provider: 'PINE_LABS' }).select('+credentials');
  if (!connection || connection.status !== CONNECTION_STATUSES.ACTIVE) throw new IntegrationNotActiveError('The card machine is not connected. An owner can set it up in Integrations.');
  return connection;
}

async function loadTransaction(req, id) {
  const record = await TerminalTransaction.findOne({ ...scoped(req), _id: id });
  if (!record) throw new NotFoundError('Card machine payment not found.');
  return record;
}

/** Letters and digits only, as Pine Labs' TransactionNumber is AN; bill numbers carry "/". */
export const transactionNumberOf = (billNumber) => billNumber.replace(/[^A-Za-z0-9]/g, '').slice(0, 50);

/**
 * POST /bills/:billId/terminal-payments. The same rules as a payment by hand,
 * then the amount goes to the machine.
 */
export async function startTerminalPayment(req, billId, { method, amountInPaise, terminalClientId }) {
  const bill = await readBill(req, billId);
  await assertDayOpen(req, [bill.businessDate, await todayBusinessDate(req)]);
  assertNotVoided(bill);
  assertPaymentFits(bill, amountInPaise);
  // P29. Items added to the bill are still with the kitchen.
  await assertBillTakesMoney(req, bill);
  const paymentMethod = await methodForBill(req, bill, method);
  if (paymentMethod.terminalProvider !== 'PINE_LABS') throw new BusinessRuleError(`${paymentMethod.name} is not taken on the card machine.`);

  const connection = await pineLabsConnection(req);
  const terminal = (connection.config.terminals ?? []).find((entry) => String(entry.clientId) === String(terminalClientId));
  if (!terminal) throw new BusinessRuleError('That card machine is not set up. Choose one on This device.');

  const transactionNumber = transactionNumberOf(bill.billNumber);
  const sequenceNumber = (await TerminalTransaction.countDocuments({ ...scoped(req), connectionId: connection._id, transactionNumber })) + 1;
  const record = await TerminalTransaction.create({
    ...scoped(req),
    connectionId: connection._id,
    billId: bill._id,
    billNumber: bill.billNumber,
    methodCode: paymentMethod.code,
    allowedPaymentMode: paymentMethod.terminalPaymentMode,
    amountInPaise,
    transactionNumber,
    sequenceNumber,
    terminal: { name: terminal.name, clientId: String(terminal.clientId) },
    status: TERMINAL_STATUSES.CREATED,
    businessDate: await todayBusinessDate(req),
    startedBy: req.user.id,
    startedAt: nowUtc(),
  });

  let uploaded;
  try {
    uploaded = await uploadBilledTransaction(connection, secretsOf(connection), {
      transactionNumber,
      sequenceNumber,
      allowedPaymentMode: paymentMethod.terminalPaymentMode,
      amountInPaise,
      clientId: terminal.clientId,
      userId: req.user.id,
    });
  } catch (error) {
    record.status = TERMINAL_STATUSES.DECLINED;
    record.lastMessage = error.message;
    record.finishedAt = nowUtc();
    await record.save();
    throw error;
  }
  if (!uploaded.ok) {
    record.status = TERMINAL_STATUSES.DECLINED;
    record.lastMessage = uploaded.message || 'Pine Labs did not take the amount.';
    record.finishedAt = nowUtc();
    await record.save();
    throw new PartnerCallFailedError(`The card machine service refused it: ${record.lastMessage}`);
  }

  record.ptrid = uploaded.ptrid;
  record.status = TERMINAL_STATUSES.WAITING;
  await record.save();
  await enqueueJob(req, { connectionId: connection._id, type: CHECK_TERMINAL, payload: { id: String(record._id) }, runAfter: new Date(nowUtc().getTime() + CHECK_EVERY_MS) });
  return record;
}

/**
 * Records an approval once. The transaction moves to APPROVED only from an
 * open status, inside the same transaction as the payment.
 */
async function approve(req, record, result) {
  if (result.amountInPaise !== record.amountInPaise) {
    await TerminalTransaction.updateOne(
      { ...scoped(req), _id: record._id, status: { $in: OPEN } },
      {
        $set: {
          status: TERMINAL_STATUSES.UNKNOWN,
          result,
          lastMessage: `The machine approved ${result.amountInPaise} paise, but ${record.amountInPaise} were asked for. Check the machine's slip.`,
          finishedAt: nowUtc(),
        },
      },
    );
    return;
  }
  await withOptionalTransaction(async (session) => {
    const claimed = await TerminalTransaction.findOneAndUpdate(
      { ...scoped(req), _id: record._id, status: { $in: OPEN } },
      { $set: { status: TERMINAL_STATUSES.APPROVED, result, finishedAt: nowUtc() } },
      { new: true, ...(session ? { session } : {}) },
    );
    if (!claimed) return;
    const bill = await recordPayment(
      req,
      record.billId,
      { method: record.methodCode, amountInPaise: record.amountInPaise, reference: result.rrn ?? record.ptrid },
      { terminal: { provider: 'PINE_LABS', ptrid: record.ptrid, rrn: result.rrn, approvalCode: result.approvalCode, tid: result.tid, paymentMode: result.paymentMode }, session },
    );
    const payment = bill.payments.at(-1);
    await TerminalTransaction.updateOne({ ...scoped(req), _id: record._id }, { $set: { paymentId: payment._id } }, session ? { session } : {});
  });
}

/** Asks Pine Labs, and acts on the answer. Returns the transaction as it now is. */
export async function checkStatus(req, record) {
  if (!OPEN.includes(record.status) || !record.ptrid) return record;
  const connection = await IntegrationConnection.findOne({ ...scoped(req), _id: record.connectionId }).select('+credentials');
  if (!connection) return record;
  const answer = await getStatus(connection, secretsOf(connection), { ptrid: record.ptrid, transactionNumber: record.transactionNumber, clientId: record.terminal.clientId });
  if (answer.status === 'APPROVED') {
    await approve(req, record, answer.result);
  } else if (answer.status === 'DECLINED' || answer.status === 'CANCELLED') {
    await TerminalTransaction.updateOne(
      { ...scoped(req), _id: record._id, status: { $in: OPEN } },
      { $set: { status: TERMINAL_STATUSES[answer.status], lastMessage: answer.message, finishedAt: nowUtc(), lastCheckedAt: nowUtc() } },
    );
  } else {
    await TerminalTransaction.updateOne({ ...scoped(req), _id: record._id }, { $set: { lastCheckedAt: nowUtc(), lastMessage: answer.message || null } });
  }
  return loadTransaction(req, record._id);
}

/** GET /terminal-payments/:id. Asks Pine Labs first when waiting and not asked in the last 3 seconds. */
export async function readTerminalPayment(req, id) {
  const record = await loadTransaction(req, id);
  const stale = !record.lastCheckedAt || nowUtc().getTime() - record.lastCheckedAt.getTime() >= READ_REFRESH_MS;
  if (record.status === TERMINAL_STATUSES.WAITING && stale) {
    try {
      return await checkStatus(req, record);
    } catch {
      return record;
    }
  }
  return record;
}

/** POST /terminal-payments/:id/cancel. An approval that arrives first wins. */
export async function cancelTerminalPayment(req, id) {
  const record = await loadTransaction(req, id);
  if (!OPEN.includes(record.status)) throw new BusinessRuleError(`This payment is already ${record.status.toLowerCase()}.`);
  const connection = await pineLabsConnection(req);
  await cancelTransaction(connection, secretsOf(connection), { ptrid: record.ptrid, amountInPaise: record.amountInPaise, clientId: record.terminal.clientId });
  const after = await checkStatus(req, record).catch(() => record);
  if (OPEN.includes(after.status)) {
    await TerminalTransaction.updateOne(
      { ...scoped(req), _id: record._id, status: { $in: OPEN } },
      { $set: { status: TERMINAL_STATUSES.CANCELLED, finishedAt: nowUtc(), lastMessage: 'Cancelled at the counter.' } },
    );
  }
  return loadTransaction(req, record._id);
}

/** A Pine Labs postback: a hint to ask, never an answer in itself. */
export async function processTerminalEvent(job) {
  const ptrid = job.payload?.event?.externalId;
  const ctx = { restaurantId: job.restaurantId, branchId: job.branchId };
  const record = await TerminalTransaction.findOne({ restaurantId: job.restaurantId, ptrid });
  if (!record) return { ignored: 'No such card machine payment.' };
  const actor = await asIntegration(ctx.restaurantId, ctx.branchId, 'Pine Labs');
  await checkStatus(actor, record);
  return { checked: ptrid };
}

/**
 * The checking job: every 30 seconds until the payment finishes, or until the
 * machine's own cancel time plus 5 minutes has passed, when a last check
 * decides and anything still waiting is EXPIRED.
 */
async function checkJob(job) {
  const actor = await asIntegration(job.restaurantId, job.branchId, 'Pine Labs');
  const record = await TerminalTransaction.findOne({ restaurantId: job.restaurantId, _id: job.payload.id });
  if (!record || !OPEN.includes(record.status)) return { done: true };
  const connection = await IntegrationConnection.findOne({ restaurantId: job.restaurantId, _id: record.connectionId });
  const deadline = record.startedAt.getTime() + ((connection?.config?.autoCancelMinutes ?? 5) + 5) * MINUTE_MS;
  const now = nowUtc().getTime();
  const after = await checkStatus(actor, record);
  if (!OPEN.includes(after.status)) return { status: after.status };
  if (now >= deadline) {
    await TerminalTransaction.updateOne(
      { restaurantId: job.restaurantId, _id: record._id, status: { $in: OPEN } },
      { $set: { status: TERMINAL_STATUSES.EXPIRED, finishedAt: nowUtc(), lastMessage: 'Nobody finished it on the machine in time.' } },
    );
    return { status: TERMINAL_STATUSES.EXPIRED };
  }
  await enqueueJob(job, { connectionId: record.connectionId, type: CHECK_TERMINAL, payload: { id: String(record._id) }, runAfter: new Date(now + CHECK_EVERY_MS) });
  return { status: after.status };
}

registerJobHandler(CHECK_TERMINAL, checkJob);

export default { cancelTerminalPayment, checkStatus, processTerminalEvent, readTerminalPayment, startTerminalPayment };
