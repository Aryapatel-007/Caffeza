/**
 * P25 Part G: the integrations foundation.
 * docs/API-CONTRACT.md M21 sections 1 to 6.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import mongoose from 'mongoose';

import { AuditLog } from '../models/AuditLog.js';
import { ALL_MODELS } from '../models/index.js';
import { IntegrationJob } from '../models/IntegrationJob.js';
import { User } from '../models/User.js';
import { verifyCredentials } from '../services/authService.js';
import { signSandboxBody } from '../services/integrations/channels/sandbox.js';
import { enqueueJob, registerJobHandler, RETRY_DELAYS_MS, runDueJobs } from '../services/integrations/jobRunner.js';
import { decryptJson, encryptJson, keyIdOf } from '../utils/secretBox.js';
import { seedTeam } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let baseUrl;

before(async () => {
  await startTestDatabase();
  baseUrl = await startTestServer();
  for (const model of ALL_MODELS) await model.init();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

const PINE_LABS = {
  environment: 'UAT',
  credentials: { merchantId: 'MERCHANT-778899', securityToken: 'SECRET-VALUE-123' },
  config: {
    baseUrl: 'https://www.plutuscloudserviceuat.in:8201',
    paths: { upload: '/API/CloudBasedIntegration/V1/UploadBilledTransaction', status: '/API/CloudBasedIntegration/V1/GetCloudBasedTxnStatus', cancel: '/API/CloudBasedIntegration/V1/CancelTransaction' },
    terminals: [{ name: 'Counter', clientId: '1234' }],
  },
};
const SANDBOX = { environment: 'SANDBOX', credentials: { webhookSecret: 'sandbox-secret-0123456789' }, config: {} };

const save = (token, provider, body) => request('PUT', `/api/v1/integrations/${provider}`, { token, body });

/** Posts raw bytes to a webhook address, as a partner would. */
async function postHook(url, body, headers = {}) {
  const pathPart = new URL(url).pathname;
  const response = await fetch(`${baseUrl}${pathPart}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  return { status: response.status, body: await response.json().catch(() => null) };
}

describe('secretBox for partner credentials', () => {
  it('round-trips JSON, and refuses a changed box or another key', () => {
    const key = randomBytes(32).toString('base64');
    const other = randomBytes(32).toString('base64');
    const box = encryptJson({ securityToken: 'SECRET-VALUE-123' }, key);
    assert.equal(box.keyId, keyIdOf(key));
    assert.equal(JSON.stringify(box).includes('SECRET-VALUE-123'), false);
    assert.deepEqual(decryptJson(box, key), { securityToken: 'SECRET-VALUE-123' });
    assert.throws(() => decryptJson(box, other), /another key/);
    const changed = { ...box, ciphertext: Buffer.from(Buffer.from(box.ciphertext, 'base64').map((byte, index) => (index === 0 ? byte ^ 1 : byte))).toString('base64') };
    assert.throws(() => decryptJson(changed, key));
  });

  it('refuses to start in production without INTEGRATION_SECRETS_KEY', () => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./config/env.js')"], {
      cwd: SERVER_DIR,
      env: { ...process.env, NODE_ENV: 'production', INTEGRATION_SECRETS_KEY: '', TRUST_PROXY: '1' },
      encoding: 'utf8',
      timeout: 20_000,
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /INTEGRATION_SECRETS_KEY must be set in production\. Make one with: openssl rand -base64 32/);
  });
});

describe('a saved connection never gives its credentials back', () => {
  it('keeps SECRET-VALUE-123 out of every collection and every response, except inside the sealed box', async () => {
    const team = await seedTeam();
    const created = await save(team.tokens.OWNER, 'PINE_LABS', PINE_LABS);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.deepEqual(created.body.data.credentialHints, { merchantId: '8899', securityToken: '-123' });
    assert.equal(created.body.data.status, 'DRAFT');

    // A credential left empty keeps the stored one.
    const updated = await save(team.tokens.OWNER, 'PINE_LABS', { ...PINE_LABS, credentials: { merchantId: '', securityToken: '' }, config: { ...PINE_LABS.config, autoCancelMinutes: 7 } });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.data.credentialHints.securityToken, '-123');

    const responses = [
      created.body,
      updated.body,
      (await request('GET', '/api/v1/integrations', { token: team.tokens.OWNER })).body,
      (await request('GET', '/api/v1/integrations/PINE_LABS/events', { token: team.tokens.OWNER })).body,
    ];
    for (const body of responses) assert.equal(JSON.stringify(body).includes('SECRET-VALUE-123'), false);

    const db = mongoose.connection.db;
    for (const { name } of await db.listCollections().toArray()) {
      const docs = await db.collection(name).find({}).toArray();
      const text = JSON.stringify(docs);
      assert.equal(text.includes('SECRET-VALUE-123'), false, `${name} holds the credential in plain text`);
      assert.equal(text.includes('MERCHANT-778899'), false, `${name} holds the merchant id in plain text`);
    }

    const audit = await AuditLog.find({ restaurantId: team.restaurant._id, entityType: 'INTEGRATION' }).lean();
    assert.deepEqual(audit.map((line) => line.action).sort(), ['INTEGRATION_CONNECTED']);
  });

  it('lets only the owner change a connection, and the owner and manager read them', async () => {
    const team = await seedTeam();
    assert.equal((await save(team.tokens.MANAGER, 'PINE_LABS', PINE_LABS)).status, 403);
    assert.equal((await request('GET', '/api/v1/integrations', { token: team.tokens.MANAGER })).status, 200);
    assert.equal((await request('GET', '/api/v1/integrations', { token: team.tokens.CASHIER })).status, 403);
    assert.equal((await request('GET', '/api/v1/integrations')).status, 401);
    const listed = (await request('GET', '/api/v1/integrations', { token: team.tokens.OWNER })).body.data;
    assert.deepEqual(listed.map((row) => row.provider).sort(), ['PINE_LABS', 'SANDBOX_PLATFORM', 'SWIGGY', 'TALLY', 'ZOMATO']);
    assert.equal(listed.find((row) => row.provider === 'SWIGGY').availability, 'WAITING_FOR_PARTNER');
  });

  it('refuses to switch on Swiggy without its partner document, and says why', async () => {
    const team = await seedTeam();
    const saved = await save(team.tokens.OWNER, 'SWIGGY', { environment: 'PRODUCTION', credentials: {}, config: {} });
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    const test = await request('POST', '/api/v1/integrations/SWIGGY/test', { token: team.tokens.OWNER });
    assert.equal(test.status, 422);
    assert.equal(test.body.error.code, 'PARTNER_SPEC_MISSING');
    assert.match(test.body.error.message, /Swiggy has not approved this integration yet/);
  });
});

describe('webhooks', () => {
  it('answers 404 to an unknown key, 401 to a bad signature with nothing done, and 200 to a signed one', async () => {
    const team = await seedTeam();
    const created = await save(team.tokens.OWNER, 'SANDBOX_PLATFORM', SANDBOX);
    const { webhookUrl } = created.body.data;
    assert.match(webhookUrl, /\/api\/v1\/hooks\/SANDBOX_PLATFORM\/[A-Za-z0-9_-]{32}$/);
    assert.equal((await request('POST', '/api/v1/integrations/SANDBOX_PLATFORM/test', { token: team.tokens.OWNER })).body.data.status, 'ACTIVE');

    const unknown = await postHook(webhookUrl.replace(/[^/]+$/, 'x'.repeat(32)), '{}');
    assert.equal(unknown.status, 404);

    const body = JSON.stringify({ type: 'PING', customer: { phone: '9876543210' } });
    const bad = await postHook(webhookUrl, body, { 'x-sandbox-signature': '0'.repeat(64) });
    assert.equal(bad.status, 401);
    const events = (await request('GET', '/api/v1/integrations/SANDBOX_PLATFORM/events', { token: team.tokens.OWNER })).body.data;
    assert.equal(events[0].outcome, 'REJECTED');
    assert.equal(JSON.stringify(events).includes('9876543210'), false, 'a phone number reached the log');
    assert.equal(await IntegrationJob.countDocuments({ restaurantId: team.restaurant._id }), 0);

    const good = await postHook(webhookUrl, body, { 'x-sandbox-signature': signSandboxBody(Buffer.from(body), SANDBOX.credentials.webhookSecret) });
    assert.equal(good.status, 200, JSON.stringify(good.body));

    // A new address: the old one stops working at once.
    const renewed = await request('POST', '/api/v1/integrations/SANDBOX_PLATFORM/webhook-key', { token: team.tokens.OWNER });
    assert.notEqual(renewed.body.data.webhookUrl, webhookUrl);
    assert.equal((await postHook(webhookUrl, body, { 'x-sandbox-signature': signSandboxBody(Buffer.from(body), SANDBOX.credentials.webhookSecret) })).status, 404);
  });
});

describe('the job runner', () => {
  const calls = [];
  afterEach(() => {
    calls.length = 0;
  });

  it('retries on schedule, then gives up as DEAD', async () => {
    const team = await seedTeam();
    registerJobHandler('TEST_ALWAYS_FAILS', () => {
      throw new Error('The partner is down.');
    });
    const ctx = { restaurantId: team.restaurant._id, branchId: team.branch._id };
    const job = await enqueueJob(ctx, { connectionId: new mongoose.Types.ObjectId(), type: 'TEST_ALWAYS_FAILS', runAfter: new Date('2026-10-09T00:00:00Z') });

    let now = new Date('2026-10-09T00:00:00Z');
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const [ran] = await runDueJobs({ now, limit: 1 });
      assert.equal(ran.id, String(job._id));
      const stored = await IntegrationJob.findOne({ restaurantId: team.restaurant._id, _id: job._id }).lean();
      if (attempt < 6) {
        assert.equal(stored.status, 'FAILED');
        assert.equal(stored.runAfter.getTime() - now.getTime(), RETRY_DELAYS_MS[attempt - 1]);
        // Not due a millisecond early.
        assert.deepEqual(await runDueJobs({ now: new Date(stored.runAfter.getTime() - 1) }), []);
        now = stored.runAfter;
      } else {
        assert.equal(stored.status, 'DEAD');
        assert.equal(stored.lastError, 'The partner is down.');
      }
    }
  });

  it('never queues a used dedupe key twice, and two runners never run one job', async () => {
    const team = await seedTeam();
    const ctx = { restaurantId: team.restaurant._id, branchId: team.branch._id };
    registerJobHandler('TEST_SLOW', async (job) => {
      calls.push(String(job._id));
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { ok: true };
    });
    const connectionId = new mongoose.Types.ObjectId();
    const first = await enqueueJob(ctx, { connectionId, type: 'TEST_SLOW', dedupeKey: 'ready:123' });
    const second = await enqueueJob(ctx, { connectionId, type: 'TEST_SLOW', dedupeKey: 'ready:123' });
    assert.ok(first);
    assert.equal(second, null);

    await Promise.all([runDueJobs(), runDueJobs(), runDueJobs()]);
    assert.deepEqual(calls.filter((id) => id === String(first._id)), [String(first._id)]);
    const stored = await IntegrationJob.findOne({ restaurantId: team.restaurant._id, _id: first._id }).lean();
    assert.equal(stored.status, 'DONE');
  });
});

describe('the integration user', () => {
  it('is made with the first connection, is not staff, and cannot sign in', async () => {
    const team = await seedTeam();
    await save(team.tokens.OWNER, 'SANDBOX_PLATFORM', SANDBOX);
    const system = await User.findOne({ restaurantId: team.restaurant._id, isSystem: true }).lean();
    assert.equal(system.name, 'Sandbox platform (automatic)');
    assert.equal(system.role, 'CASHIER');

    const staff = (await request('GET', '/api/v1/users', { token: team.tokens.OWNER })).body.data;
    assert.equal(staff.some((user) => user.id === String(system._id)), false);

    const signIn = await request('POST', '/api/v1/auth/login', { body: { phone: system.phone, password: 'anything at all' } });
    assert.notEqual(signIn.status, 200);
    // Below the request schema too: the service itself refuses it.
    const direct = await verifyCredentials({ phone: system.phone }, 'anything at all');
    assert.equal(direct.failure, 'IDENTITY_NOT_FOUND');
  });
});
