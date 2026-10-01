/**
 * Cash drawer and Day Close. P10. Every rule is in services/cashService.js and
 * services/dayCloseService.js, including the blind count.
 */
import { listCashMovements, recordCashMovement, voidCashMovement } from '../services/cashService.js';
import { closeDay, listDays, printDay, readDay, reopenDay } from '../services/dayCloseService.js';
import { sendSuccess } from '../utils/response.js';

export async function getCash(req, res) {
  return sendSuccess(res, await listCashMovements(req, req.query));
}

export async function postCash(req, res) {
  return sendSuccess(res, await recordCashMovement(req, req.body), 201);
}

export async function postVoidCash(req, res) {
  return sendSuccess(res, await voidCashMovement(req, req.params.movementId, req.body));
}

export async function postCloseDay(req, res) {
  return sendSuccess(res, await closeDay(req, req.body), 201);
}

export async function getDay(req, res) {
  return sendSuccess(res, await readDay(req, req.params.businessDate));
}

export async function getDays(req, res) {
  return sendSuccess(res, await listDays(req, req.query));
}

export async function getDayPrint(req, res) {
  const { width } = req.query;
  return sendSuccess(res, { width, text: await printDay(req, req.params.businessDate, width) });
}

export async function postReopenDay(req, res) {
  return sendSuccess(res, await reopenDay(req, req.params.businessDate, req.body));
}
