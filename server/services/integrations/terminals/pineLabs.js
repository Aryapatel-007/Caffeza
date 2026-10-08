/**
 * Pine Labs in-store cloud integration. P25 Part I, API-CONTRACT M21 section 8.
 *
 * Built from Pine Labs' public page,
 * https://developer.pinelabs.com/in/instore/cloud-integration, read on
 * 8 October 2026:
 *
 *   UploadBilledTransaction posts the amount (in paise) and answers with a
 *   PlutusTransactionReferenceID, the PTRID, which the cashier picks on the
 *   machine. GetStatus reads the result: ResponseCode 0, "TXN APPROVED", with
 *   TransactionData as Tag and Value pairs (RRN, ApprovalCode, TID, MID,
 *   PaymentMode, AmountInPaisa, CardNumber). 1008 is "TXN VOIDED".
 *
 * Not on the public page, so not guessed: the URL path of each call (kept in
 * the connection's `paths`, from the document Pine Labs sends with the
 * credentials), the production address, Cancel's exact fields, and the codes
 * for a declined or still-waiting payment. Anything not understood leaves the
 * payment waiting, and the payment expires after its time; it is never taken
 * as approved. docs/INTEGRATIONS.md lists each gap.
 */
import { PartnerCallFailedError } from '../../../utils/errors.js';
import { logEvent } from '../eventLog.js';

export const CALL_TIMEOUT_MS = 8_000;
const APPROVED_CODE = 0;
const VOIDED_CODE = 1008;

/** A number field Pine Labs calls N, sent as a number when it is one. */
const numeric = (value) => (/^\d+$/.test(String(value ?? '')) ? Number(value) : value);

async function post(connection, secrets, pathKey, body, { kind, externalId = null }) {
  const url = `${connection.config.baseUrl.replace(/\/$/, '')}${connection.config.paths[pathKey]}`;
  const started = Date.now();
  let status = null;
  let parsed = null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    status = response.status;
    parsed = await response.json().catch(() => null);
    if (!response.ok || !parsed) throw new Error(`Pine Labs answered ${response.status}.`);
  } catch (error) {
    await logEvent(connection, { direction: 'OUT', kind, externalId, outcome: 'FAILED', httpStatus: status, durationMs: Date.now() - started, request: body, response: parsed, error: error.message, extraSecrets: Object.values(secrets) });
    throw new PartnerCallFailedError(error?.name === 'TimeoutError' ? 'The card machine service did not answer in time.' : 'The card machine service could not be reached.');
  }
  await logEvent(connection, { direction: 'OUT', kind, externalId, outcome: 'OK', httpStatus: status, durationMs: Date.now() - started, request: body, response: parsed, extraSecrets: Object.values(secrets) });
  return parsed;
}

/** The fields every call carries to say who is asking. */
const who = (connection, secrets, clientId) => ({
  MerchantID: numeric(secrets.merchantId),
  SecurityToken: secrets.securityToken,
  ...(connection.config.storeId ? { StoreId: numeric(connection.config.storeId) } : {}),
  ClientId: numeric(clientId),
});

/** UploadBilledTransaction. Returns `{ ok, ptrid, message }`. */
export async function uploadBilledTransaction(connection, secrets, { transactionNumber, sequenceNumber, allowedPaymentMode, amountInPaise, clientId, userId = null }) {
  const response = await post(
    connection,
    secrets,
    'upload',
    {
      TransactionNumber: transactionNumber,
      SequenceNumber: sequenceNumber,
      AllowedPaymentMode: String(allowedPaymentMode),
      Amount: amountInPaise,
      ...(userId ? { UserID: String(userId) } : {}),
      ...who(connection, secrets, clientId),
      AutoCancelDurationInMinutes: connection.config.autoCancelMinutes ?? 5,
    },
    { kind: 'UploadBilledTransaction', externalId: transactionNumber },
  );
  const ok = Number(response.ResponseCode) === APPROVED_CODE && response.PlutusTransactionReferenceID !== undefined;
  return { ok, ptrid: ok ? String(response.PlutusTransactionReferenceID) : null, message: String(response.ResponseMessage ?? '') };
}

