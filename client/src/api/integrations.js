/**
 * M21 Integrations. P25 Parts G to L, API-CONTRACT M21.
 * Connections, their event log, alerts, item mapping, and Tally.
 */
import { api, downloadFile, requestWithMeta } from './client.js';

export const listIntegrations = () => api.get('/integrations');
export const saveIntegration = (provider, body) => api.put(`/integrations/${provider}`, body);
export const testIntegration = (provider) => api.post(`/integrations/${provider}/test`, {});
export const pauseIntegration = (provider) => api.post(`/integrations/${provider}/pause`, {});
export const resumeIntegration = (provider) => api.post(`/integrations/${provider}/resume`, {});
export const newWebhookAddress = (provider) => api.post(`/integrations/${provider}/webhook-key`, {});
export const listEvents = (provider, { page = 1, limit = 20 } = {}) => requestWithMeta(`/integrations/${provider}/events?page=${page}&limit=${limit}`);

export const listAlerts = () => api.get('/integrations/alerts');
export const acknowledgeAlert = ({ kind, id }) => api.post('/integrations/alerts/acknowledge', { kind, id });

export const listMappings = (provider) => requestWithMeta(`/integrations/${provider}/item-mappings?limit=200`);
export const listUnmapped = (provider) => api.get(`/integrations/${provider}/item-mappings/unmapped`);
export const saveMapping = (provider, body) => api.put(`/integrations/${provider}/item-mappings`, body);
export const deleteMapping = (provider, mappingId) => api.delete(`/integrations/${provider}/item-mappings/${mappingId}`);

export const listTallyDays = ({ from, to }) => api.get(`/integrations/tally/days?from=${from}&to=${to}`);
export const createTallyExports = ({ from, to }) => api.post('/integrations/tally/exports', { from, to });
export const downloadTallyExport = (id) => downloadFile(`/integrations/tally/exports/${id}/file`);
export const sendTallyExport = (id) => api.post(`/integrations/tally/exports/${id}/send`, {});
export const redoTallyExport = (id, confirmation) => api.post(`/integrations/tally/exports/${id}/redo`, { confirmation });
export const downloadLedgerMasters = () => downloadFile('/integrations/tally/ledger-masters/file');
export const listBridges = () => api.get('/integrations/tally/bridges');
export const makePairingCode = (name) => api.post('/integrations/tally/bridges/pairing-code', { name });
export const revokeBridge = (id) => api.post(`/integrations/tally/bridges/${id}/revoke`, {});

/** Saves a downloaded file under its own name. */
export function saveFile({ blob, fileName }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
