/**
 * Anthropic's Claude, behind the assistant's one interface. P51.
 *
 * Messages come in the assistant's own shape (services/chatbot/llm.js) and are
 * mapped here to the Messages API: `tool_use` and `tool_result` blocks.
 */
import { postJson } from './http.js';

export const ANTHROPIC_VERSION = '2023-06-01';

const base = (connection) => String(connection.config?.apiBaseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');

function messagesFor(messages) {
  return messages.map((message) => {
    if (message.role === 'user') return { role: 'user', content: message.text };
    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        content: [
          ...(message.text ? [{ type: 'text', text: message.text }] : []),
          ...(message.toolCalls ?? []).map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments ?? {} })),
        ],
      };
    }
    return {
      role: 'user',
      content: message.results.map((result) => ({ type: 'tool_result', tool_use_id: result.id, content: JSON.stringify(result.content) })),
    };
  });
}

export async function complete(connection, secrets, { system, messages, tools = [], maxTokens = 700 }) {
  const answer = await postJson(connection, {
    url: `${base(connection)}/v1/messages`,
    headers: { 'x-api-key': secrets.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    body: {
      model: connection.config?.model ?? 'claude-haiku-5-5',
      max_tokens: maxTokens,
      temperature: 0.2,
      system,
      messages: messagesFor(messages),
      ...(tools.length > 0 ? { tools: tools.map(({ name, description, parameters }) => ({ name, description, input_schema: parameters })) } : {}),
    },
    kind: 'COMPLETE',
    extraSecrets: [secrets.apiKey],
  });
  const blocks = answer?.content ?? [];
  const text = blocks.filter((block) => block.type === 'text').map((block) => block.text).join('').trim();
  const toolCalls = blocks.filter((block) => block.type === 'tool_use').map((block) => ({ id: block.id, name: block.name, arguments: block.input ?? {} }));
  return { text, toolCalls };
}

export async function testConnection(connection, secrets) {
  const { text } = await complete(connection, secrets, { system: 'Reply with the single word OK.', messages: [{ role: 'user', text: 'Say OK.' }], maxTokens: 20 });
  return text ? { ok: true, message: `Claude answered (${connection.config?.model ?? 'claude-haiku-5-5'}).` } : { ok: false, message: 'Claude gave no answer.' };
}

export default { complete, testConnection };
