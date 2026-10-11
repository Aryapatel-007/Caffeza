/**
 * Google's Gemini, behind the assistant's one interface. P39.
 *
 * Messages come in the assistant's own shape (services/chatbot/llm.js) and are
 * mapped here to Gemini's `generateContent`: function declarations for the
 * tools, `functionCall` and `functionResponse` parts for their use.
 */
import { postJson } from './http.js';

const base = (connection) => String(connection.config?.apiBaseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');

function contentsFor(messages) {
  return messages.map((message) => {
    if (message.role === 'user') return { role: 'user', parts: [{ text: message.text }] };
    if (message.role === 'assistant') {
      return {
        role: 'model',
        parts: [
          ...(message.text ? [{ text: message.text }] : []),
          ...(message.toolCalls ?? []).map((call) => ({ functionCall: { name: call.name, args: call.arguments ?? {} } })),
        ],
      };
    }
    return { role: 'user', parts: message.results.map((result) => ({ functionResponse: { name: result.name, response: { result: result.content } } })) };
  });
}

export async function complete(connection, secrets, { system, messages, tools = [], maxTokens = 700 }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: contentsFor(messages),
    generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
    ...(tools.length > 0 ? { tools: [{ functionDeclarations: tools.map(({ name, description, parameters }) => ({ name, description, parameters })) }] } : {}),
  };
  const answer = await postJson(connection, {
    url: `${base(connection)}/models/${encodeURIComponent(connection.config?.model ?? 'gemini-2.5-flash')}:generateContent`,
    headers: { 'x-goog-api-key': secrets.apiKey },
    body,
    kind: 'COMPLETE',
    extraSecrets: [secrets.apiKey],
  });
  const parts = answer?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((part) => typeof part.text === 'string' && !part.thought).map((part) => part.text).join('').trim();
  const toolCalls = parts
    .filter((part) => part.functionCall?.name)
    .map((part, index) => ({ id: `call_${index}`, name: part.functionCall.name, arguments: part.functionCall.args ?? {} }));
  return { text, toolCalls };
}

export async function testConnection(connection, secrets) {
  const { text } = await complete(connection, secrets, { system: 'Reply with the single word OK.', messages: [{ role: 'user', text: 'Say OK.' }], maxTokens: 20 });
  return text ? { ok: true, message: `Gemini answered (${connection.config?.model ?? 'gemini-2.5-flash'}).` } : { ok: false, message: 'Gemini gave no answer.' };
}

export default { complete, testConnection };
