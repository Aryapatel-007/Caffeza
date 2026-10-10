/**
 * Health check.
 *
 * The one endpoint in M0 part A. It exists to prove the server booted and can
 * see its database, and it is the thing a monitor will poll every minute
 * forever, so it stays cheap: no queries, no writes.
 */
import { isDatabaseConnected } from '../config/database.js';
import { config } from '../config/env.js';
import { PROCESS_STARTED_AT, uptimeSeconds } from '../utils/processStart.js';
import { sendSuccess } from '../utils/response.js';

/** P30. A cached answer would not keep the server awake, nor say whether it is up. */
const NO_STORE = 'no-store';

export function getHealth(req, res) {
  res.set('Cache-Control', NO_STORE);
  sendSuccess(res, {
    status: 'ok',
    // P30. When this process started, beside how long ago that was.
    startedAt: PROCESS_STARTED_AT,
    uptimeSeconds: uptimeSeconds(),
    // Read live from the driver every time. A cached "connected" is a lie
    // waiting to happen, and this is the endpoint people trust when something
    // is wrong at 9pm.
    database: isDatabaseConnected() ? 'connected' : 'disconnected',
    environment: config.NODE_ENV,
    // P12. The commit the host deployed, or null when RELEASE_VERSION is unset.
    release: config.RELEASE_VERSION,
  });
}

/**
 * GET /wake. P30, API-CONTRACT P30 section 1.
 *
 * What cron-job.org, StatusCake, the GitHub Actions backup and every open
 * screen call to keep Render's free server from sleeping. It touches no
 * database, so it costs nothing and answers even while the database is down.
 */
export function getWake(req, res) {
  res.set('Cache-Control', NO_STORE);
  sendSuccess(res, { ok: true, startedAt: PROCESS_STARTED_AT, uptimeSeconds: uptimeSeconds() });
}
