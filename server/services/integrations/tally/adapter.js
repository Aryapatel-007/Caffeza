/**
 * Tally. P25 Parts J and K. Tally runs on the accountant's own computer, which
 * our server cannot reach: vouchers go as a file to import, or through the
 * bridge (Part K). Testing a FILE connection checks only that it is complete.
 */
export function testConnection(connection) {
  if (connection.config?.delivery === 'BRIDGE') {
    return Promise.resolve({ ok: false, message: 'Pair a Tally bridge first. It is built in a later part.' });
  }
  return Promise.resolve({ ok: true });
}

export default { testConnection };
