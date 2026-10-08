/**
 * P25 Part K: the Tally bridge. docs/API-CONTRACT.md M21 sections 9.3 and 9.4,
 * the prompt's K4 list.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AuditLog } from '../models/AuditLog.js';
import { ALL_MODELS } from '../models/index.js';
import { TallyBridge } from '../models/TallyBridge.js';
import { TallyExport } from '../models/TallyExport.js';
import { ledgersOf, redoConfirmationFor } from '../services/integrations/tally/exportService.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { startFakeTally } from './helpers/fakeTally.js';
import { buildGoldenDay, GOLDEN_DATE, ist } from './helpers/goldenDay.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const BRIDGE = fileURLToPath(new URL('../../tools/tally-bridge/bridge.js', import.meta.url));
let baseUrl;
let golden;
let tally;
let mapping;
let home;

function mappingFor(world) {
  return {
    salesByRate: { 500: 'Sales @ 5%' },
    platformSales: 'Sales, aggregator, section 9(5)',
    cgst: 'Output CGST',
    sgst: 'Output SGST',
    roundOff: 'Round Off',
    paymentMethods: { CASH: 'Cash', CARD: 'Card', UPI: 'UPI', ZOMATO_GOLD: 'Zomato Gold', DINEOUT: 'Dineout', EAZYDINER: 'EazyDiner', ZOMATO: 'Zomato', SWIGGY: 'Swiggy' },
    onHold: { mode: 'PER_ACCOUNT', byAccount: { [world.ids.accounts['E-210 Office']]: 'E-210 Office', [world.ids.accounts['W-330 Office']]: 'W-330 Office' } },
    paidOut: 'Petty Expenses',
    paidIn: 'Petty Cash Received',
  };
}

const saveTally = () =>
  request('PUT', '/api/v1/integrations/TALLY', {
    token: golden.tokens.OWNER,
    body: { environment: 'PRODUCTION', config: { version: 'TALLY_PRIME', companyName: 'Tally Cafe & Co', ledgers: mapping } },
  });

before(async () => {
  await startTestDatabase();
  baseUrl = await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  golden = await buildGoldenDay({ name: 'Bridge Cafe' });
  mapping = mappingFor(golden);
  assert.ok([200, 201].includes((await saveTally()).status));
  assert.equal((await request('POST', '/api/v1/integrations/TALLY/test', { token: golden.tokens.OWNER })).status, 200);
  setClockForTests(ist('09:00', '2026-09-27'));
  const close = await request('POST', '/api/v1/day-close', { token: golden.tokens.OWNER, body: { businessDate: GOLDEN_DATE, countedCashInPaise: 340000, note: 'Counted' } });
  resetClockForTests();
  assert.equal(close.status, 201, JSON.stringify(close.body));
  tally = await startFakeTally({ ledgers: ledgersOf(mapping).map((ledger) => ledger.name) });
  home = mkdtempSync(join(tmpdir(), 'tally-bridge-'));
});

after(async () => {
  resetClockForTests();
  await tally?.close();
  if (home) rmSync(home, { recursive: true, force: true });
  await stopTestServer();
  await stopTestDatabase();
});

/** A call as the bridge, with its token. */
async function asBridge(token, method, path, body) {
  const response = await fetch(`${baseUrl}/api/v1/tally-bridge${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const pairingCode = async (name = 'Accounts PC') => {
  const made = await request('POST', '/api/v1/integrations/tally/bridges/pairing-code', { token: golden.tokens.OWNER, body: { name } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  return made.body.data;
};

const pairDirect = async () => {
  const { code } = await pairingCode();
  const paired = await asBridge(null, 'POST', '/pair', { code, machineName: 'TEST-PC' });
  assert.equal(paired.status, 201, JSON.stringify(paired.body));
  return paired.body.data.token;
};

const exportRow = (id) => TallyExport.findOne({ restaurantId: golden.restaurant._id, _id: id }).lean();
const ledgerReply = (names) => `<ENVELOPE><BODY><DATA><COLLECTION>${names.map((name) => `<LEDGER NAME="${name.replaceAll('&', '&amp;')}"></LEDGER>`).join('')}</COLLECTION></DATA></BODY></ENVELOPE>`;

/** Runs every job waiting for a simulated bridge; `post` answers the voucher post. */
async function drain(token, { ledgers = ledgersOf(mapping).map((ledger) => ledger.name), post = null } = {}) {
  const seen = [];
  for (;;) {
    const next = await asBridge(token, 'GET', '/jobs/next');
    if (next.status === 204) return seen;
    assert.equal(next.status, 200, JSON.stringify(next.body));
    const job = next.body.data;
    seen.push(job.type);
    if (job.type === 'POST_VOUCHERS' && post === 'LEAVE') return seen;
    const body = job.type === 'FETCH_LEDGERS' ? ledgerReply(ledgers) : job.type === 'PING' ? '<COMPANY NAME="Tally Cafe &amp; Co"></COMPANY>' : post;
    const result = await asBridge(token, 'POST', `/jobs/${job.jobId}/result`, { ok: true, httpStatus: 200, body });
    assert.equal(result.status, 200, JSON.stringify(result.body));
  }
}

let currentExportId;
async function freshExport() {
  if (!currentExportId) {
    const built = await request('POST', '/api/v1/integrations/tally/exports', { token: golden.tokens.MANAGER, body: { from: GOLDEN_DATE, to: GOLDEN_DATE } });
    assert.equal(built.status, 201, JSON.stringify(built.body));
    currentExportId = built.body.data[0].id;
  } else {
    const redone = await request('POST', `/api/v1/integrations/tally/exports/${currentExportId}/redo`, { token: golden.tokens.OWNER, body: { confirmation: redoConfirmationFor(GOLDEN_DATE) } });
    assert.equal(redone.status, 201, JSON.stringify(redone.body));
    currentExportId = redone.body.data.id;
  }
  return currentExportId;
}
const send = (id, token = golden.tokens.MANAGER) => request('POST', `/api/v1/integrations/tally/exports/${id}/send`, { token });

describe('pairing', () => {
  it('refuses to send while no bridge is paired', async () => {
    const id = await freshExport();
    const refused = await send(id);
    assert.equal(refused.status, 422);
    assert.match(refused.body.error.message, /Pair a Tally bridge/);
  });

  it('gives the owner a code that pairs once; a manager gets none; used, wrong and expired codes are refused alike', async () => {
    assert.equal((await request('POST', '/api/v1/integrations/tally/bridges/pairing-code', { token: golden.tokens.MANAGER, body: { name: 'PC' } })).status, 403);
    const { code, expiresAt } = await pairingCode();
    assert.match(code, /^[A-HJ-KM-NP-Z2-9]{8}$/);
    assert.ok(new Date(expiresAt) > new Date());

    const paired = await asBridge(null, 'POST', '/pair', { code: code.toLowerCase(), machineName: 'ACCOUNTS-PC' });
    assert.equal(paired.status, 201, JSON.stringify(paired.body));
    assert.equal(paired.body.data.serverName, 'Bridge Cafe');
    assert.ok(paired.body.data.token.length >= 40);

    for (const tried of [code, 'ABCDEFGH']) {
      const again = await asBridge(null, 'POST', '/pair', { code: tried });
      assert.equal(again.status, 401);
      assert.equal(again.body.error.code, 'PAIRING_CODE_INVALID');
    }
    const late = await pairingCode('Late PC');
    setClockForTests(new Date(Date.now() + 11 * 60_000));
    const expired = await asBridge(null, 'POST', '/pair', { code: late.code });
    resetClockForTests();
    assert.equal(expired.status, 401);
    assert.equal(expired.body.error.code, 'PAIRING_CODE_INVALID');

    const stored = await TallyBridge.findOne({ restaurantId: golden.restaurant._id, _id: paired.body.data.bridgeId }).select('+tokenHash +pairingCodeHash').lean();
    assert.notEqual(stored.tokenHash, paired.body.data.token);
    assert.equal(stored.pairingCodeHash, null);
    assert.ok(await AuditLog.findOne({ restaurantId: golden.restaurant._id, action: 'TALLY_BRIDGE_PAIRED' }).lean());

    setClockForTests(new Date(Date.now() + 11 * 60_000));
    const list = await request('GET', '/api/v1/integrations/tally/bridges', { token: golden.tokens.MANAGER });
    resetClockForTests();
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.data.map((bridge) => bridge.state).sort(), ['ACTIVE', 'EXPIRED']);
    assert.equal(JSON.stringify(list.body.data).includes(paired.body.data.token), false);
    assert.equal(JSON.stringify(list.body.data).includes('Hash'), false);
  });

  it('a bridge token opens nothing but the bridge routes', async () => {
    const token = await pairDirect();
    for (const path of ['/api/v1/auth/me', '/api/v1/integrations', '/api/v1/bills']) {
      const response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 401, path);
    }
    const none = await asBridge(null, 'GET', '/jobs/next');
    assert.equal(none.status, 401);
    assert.equal(none.body.error.code, 'BRIDGE_TOKEN_INVALID');
    await drain(token);
  });

  it('a revoked token is refused everywhere, and only the owner revokes', async () => {
    const token = await pairDirect();
    const list = (await request('GET', '/api/v1/integrations/tally/bridges', { token: golden.tokens.OWNER })).body.data;
    const bridge = list.find((entry) => entry.state === 'ACTIVE' && entry.machineName === 'TEST-PC');
    const next = await asBridge(token, 'GET', '/jobs/next');
    assert.equal(next.status, 200);
    assert.equal((await request('POST', `/api/v1/integrations/tally/bridges/${bridge.id}/revoke`, { token: golden.tokens.MANAGER })).status, 403);
    const revoked = await request('POST', `/api/v1/integrations/tally/bridges/${bridge.id}/revoke`, { token: golden.tokens.OWNER });
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.data.state, 'REVOKED');
    assert.equal((await asBridge(token, 'GET', '/jobs/next')).status, 401);
    assert.equal((await asBridge(token, 'POST', `/jobs/${next.body.data.jobId}/result`, { ok: true, body: '' })).status, 401);
    assert.ok(await AuditLog.findOne({ restaurantId: golden.restaurant._id, action: 'TALLY_BRIDGE_REVOKED' }).lean());
  });
});

function runBridge(args) {
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: home, APPDATA: home };
  return spawn(process.execPath, [BRIDGE, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
}

const finished = (child) =>
  new Promise((resolve) => {
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('exit', (code) => resolve({ code, output }));
  });

async function until(check, ms = 30_000) {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

describe('the bridge program against a fake Tally', () => {
  it('pairs, checks, and posts a queued export, which becomes POSTED', async () => {
    const { code } = await pairingCode('Accountant');
    const pair = await finished(runBridge(['pair', code, '--server', baseUrl, '--tally', tally.address]));
    assert.equal(pair.code, 0, pair.output);
    assert.match(pair.output, /Paired with Bridge Cafe/);
    const check = await finished(runBridge(['check']));
    assert.equal(check.code, 0, check.output);
    assert.match(check.output, /Open companies: Tally Cafe & Co/);

    const id = currentExportId;
    const queued = await send(id);
    assert.equal(queued.status, 200, JSON.stringify(queued.body));
    assert.equal(queued.body.data.status, 'QUEUED');

    const child = runBridge(['run']);
    const done = finished(child);
    const posted = await until(async () => (await exportRow(id)).status === 'POSTED');
    child.kill();
    const { output } = await done;
    assert.ok(posted, output);

    assert.equal(tally.state.imports.length, 1);
    assert.match(tally.state.imports[0], /<SVCURRENTCOMPANY>Tally Cafe &amp; Co<\/SVCURRENTCOMPANY>/);
    const row = await exportRow(id);
    assert.ok(row.postedAt);
    assert.deepEqual(row.lineErrors, []);
    const audit = await AuditLog.findOne({ restaurantId: golden.restaurant._id, action: 'TALLY_EXPORT_POSTED' }).lean();
    assert.equal(audit.entityLabel, GOLDEN_DATE);
    const bridge = (await request('GET', '/api/v1/integrations/tally/bridges', { token: golden.tokens.OWNER })).body.data.find((entry) => entry.name === 'Accountant');
    assert.deepEqual(bridge.companiesSeen, ['Tally Cafe & Co']);
    assert.ok(bridge.ledgerCount >= 15);
    assert.ok(bridge.lastSeenAt);

    // Posted: sending again is refused.
    assert.equal((await send(id)).status, 409);
  });
});

describe('what Tally answers', () => {
  let token;
  before(async () => {
    token = await pairDirect();
    await drain(token);
  });

  it('a LINEERROR with nothing created is FAILED, with the error kept; with some created it is PARTIAL', async () => {
    const id = await freshExport();
    assert.equal((await send(id)).status, 200);
    await drain(token, { post: "<RESPONSE><CREATED>0</CREATED><ERRORS>1</ERRORS><LINEERROR>Ledger 'Swiggy' does not exist!</LINEERROR></RESPONSE>" });
    let row = await exportRow(id);
    assert.equal(row.status, 'FAILED');
    assert.deepEqual(row.lineErrors, ["Ledger 'Swiggy' does not exist!"]);

    // FAILED put nothing into Tally, so it may be sent again.
    assert.equal((await send(id)).status, 200);
    await drain(token, { post: '<RESPONSE><CREATED>1</CREATED><ERRORS>1</ERRORS><LINEERROR>Voucher totals do not match!</LINEERROR></RESPONSE>' });
    row = await exportRow(id);
    assert.equal(row.status, 'PARTIAL');
    assert.equal((await send(id)).status, 409, 'a partly posted day needs the owner to redo it');
  });

  it('refuses the post, naming the ledger, when Tally does not have it; and then refuses at send', async () => {
    const id = await freshExport();
    assert.equal((await send(id)).status, 200);
    const withoutSwiggy = ledgersOf(mapping).map((ledger) => ledger.name).filter((name) => name !== 'Swiggy');
    const imports = tally.state.imports.length;
    const seen = await drain(token, { ledgers: withoutSwiggy });
    assert.deepEqual(seen, ['FETCH_LEDGERS'], 'the post is never handed to the bridge');
    const row = await exportRow(id);
    assert.equal(row.status, 'FAILED');
    assert.match(row.lineErrors[0], /Not in Tally, so nothing was posted: Swiggy\./);
    assert.equal(tally.state.imports.length, imports);

    const refused = await send(id);
    assert.equal(refused.status, 422);
    assert.equal(refused.body.error.code, 'TALLY_MAPPING_INCOMPLETE');
    assert.deepEqual(refused.body.error.missing, ['Swiggy (not in Tally)']);
  });

  it('a post the bridge took and never reported becomes UNKNOWN, and is never handed out again', async () => {
    // The mapping changes, so the old ledger list no longer counts.
    assert.equal((await saveTally()).status, 200);
    const id = currentExportId;
    assert.equal((await send(id)).status, 200);
    const seen = await drain(token, { post: 'LEAVE' });
    assert.deepEqual(seen, ['FETCH_LEDGERS', 'POST_VOUCHERS']);
    setClockForTests(new Date(Date.now() + 11 * 60_000));
    const next = await asBridge(token, 'GET', '/jobs/next');
    resetClockForTests();
    // A PING another bridge took and dropped may be offered again; a voucher post never is.
    assert.ok(next.status === 204 || next.body.data.type !== 'POST_VOUCHERS', JSON.stringify(next.body));
    const row = await exportRow(id);
    assert.equal(row.status, 'UNKNOWN');
    assert.match(row.lineErrors[0], /never reported back/);
  });
});
