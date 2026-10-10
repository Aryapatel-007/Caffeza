/**
 * When this server process started. P30.
 *
 * Read from the process's own uptime once, when the module loads, so every
 * answer of `/wake` and `/health` and the `serverstarts` row agree on one
 * instant. This is the real clock on purpose: it describes the process, not a
 * business event, so the test clock (`nowUtc`) has no say in it.
 */
export const PROCESS_STARTED_AT = new Date(Date.now() - Math.round(process.uptime() * 1000));

/** Whole seconds since the process started. */
export function uptimeSeconds() {
  return Math.floor(process.uptime());
}
