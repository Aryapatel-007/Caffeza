/**
 * The status token for each request this browser placed. P23.
 *
 * A per-viewer convenience: it lets the guest's status page keep working after
 * a reload. Wrapped in try/catch, because a private window can refuse storage;
 * without it the page still places the request and says to call the cafe.
 */
// Named before P25 for the first client. Kept so a guest's open request stays
// readable on their phone; nobody ever sees it.
const PREFIX = 'caffeza.public.token.';

export function rememberToken(id, token) {
  try {
    if (token) window.localStorage.setItem(PREFIX + id, token);
  } catch {
    // Storage refused. The status page will say to call.
  }
}

export function tokenFor(id) {
  try {
    return window.localStorage.getItem(PREFIX + id);
  } catch {
    return null;
  }
}

/** A UUID per attempt, so a double tap or a retry never places twice. */
export function newIdempotencyKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
