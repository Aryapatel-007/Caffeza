/**
 * M21 Tally exports. P25 Part J, API-CONTRACT M21 section 9.3.
 * Thin: every rule is in services/integrations/tally/exportService.js.
 */
import { createExports, exportFile, ledgerMastersFile, listDays, redoExport } from '../services/integrations/tally/exportService.js';
import { createPairingCode, listBridges, revokeBridge, sendExport } from '../services/integrations/tally/bridgeService.js';
import { sendSuccess } from '../utils/response.js';

function sendXml(res, { xml, fileName }) {
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.status(200).send(xml);
}

/** GET /integrations/tally/days */
export async function getTallyDays(req, res) {
  return sendSuccess(res, await listDays(req, req.query));
}

/** POST /integrations/tally/exports */
export async function postTallyExports(req, res) {
  return sendSuccess(res, await createExports(req, req.body), 201);
}

/** GET /integrations/tally/exports/:id/file */
export async function getTallyExportFile(req, res) {
  return sendXml(res, await exportFile(req, req.params.id));
}

/** POST /integrations/tally/exports/:id/redo */
export async function postTallyRedo(req, res) {
  return sendSuccess(res, await redoExport(req, req.params.id, req.body), 201);
}

/** GET /integrations/tally/ledger-masters/file */
export async function getLedgerMastersFile(req, res) {
  return sendXml(res, await ledgerMastersFile(req));
}

/* P25 Part K. The bridge, from the owner's and manager's side. ---------- */

/** POST /integrations/tally/exports/:id/send */
export async function postTallySend(req, res) {
  return sendSuccess(res, await sendExport(req, req.params.id));
}

/** POST /integrations/tally/bridges/pairing-code. The code, once. */
export async function postPairingCode(req, res) {
  return sendSuccess(res, await createPairingCode(req, req.body), 201);
}

/** GET /integrations/tally/bridges */
export async function getBridges(req, res) {
  return sendSuccess(res, await listBridges(req));
}

/** POST /integrations/tally/bridges/:id/revoke */
export async function postRevokeBridge(req, res) {
  return sendSuccess(res, await revokeBridge(req, req.params.id));
}
