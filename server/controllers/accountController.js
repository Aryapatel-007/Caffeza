/**
 * On Hold accounts and platform payouts. P09. Every rule is in
 * services/accountService.js and services/payoutService.js.
 */
import {
  adjustBalance,
  chargeBillToAccount,
  createAccount,
  listAccounts,
  recordCollection,
  statementFor,
  updateAccount,
} from '../services/accountService.js';
import { listPayouts, recordPayout, voidPayout } from '../services/payoutService.js';
import { sendSuccess } from '../utils/response.js';

export async function getAccounts(req, res) {
  return sendSuccess(res, await listAccounts(req, { includeInactive: req.query.includeInactive }));
}

export async function postAccount(req, res) {
  return sendSuccess(res, await createAccount(req, req.body), 201);
}

export async function patchAccount(req, res) {
  return sendSuccess(res, await updateAccount(req, req.params.accountId, req.body));
}

export async function postChargeToAccount(req, res) {
  return sendSuccess(res, await chargeBillToAccount(req, req.params.billId, req.body));
}

export async function postCollection(req, res) {
  return sendSuccess(res, await recordCollection(req, req.params.accountId, req.body), 201);
}

export async function postAdjustment(req, res) {
  return sendSuccess(res, await adjustBalance(req, req.params.accountId, req.body), 201);
}

export async function getStatement(req, res) {
  return sendSuccess(res, await statementFor(req, req.params.accountId, req.query));
}

export async function getPayouts(req, res) {
  return sendSuccess(res, await listPayouts(req, req.query));
}

export async function postPayout(req, res) {
  return sendSuccess(res, await recordPayout(req, req.body), 201);
}

export async function postVoidPayout(req, res) {
  return sendSuccess(res, await voidPayout(req, req.params.payoutId, req.body));
}
