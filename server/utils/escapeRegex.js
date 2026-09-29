/**
 * Escapes a user-supplied string so it cannot act as a regular expression.
 *
 * Every search box on this server passes its input through here before building
 * a pattern. Unescaped, a search for ".*" matches every row, which turns a
 * search box into a full collection scan and into a way to enumerate records
 * the caller was never shown.
 *
 * docs/PROJECT-STATE.md logs this as a decision from M0-C and says to do the
 * same on any new search box. M1 does, through this shared copy rather than a
 * second private one.
 */
export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default escapeRegex;
