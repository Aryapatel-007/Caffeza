/**
 * Health check.
 *
 * The one endpoint in M0 part A. It exists to prove the server booted and can
 * see its database, and it is the thing a monitor will poll every minute
 * forever, so it stays cheap: no queries, no writes.
 */
import { isDatabaseConnected } from '../config/database.js';
import { config } from '../config/env.js';
import { sendSuccess } from '../utils/response.js';

export function getHealth(req, res) {
  sendSuccess(res, {
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    // Read live from the driver every time. A cached "connected" is a lie
    // waiting to happen, and this is the endpoint people trust when something
    // is wrong at 9pm.
    database: isDatabaseConnected() ? 'connected' : 'disconnected',
    environment: config.NODE_ENV,
  });
}
