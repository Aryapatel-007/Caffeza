/**
 * Groq, behind the assistant's one interface. P39, added at Arya's request.
 *
 * Groq speaks the OpenAI chat completions shape: `tools` of type function,
 * `tool_calls` on the answer, and `tool` messages for their results. Its free
 * tier is for testing.
 */
import { postJson } from './http.js';

export const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';

const base = (connection) => String(connection.config?.apiBaseUrl ?? 'https://api.groq.com/openai/v1').replace(/\/$/, '');

function messagesFor(system, messages) {
  const out = [{ role: 'system', content: system }];
  for (const message of messages) {
    if (message.role === 'user') out.push({ role: 'user', content: message.text });
    else if (message.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: message.text || null,
        ...(message.toolCalls?.length
          ? { tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) } })) }
          : {}),
      });
    } else {
      for (const result of message.results) out.push({ role: 'tool', tool_call_id: result.id, content: JSON.stringify(result.content) });
    }
  }
  return out;
}

const parseArguments = (text) => {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
};

export async function complete(connection, secrets, { system, messages, tools = [], maxTokens = 700 }) {
  const answer = await postJson(connection, {
    url: `${base(connection)}/chat/completions`,
    headers: { Authorization: `Bearer ${secrets.apiKey}` },
    body: {
      model: connection.config?.model ?? GROQ_DEFAULT_MODEL,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: messagesFor(system, messages),
      ...(tools.length > 0 ? { tools: tools.map(({ name, description, parameters }) => ({ type: 'function', function: { name, description, parameters } })), tool_choice: 'auto' } : {}),
    },
    kind: 'COMPLETE',
    extraSecrets: [secrets.apiKey],
  });
  const message = answer?.choices?.[0]?.message ?? {};
  const toolCalls = (message.tool_calls ?? []).map((call, index) => ({ id: call.id ?? `call_${index}`, name: call.function?.name, arguments: parseArguments(call.function?.arguments) }));
  return { text: String(message.content ?? '').trim(), toolCalls };
}

export async function testConnection(connection, secrets) {
  const { text } = await complete(connection, secrets, { system: 'Reply with the single word OK.', messages: [{ role: 'user', text: 'Say OK.' }], maxTokens: 20 });
  return text ? { ok: true, message: `Groq answered (${connection.config?.model ?? GROQ_DEFAULT_MODEL}).` } : { ok: false, message: 'Groq gave no answer.' };
}

export default { complete, testConnection };
