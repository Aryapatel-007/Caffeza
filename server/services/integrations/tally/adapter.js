/**
 * Tally. P25 Parts J and K. Tally runs on the accountant's own computer, which
 * our server cannot reach: vouchers go as a file to import, or through the
 * bridge. Testing a FILE connection checks only that it is complete; a BRIDGE
 * connection also needs a paired bridge.
 */
import { hasActiveBridge } from './bridgeService.js';

export async function testConnection(connection) {
  if (connection.config?.delivery === 'BRIDGE' && !(await hasActiveBridge(connection))) {
    return { ok: false, message: 'Pair a Tally bridge first, on the computer that runs Tally.' };
  }
  return { ok: true };
}

export default { testConnection };
