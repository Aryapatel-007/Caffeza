/**
 * A fake AI model in the shape of Anthropic's Messages API, for tests. P39.
 *
 * A test queues what the model should answer: `say(text)`, `useTool(name,
 * input)`, or a function of the request body that returns one of those (to
 * read a tool result and answer with it). The connection test's one-word ask
 * is answered by itself. Every request is kept, so a test can check what the
 * model was sent.
 */
import http from 'node:http';

export const FAKE_AI_KEY = 'fake-anthropic-key-not-real-0001';

export const say = (text) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });
export const useTool = (name, input = {}, id = `toolu_${name}`) => ({ content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use' });

/** The last tool result in a request, parsed. */
export function lastToolResult(body) {
  const blocks = body.messages.at(-1)?.content;
  const result = Array.isArray(blocks) ? blocks.filter((block) => block.type === 'tool_result').at(-1) : null;
  return result ? JSON.parse(result.content) : null;
}

export async function startFakeModel() {
  const state = { queue: [], requests: [] };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      const send = (status, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (req.headers['x-api-key'] !== FAKE_AI_KEY) return send(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      if (String(body.system ?? '').startsWith('Reply with the single word OK')) return send(200, say('OK'));
      state.requests.push(body);
      const next = state.queue.shift();
      if (!next) return send(200, say('Sorry, I did not catch that.'));
      if (next === 'DOWN') return send(529, { error: { type: 'overloaded_error', message: 'Overloaded' } });
      return send(200, typeof next === 'function' ? next(body) : next);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    state,
    script: (...entries) => state.queue.push(...entries),
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}
