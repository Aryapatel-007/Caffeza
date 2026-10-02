/**
 * The browser-test server, P21: its clock control never reaches the app.
 *
 * `scripts/e2eServer.js` moves the clock and empties its database through a
 * separate listener that exists only inside that script. These check that the
 * app itself has no such route, that no route file can set the clock, and that
 * the script refuses to start anywhere but test.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('the e2e clock control is not part of the app', () => {
  before(async () => {
    await startTestServer();
  });
  after(async () => {
    await stopTestServer();
  });

  it('createApp() answers 404 to every clock and reset path', async () => {
    for (const method of ['GET', 'POST']) {
      for (const route of ['/clock', '/reset', '/ready', '/api/v1/clock', '/api/v1/reset', '/api/v1/test/clock', '/api/v1/e2e/reset']) {
        const response = await request(method, route, { body: method === 'POST' ? { at: '2026-09-26T06:30:00Z' } : undefined });
        assert.equal(response.status, 404, `${method} ${route} answered ${response.status}`);
      }
    }
  });

  it('no route, controller or the app itself can set the clock or import the e2e script', () => {
    const files = ['server.js', ...['routes', 'controllers', 'middleware'].flatMap((folder) =>
      readdirSync(path.join(SERVER_DIR, folder)).filter((name) => name.endsWith('.js')).map((name) => path.join(folder, name)),
    )];
    const found = files.filter((file) => /setClockForTests|resetClockForTests|e2eServer/.test(readFileSync(path.join(SERVER_DIR, file), 'utf8')));
    assert.deepEqual(found, []);
  });
});

describe('scripts/e2eServer.js', () => {
  it('refuses to start when NODE_ENV is not test, before touching anything', () => {
    for (const nodeEnv of ['development', 'production']) {
      const run = spawnSync(process.execPath, [path.join(SERVER_DIR, 'scripts', 'e2eServer.js')], {
        env: { ...process.env, NODE_ENV: nodeEnv },
        encoding: 'utf8',
        timeout: 20_000,
      });
      assert.equal(run.status, 1, `${nodeEnv}: exited ${run.status}`);
      assert.match(run.stderr, /NODE_ENV must be "test"/);
    }
  });
});
