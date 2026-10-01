/**
 * Kitchen station API calls. M18, P05.
 * Shapes from docs/API-CONTRACT.md section M18.
 */
import { api, requestWithMeta } from './client.js';

export function listStations({ includeInactive = false } = {}) {
  return api.get(`/stations${includeInactive ? '?includeInactive=true' : ''}`);
}

export function createStation({ name, displayOrder, printsTickets }) {
  return api.post('/stations', { name, displayOrder, printsTickets });
}

/**
 * Any of name, displayOrder, printsTickets, isActive. Returns `{ data, meta }`:
 * `meta.categoriesFallingBack` says how many categories now route to the
 * default station because this one was switched off.
 */
export function updateStation(stationId, changes) {
  return requestWithMeta(`/stations/${stationId}`, { method: 'PATCH', body: changes });
}
