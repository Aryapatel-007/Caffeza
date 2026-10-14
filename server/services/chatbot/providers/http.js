/**
 * One call to an AI provider. P51.
 *
 * The event line records that a call happened, how long it took and how it
 * ended: never the prompt or the answer, which carry what a guest wrote. A key
 * travels in a header, never in an address.
 */
import { PartnerCallFailedError } from '../../../utils/errors.js';
import { logEvent } from '../../integrations/eventLog.js';

export const AI_TIMEOUT_MS = 20_000;

export async function postJson(connection, { url, headers, body, kind, extraSecrets = [] }) {
  const started = Date.now();
  let status = null;
  let parsed = null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    status = response.status;
    parsed = await response.json().catch(() => null);
    if (!response.ok) {
      const message = parsed?.error?.message ?? `The AI answered ${status}.`;
      throw Object.assign(new Error(String(message).slice(0, 300)), { httpStatus: status });
    }
  } catch (error) {
    if (!connection.skipLog) await logEvent(connection, { direction: 'OUT', kind, outcome: 'FAILED', httpStatus: status, durationMs: Date.now() - started, error: error.message, extraSecrets });
    throw new PartnerCallFailedError(error?.name === 'TimeoutError' ? 'The AI did not answer in time.' : `The AI could not answer: ${error.message}`);
  }
  // `skipLog`: the eval script's calls, which belong to no restaurant.
  if (!connection.skipLog) await logEvent(connection, { direction: 'OUT', kind, outcome: 'OK', httpStatus: status, durationMs: Date.now() - started, extraSecrets });
  return parsed;
}

export default { postJson };