/** TransactionData's Tag and Value pairs as one object. */
function tagsOf(data) {
  const out = {};
  for (const pair of Array.isArray(data) ? data : []) {
    if (pair && typeof pair.Tag === 'string') out[pair.Tag] = pair.Value;
  }
  return out;
}

/**
 * What GetStatus says, in our words: `{ status, result, message }`. Approved
 * only on ResponseCode 0 with an amount; voided on 1008; declined when the
 * message says so; otherwise still waiting.
 */
export function interpretStatus(response) {
  const code = Number(response?.ResponseCode);
  const message = String(response?.ResponseMessage ?? '');
  const tags = tagsOf(response?.TransactionData);
  if (code === APPROVED_CODE && tags.AmountInPaisa !== undefined) {
    return {
      status: 'APPROVED',
      message,
      result: {
        rrn: tags.RRN ?? null,
        approvalCode: tags.ApprovalCode ?? null,
        tid: tags.TID ?? null,
        mid: tags.MID ?? null,
        paymentMode: tags.PaymentMode ?? null,
        amountInPaise: Number(tags.AmountInPaisa),
        // As the machine sends it, masked. Never anything more.
        maskedCard: typeof tags.CardNumber === 'string' && /[*Xx]/.test(tags.CardNumber) ? tags.CardNumber : null,
      },
    };
  }
  if (code === VOIDED_CODE || /void|cancel/i.test(message)) return { status: 'CANCELLED', message, result: null };
  if (code !== APPROVED_CODE && /declin|fail|reject/i.test(message)) return { status: 'DECLINED', message, result: null };
  return { status: 'WAITING', message, result: null };
}

/** GetStatus. */
export async function getStatus(connection, secrets, { ptrid, transactionNumber = null, clientId }) {
  const response = await post(
    connection,
    secrets,
    'status',
    { ...who(connection, secrets, clientId), PlutusTransactionReferenceID: numeric(ptrid), ...(transactionNumber ? { TransactionNumber: transactionNumber } : {}) },
    { kind: 'GetStatus', externalId: ptrid },
  );
  return interpretStatus(response);
}

/**
 * CancelTransaction. Its fields are not on the public page: these are the
 * fields GetStatus takes plus the amount, until Pine Labs' document says
 * otherwise (docs/INTEGRATIONS.md).
 */
export async function cancelTransaction(connection, secrets, { ptrid, amountInPaise, clientId }) {
  const response = await post(
    connection,
    secrets,
    'cancel',
    { ...who(connection, secrets, clientId), PlutusTransactionReferenceID: numeric(ptrid), Amount: amountInPaise },
    { kind: 'CancelTransaction', externalId: ptrid },
  );
  return { ok: Number(response.ResponseCode) === APPROVED_CODE, message: String(response.ResponseMessage ?? '') };
}

/** The postback is a hint only, always confirmed with GetStatus, so it needs no signature. */
export function verifyWebhook() {
  return true;
}

export function parseWebhook({ rawBody }) {
  const body = JSON.parse(rawBody.toString('utf8'));
  const ptrid = body?.PlutusTransactionReferenceID ?? body?.ptrid;
  return ptrid === undefined ? [] : [{ type: 'TERMINAL_POSTBACK', externalId: String(ptrid) }];
}

/**
 * Reaches the service with a GetStatus for a reference that does not exist:
 * any answer in Pine Labs' shape means the address and paths are right.
 */
export async function testConnection(connection, secrets) {
  const terminal = connection.config?.terminals?.[0];
  if (!terminal) return { ok: false, message: 'Add a card machine first.' };
  try {
    const response = await post(connection, secrets, 'status', { ...who(connection, secrets, terminal.clientId), PlutusTransactionReferenceID: 0 }, { kind: 'TestConnection' });
    return response?.ResponseCode === undefined ? { ok: false, message: 'Pine Labs answered, but not in the shape expected.' } : { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

export default { cancelTransaction, getStatus, interpretStatus, parseWebhook, testConnection, uploadBilledTransaction, verifyWebhook };
