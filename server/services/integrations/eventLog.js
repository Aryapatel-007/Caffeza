/**
 * Writes one line per call to or from a partner. P25 Part G. Every line goes
 * through redactForLog; this is the only writer of `integrationevents`.
 */
import { IntegrationEvent } from '../../models/IntegrationEvent.js';
import { nowUtc } from '../../utils/time.js';
import { redactForLog } from './redact.js';

export async function logEvent(connection, { direction, kind, externalId = null, outcome, httpStatus = null, durationMs = null, request = null, response = null, error = null, extraSecrets = [] }, session = null) {
  const [event] = await IntegrationEvent.create(
    [
      {
        restaurantId: connection.restaurantId,
        branchId: connection.branchId,
        connectionId: connection._id,
        provider: connection.provider,
        direction,
        kind,
        externalId: externalId === null ? null : String(externalId).slice(0, 100),
        outcome,
        httpStatus,
        durationMs,
        request: redactForLog(request, connection.provider, { extraSecrets }),
        response: redactForLog(response, connection.provider, { extraSecrets }),
        error: error ? String(error).slice(0, 500) : null,
        at: nowUtc(),
      },
    ],
    session ? { session } : {},
  );
  return event;
}

export default { logEvent };
