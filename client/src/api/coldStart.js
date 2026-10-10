/**
 * The free server's cold start. P30, API-CONTRACT P30 section 5.
 *
 * Pure functions, no browser and no React, so the server suite tests them the
 * way it tests the client's business date mirror.
 *
 * Render's free plan stops the server after 15 minutes without a request and
 * takes about a minute to wake. While it wakes, a request through Vercel's
 * forwarding can come back 502, 503 or 504, as Render's HTML waiting page
 * instead of JSON, or not at all.
 */

/** About 70 seconds in all, which covers a cold start. */
export const RETRY_DELAYS_MS = Object.freeze([3_000, 6_000, 12_000, 20_000, 30_000]);

/** The statuses a waking server or its proxy answers with. */
const WAKING_STATUSES = new Set([502, 503, 504]);

/** Only a read is ever repeated: a write may have reached the server. */
const READ_METHODS = new Set(['GET']);

/**
 * Whether a failure looks like the server waking rather than the server
 * answering. `contentType` is the response's, when there was one; an answer
 * that should be JSON but is HTML is a proxy's or the host's page, not ours.
 */
export function isColdStartFailure({ status = null, contentType = null, isTimeout = false } = {}) {
  if (isTimeout) return true;
  if (status !== null && WAKING_STATUSES.has(status)) return true;
  if (status !== null && /text\/html/i.test(contentType ?? '')) return true;
  return false;
}

/**
 * How long to wait before trying again, or null not to.
 *
 * `attempt` counts the retries already made, from 0. Only a GET is retried,
 * only for a cold start, and only five times: at 3, 6, 12, 20 and 30 seconds.
 * A POST, PUT, PATCH or DELETE never is, whatever the error: a write that timed
 * out may have reached the server, and a second try could make a second bill
 * or record a payment twice.
 */
export function shouldRetry({ method = 'GET', status = null, contentType = null, isTimeout = false, attempt = 0 } = {}) {
  if (!READ_METHODS.has(String(method).toUpperCase())) return null;
  if (!isColdStartFailure({ status, contentType, isTimeout })) return null;
  return RETRY_DELAYS_MS[attempt] ?? null;
}

const MINUTES_PER_DAY = 1440;
const IST_OFFSET_MINUTES = 330;

/**
 * Whether an instant is within working hours, plus `marginMinutes` either side,
 * in India time. `hours` is `{ opensAtMinutes, closesAtMinutes }`; a closing
 * time not after the opening time is the next morning. No hours means every
 * hour is a working hour.
 */
export function withinWorkingHours(nowMs, hours, marginMinutes = 30) {
  if (!hours || !Number.isInteger(hours.opensAtMinutes) || !Number.isInteger(hours.closesAtMinutes)) return true;
  const minute = (((Math.floor(nowMs / 60_000) + IST_OFFSET_MINUTES) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const opens = hours.opensAtMinutes - marginMinutes;
  const closes =
    (hours.closesAtMinutes > hours.opensAtMinutes ? hours.closesAtMinutes : hours.closesAtMinutes + MINUTES_PER_DAY) +
    marginMinutes;
  if (closes - opens >= MINUTES_PER_DAY) return true;
  // The window, and the same window a day earlier and later, so a window
  // crossing midnight, or reaching back before it with the margin, is found.
  return [-MINUTES_PER_DAY, 0, MINUTES_PER_DAY].some((shift) => minute + shift >= opens && minute + shift < closes);
}
