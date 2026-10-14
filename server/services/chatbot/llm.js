/**
 * The assistant's one way to a model. P51 section 6.
 *
 * Messages are the assistant's own shape, mapped by each provider's adapter:
 *   { role: 'user', text }
 *   { role: 'assistant', text, toolCalls: [{ id, name, arguments }] }
 *   { role: 'tool', results: [{ id, name, content }] }
 * The rest of the assistant never knows which provider answered.
 */
import { CONNECTION_STATUSES, IntegrationConnection } from '../../models/IntegrationConnection.js';
import { TURN_ROLES } from '../../models/Conversation.js';
import { secretsOf } from '../integrations/connectionService.js';
import { adapterFor } from '../integrations/providers.js';

/** Anthropic first: a paid key for live guests wins over the free tiers of Groq and Gemini. */
export const AI_PROVIDERS = Object.freeze(['ANTHROPIC', 'GROQ', 'GEMINI']);

/** This branch's AI connection that is on, or null. */
export async function activeAiConnection(ctx) {
  const rows = await IntegrationConnection.find({
    restaurantId: ctx.restaurantId,
    branchId: ctx.branchId,
    provider: { $in: AI_PROVIDERS },
    status: CONNECTION_STATUSES.ACTIVE,
  }).select('+credentials');
  return AI_PROVIDERS.map((provider) => rows.find((row) => row.provider === provider)).find(Boolean) ?? null;
}

export async function complete(connection, args) {
  const adapter = await adapterFor(connection.provider);
  return adapter.complete(connection, secretsOf(connection), args);
}

/**
 * A chat's stored turns as messages. Staff replies read as the restaurant's;
 * results looked up for earlier messages are given back as notes, so a
 * reference or a time offered before is still known. Same roles in a row are
 * joined, and the first message is the guest's, as both providers require.
 */
export function messagesFromTurns(turns) {
  const out = [];
  for (const turn of turns) {
    const role = turn.role === TURN_ROLES.GUEST || turn.role === TURN_ROLES.TOOL ? 'user' : 'assistant';
    const text =
      turn.role === TURN_ROLES.TOOL
        ? `[Earlier result of ${turn.toolName}] ${turn.text}`
        : turn.role === TURN_ROLES.STAFF
          ? `[A person at the restaurant replied] ${turn.text}`
          : turn.text;
    if (!text) continue;
    const last = out.at(-1);
    if (last && last.role === role) last.text = `${last.text}\n\n${text}`;
    else out.push({ role, text });
  }
  while (out.length > 0 && out[0].role !== 'user') out.shift();
  return out;
}

export default { activeAiConnection, AI_PROVIDERS, complete, messagesFromTurns };
