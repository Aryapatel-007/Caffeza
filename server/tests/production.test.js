/**
 * Serving the built client, the release on health, and the smoke check. P12.
 *
 * Production serves the screens and the API from one address. These tests
 * point the static files at a temporary folder through createApp's options,
 * so they need no real build.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { runSmokeChecks } from '../scripts/smokeCheck.js';
import { CLIENT_NOT_BUILT_MESSAGE, createApp, isClientBuilt } from '../server.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const INDEX_HTML = '<!doctype html><html><head><script type="module" src="/assets/index-abc123.js"></script></head><body><div id="root"></div></body></html>';

let distDir;
let emptyDir;
let productionServer;
let productionUrl;

before(async () => {
  await startTestDatabase();
  await startTestServer();

  distDir = mkdtempSync(path.join(tmpdir(), 'caffeza-dist-'));
  mkdirSync(path.join(distDir, 'assets'));
  writeFileSync(path.join(distDir, 'index.html'), INDEX_HTML);
  writeFileSync(path.join(distDir, 'assets', 'index-abc123.js'), 'console.log("app");');
  emptyDir = mkdtempSync(path.join(tmpdir(), 'caffeza-empty-'));

  productionServer = createApp({ serveClient: true, clientDist: distDir }).listen(0, '127.0.0.1');
  await new Promise((resolve) => productionServer.once('listening', resolve));
  productionUrl = `http://127.0.0.1:${productionServer.address().port}`;
});

after(async () => {
  await new Promise((resolve) => productionServer.close(resolve));
  rmSync(distDir, { recursive: true, force: true });
  rmSync(emptyDir, { recursive: true, force: true });
  await stopTestServer();
  await stopTestDatabase();
});

describe('serving the built client', () => {
  it('sends index.html with no-cache, assets for a year, and the app for any page address', async () => {
    const home = await fetch(`${productionUrl}/`);
    assert.equal(home.status, 200);
    assert.equal(home.headers.get('cache-control'), 'no-cache');
    assert.match(await home.text(), /<div id="root">/);

    const asset = await fetch(`${productionUrl}/assets/index-abc123.js`);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');

    const page = await fetch(`${productionUrl}/day-close`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-cache');
    assert.match(await page.text(), /<div id="root">/);
  });

  it('never answers an unknown API address with the app', async () => {
    const response = await fetch(`${productionUrl}/api/v1/no-such-route`);
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'NOT_FOUND');

    const posted = await fetch(`${productionUrl}/day-close`, { method: 'POST' });
    assert.equal(posted.status, 404, 'only GET falls back to the app');
  });

  it('knows when the client has not been built, and says what to do', () => {
    assert.equal(isClientBuilt(distDir), true);
    assert.equal(isClientBuilt(emptyDir), false);
    assert.equal(CLIENT_NOT_BUILT_MESSAGE, 'The client has not been built. Run npm run build, then start again.');
  });

  it('in development and test, Express does not serve the client', async () => {
    const response = await request('GET', '/');
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'NOT_FOUND');
  });
});

describe('health', () => {
  it('includes release, null when RELEASE_VERSION is unset', async () => {
    const response = await request('GET', '/api/v1/health');
    assert.equal(response.status, 200);
    assert.ok('release' in response.body.data);
    assert.equal(response.body.data.release, null);
    assert.equal(response.body.data.status, 'ok');
  });

  it('keeps Strict-Transport-Security and a content security policy', async () => {
    const response = await request('GET', '/api/v1/health');
    assert.ok(response.headers.get('strict-transport-security'));
    assert.ok(response.headers.get('content-security-policy'));
  });
});

describe('the smoke check', () => {
  const byName = (results, start) => results.find((result) => result.name.startsWith(start));

  it('passes every check against a server that serves the client, skipping https for http', async () => {
    const results = await runSmokeChecks(productionUrl);
    const failed = results.filter((result) => result.status === 'fail');
    assert.deepEqual(failed, [], JSON.stringify(failed));
    assert.equal(byName(results, 'plain http').status, 'skip');
    assert.equal(byName(results, 'plain http').detail, 'skipped for http');
    // P30 added the wake address check, on purpose.
    assert.equal(results.length, 9);
  });

  it('fails the page checks against a server that does not serve the client', async () => {
    const apiOnly = createApp({ serveClient: false }).listen(0, '127.0.0.1');
    await new Promise((resolve) => apiOnly.once('listening', resolve));
    try {
      const results = await runSmokeChecks(`http://127.0.0.1:${apiOnly.address().port}`);
      assert.equal(byName(results, 'the home page').status, 'fail');
      assert.equal(byName(results, 'a page address').status, 'fail');
      assert.equal(byName(results, 'a built asset').status, 'fail');
      assert.equal(byName(results, 'an unknown API address').status, 'pass');
      assert.equal(byName(results, 'the API answers').status, 'pass');
      assert.equal(byName(results, 'health').status, 'pass');
    } finally {
      await new Promise((resolve) => apiOnly.close(resolve));
    }
  });

  it('fails health when nothing answers', async () => {
    const results = await runSmokeChecks('http://127.0.0.1:9');
    assert.equal(byName(results, 'health').status, 'fail');
  });
});
