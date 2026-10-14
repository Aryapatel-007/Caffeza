/**
 * The server's own records. P30, API-CONTRACT P30 section 3.
 */
import { backupStatus } from '../services/backup/statusService.js';
import { readServerStarts } from '../services/serverStartService.js';
import { sendSuccess } from '../utils/response.js';

/** GET /system/starts. OWNER only. */
export async function getServerStarts(req, res) {
  return sendSuccess(res, await readServerStarts(req, { days: req.query.days }));
}

/** GET /system/backups. OWNER only. P54. */
export async function getServerBackups(req, res) {
  return sendSuccess(res, await backupStatus());
}
