/**
 * A small fake of Meta's WhatsApp Cloud API, for tests and the browser tests.
 * P37. It answers the number read-back, sending a message, listing and
 * submitting templates, in the shapes of Meta's public reference.
 *
 * Every value here is made up for the fake: never a real or published Meta id,
 * token or secret.
 */
import http from 'node:http';

export const GOOD = Object.freeze({
  phoneNumberId: '100000000000001',
  wabaId: '200000000000002',
  accessToken: 'fake-meta-access-token-not-real-0001',
  webhookVerifyToken: 'fake-verify-token-not-real-0001',
  appSecret: 'fake-meta-app-secret-not-real-0001',
});

export async function startFakeMeta({ port = 0, host = '127.0.0.1' } = {}) {
  const state = {
    next: 1,
    platformType: 'CLOUD_API',
    templates: [],
    messages: [],
    requests: [],
    /** The next message send answers this Meta error code with a 400, once. */
    refuseNext: null,
    /** Every message send answers 503 while true. */
    down: false,
  };

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const url = new URL(req.url, 'http://fake');
      const body = raw ? JSON.parse(raw) : null;
      state.requests.push({ method: req.method, path: url.pathname, body });
      const send = (status, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (req.headers.authorization !== `Bearer ${GOOD.accessToken}`) {
        return send(401, { error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190 } });
      }
      const parts = url.pathname.split('/').filter(Boolean);
      const id = parts.at(-2) ?? parts.at(-1);

      if (req.method === 'GET' && parts.at(-1) === GOOD.phoneNumberId) {
        return send(200, { id: GOOD.phoneNumberId, verified_name: 'Fake Restaurant', quality_rating: 'GREEN', platform_type: state.platformType });
      }
      if (req.method === 'POST' && parts.at(-1) === 'messages' && id === GOOD.phoneNumberId) {
        if (state.down) return send(503, { error: { message: 'Service unavailable.', code: 2 } });
        if (state.refuseNext) {
          const code = state.refuseNext;
          state.refuseNext = null;
          return send(400, { error: { message: `Refused with ${code}.`, code } });
        }
        const messageId = `wamid.fake${state.next++}`;
        state.messages.push({ id: messageId, ...body });
        return send(200, { messaging_product: 'whatsapp', contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id: messageId }] });
      }
      if (parts.at(-1) === 'message_templates' && id === GOOD.wabaId) {
        if (req.method === 'GET') return send(200, { data: state.templates });
        const template = { id: String(900000 + state.next++), name: body.name, language: body.language, category: body.category, status: 'PENDING', rejected_reason: 'NONE' };
        state.templates.push(template);
        return send(200, { id: template.id, status: 'PENDING', category: body.category });
      }
      return send(404, { error: { message: 'Unknown path in the fake.', code: 100 } });
    });
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  const url = `http://${host}:${server.address().port}/v21.0`;

  return {
    url,
    state,
    /** Meta's reviewer approves a template, in the category it chooses. */
    approve(name, category = null) {
      const template = state.templates.find((entry) => entry.name === name);
      template.status = 'APPROVED';
      if (category) template.category = category;
    },
    /** A template made by hand in Meta's own screens, already approved. */
    addApproved({ name, language = 'en', category = 'UTILITY' }) {
      state.templates.push({ id: String(900000 + state.next++), name, language, category, status: 'APPROVED', rejected_reason: 'NONE' });
    },
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}
