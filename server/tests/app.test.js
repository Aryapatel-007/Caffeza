/**
 * Application smoke tests.
 *
 * Drives the real middleware chain over a real socket. No database: the health
 * endpoint reads the connection state live, so with nothing running it should
 * honestly report "disconnected" rather than pretending.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { config } from '../config/env.js';
import { createApp } from '../server.js';

let server;
let baseUrl;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

describe('GET /api/v1/health', () => {
  it('returns the success envelope with the documented fields', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(Object.keys(body).sort(), ['data', 'success']);
    assert.deepEqual(
      Object.keys(body.data).sort(),
      // `release` added by P12, from RELEASE_VERSION.
      ['database', 'environment', 'release', 'status', 'uptimeSeconds'],
    );

    assert.equal(body.data.status, 'ok');
    assert.equal(Number.isInteger(body.data.uptimeSeconds), true);
    assert.ok(['connected', 'disconnected'].includes(body.data.database));
    assert.equal(typeof body.data.environment, 'string');
  });

  it('reports the live connection state rather than a hardcoded value', async () => {
    const body = await (await fetch(`${baseUrl}/api/v1/health`)).json();
    // Nothing has connected in this process, so this must not say connected.
    assert.equal(body.data.database, 'disconnected');
  });

  it('carries a request id back to the caller', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    assert.match(response.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
  });

  it('sets security headers and does not advertise the framework', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });
});

describe('trust proxy', () => {
  it('is set from TRUST_PROXY, which is false under the test environment', () => {
    assert.equal(createApp().get('trust proxy'), config.TRUST_PROXY);
    assert.equal(config.TRUST_PROXY, false);
  });
});

describe('unmatched routes', () => {
  it('returns the standard 404 envelope, not an HTML error page', async () => {
    const response = await fetch(`${baseUrl}/api/v1/does-not-exist`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.equal(typeof body.error.message, 'string');
    // fields is only present on validation errors.
    assert.equal('fields' in body.error, false);
  });

  it('does the same outside the API prefix', async () => {
    const response = await fetch(`${baseUrl}/anything-at-all`);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'NOT_FOUND');
  });

  it('does the same for a method that is not wired', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`, { method: 'DELETE' });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'NOT_FOUND');
  });
});

describe('malformed input', () => {
  it('answers bad JSON with the standard envelope, not a stack trace', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ this is not json',
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'VALIDATION_FAILED');
    assert.equal(JSON.stringify(body).includes('at Object'), false);
  });
});
