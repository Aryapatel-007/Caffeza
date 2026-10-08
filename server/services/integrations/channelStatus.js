/**
 * Which delivery platforms are connected and on, for the inbox and /auth/me.
 * P25 Part H. Kept tiny so the inbox gate and the sign-in read stay cheap.
 */
import { CONNECTION_STATUSES, IntegrationConnection } from '../../models/IntegrationConnection.js';
import { scoped } from '../../utils/scopedQuery.js';
import { PROVIDER_KINDS, providerFor } from './providers.js';

export async function activeOrderChannels(req) {
  const connections = await IntegrationConnection.find({ ...scoped(req), status: CONNECTION_STATUSES.ACTIVE }).select('provider').lean();
  return connections.map((connection) => connection.provider).filter((provider) => providerFor(provider)?.kind === PROVIDER_KINDS.ORDER_CHANNEL);
}

/** P25 Part I. The card machines of an active Pine Labs connection: names and client ids only. */
export async function activeTerminals(req) {
  const connection = await IntegrationConnection.findOne({ ...scoped(req), provider: 'PINE_LABS', status: CONNECTION_STATUSES.ACTIVE }).select('config').lean();
  return (connection?.config?.terminals ?? []).map((terminal) => ({ name: terminal.name, clientId: String(terminal.clientId) }));
}

export default { activeOrderChannels, activeTerminals };
