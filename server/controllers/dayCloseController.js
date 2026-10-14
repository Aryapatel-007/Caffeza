/**
 * Cash drawer and Day Close. P10. Every rule is in services/cashService.js and
 * services/dayCloseService.js, including the blind count.
 */
import { listCashMovements, readCashBook, recordCashMovement, voidCashMovement } from '../services/cashService.js';
import { closeDay, emailDayEnd, listDays, printDay, readDay, reopenDay } from '../services/dayCloseService.js';
import { buildDayEndMessage } from '../services/dayEndMessageService.js';
import { sendSuccess } from '../utils/response.js';

export async function getCash(req, res) {
  return sendSuccess(res, await listCashMovements(req, req.query));
}

/** GET /cash-book. P29 Part F. The day's cash as one flow; the total only for those who may see it. */
export async function getCashBook(req, res) {
  return sendSuccess(res, await readCashBook(req, req.query));
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

/** GET /day-close/:businessDate/message. P44. Cash in hand reads "—" for a blind manager. */
export async function getDayMessage(req, res) {
  return sendSuccess(res, await buildDayEndMessage(req, req.params.businessDate));
}

/** POST /day-close/:businessDate/email. P44. To the addresses in Settings, never anywhere else. */
export async function postDayEmail(req, res) {
  const result = await emailDayEnd(req, req.params.businessDate);
  return sendSuccess(res, { sentTo: result.to });
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
