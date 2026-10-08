#!/usr/bin/env node
/**
 * The Tally bridge. P25 Part K, API-CONTRACT M21 section 9.4.
 *
 * Runs on the accountant's computer, next to Tally, because our server cannot
 * reach Tally there. Node 20 or newer, no packages.
 *
 *   node bridge.js pair <code> --server <url>   swap a one-time code for a token
 *   node bridge.js check [--tally host:port]     list the companies open in Tally
 *   node bridge.js run [--tally host:port]       every 30 seconds, do the server's work
 *
 * It sends Tally only the XML the server gave it, and sends the server only
 * Tally's answers. The token is saved in this user's own app data folder,
 * readable only by this user.
 */
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, hostname, platform } from 'node:os';
import { join } from 'node:path';

const POLL_MS = 30_000;
const TALLY_TIMEOUT_MS = 60_000;
const SERVER_TIMEOUT_MS = 30_000;
const MAX_BODY = 5 * 1024 * 1024;

/** Tally's documented collection export, used by `check` to list open companies. */
const COMPANIES_XML = `<ENVELOPE>
<HEADER>
<VERSION>1</VERSION>
<TALLYREQUEST>EXPORT</TALLYREQUEST>
<TYPE>COLLECTION</TYPE>
<ID>Bridge Company Coll</ID>
</HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="Bridge Company Coll" ISINITIALIZE="Yes">
<TYPE>Company</TYPE>
<NATIVEMETHOD>Name</NATIVEMETHOD>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

function appFolder() {
  if (platform() === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'TallyBridge');
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', 'TallyBridge');
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'tally-bridge');
}

const CONFIG_FILE = join(appFolder(), 'config.json');
const LOG_FILE = join(appFolder(), 'bridge.log');

function readConfig() {
  if (!existsSync(CONFIG_FILE)) return null;
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
}

function saveConfig(value) {
  mkdirSync(appFolder(), { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(value, null, 2), { mode: 0o600 });
  try {
    chmodSync(CONFIG_FILE, 0o600);
  } catch {
    // Windows keeps it private by keeping it in this user's own app data folder.
  }
}

function log(line) {
  const text = `${new Date().toISOString()} ${line}`;
  console.log(text);
  try {
    mkdirSync(appFolder(), { recursive: true, mode: 0o700 });
    appendFileSync(LOG_FILE, `${text}\n`);
  } catch {
    // The console line is enough when the folder cannot be written.
  }
}

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function tallyAddress(args, config) {
  const value = option(args, '--tally', config?.tally ?? '127.0.0.1:9000');
  return value.startsWith('http') ? value : `http://${value}`;
}

/** Posts XML to Tally and returns `{ ok, httpStatus, body, reached }`. Never throws. */
async function postToTally(address, xml) {
  try {
    const response = await fetch(address, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: xml,
      signal: AbortSignal.timeout(TALLY_TIMEOUT_MS),
    });
    const body = (await response.text()).slice(0, MAX_BODY);
    return { ok: response.ok, httpStatus: response.status, body, reached: true };
  } catch (error) {
    // A timeout may mean Tally took the XML and is still working: reached, and unknown.
    if (error?.name === 'TimeoutError') return { ok: false, httpStatus: null, body: 'Tally did not answer in time.', reached: true };
    return { ok: false, httpStatus: null, body: `Tally could not be reached at ${address}. Is Tally open, with its HTTP server switched on?`, reached: false };
  }
}

async function callServer(config, method, path, body) {
  const response = await fetch(`${config.server.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(SERVER_TIMEOUT_MS),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed };
}

async function pair(args) {
  const code = args[1];
  const server = option(args, '--server');
  if (!code || !server) {
    console.error('Use: node bridge.js pair <code> --server https://your-erp-address');
    process.exit(2);
  }
  if (!server.startsWith('https://') && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(server)) {
    console.error('The server address must start with https://');
    process.exit(2);
  }
  const answer = await callServer({ server }, 'POST', '/api/v1/tally-bridge/pair', { code: code.trim().toUpperCase(), machineName: hostname().slice(0, 60) });
  if (answer.status !== 201 && answer.status !== 200) {
    console.error(answer.body?.error?.message ?? `The server refused the code (${answer.status}).`);
    process.exit(1);
  }
  const { token, bridgeId, serverName } = answer.body.data;
  saveConfig({ server, token, bridgeId, serverName, tally: option(args, '--tally', '127.0.0.1:9000') });
  console.log(`Paired with ${serverName}. Saved in ${CONFIG_FILE}.`);
  console.log('Next: node bridge.js check, then node bridge.js run');
}

async function check(args) {
  const address = tallyAddress(args, readConfig());
  const answer = await postToTally(address, COMPANIES_XML);
  if (!answer.ok) {
    console.error(answer.body);
    process.exit(1);
  }
  const unescape = (text) => text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const names = [...answer.body.matchAll(/<COMPANY\s+NAME="([^"]*)"/gi)].map((match) => unescape(match[1]));
  console.log(`Tally answered at ${address}.`);
  console.log(names.length > 0 ? `Open companies: ${names.join(', ')}` : 'No company is open in Tally.');
}

async function runOnce(config, address) {
  const next = await callServer(config, 'GET', '/api/v1/tally-bridge/jobs/next');
  if (next.status === 204) return 'idle';
  if (next.status === 401) return 'revoked';
  if (next.status !== 200) {
    log(`server answered ${next.status}; trying again later`);
    return 'error';
  }
  const job = next.body.data;
  const result = job.xml ? await postToTally(address, job.xml) : { ok: true, httpStatus: null, body: '', reached: true };
  const sent = await callServer(config, 'POST', `/api/v1/tally-bridge/jobs/${job.jobId}/result`, result);
  log(`${job.type} ${job.jobId}: Tally ${result.httpStatus ?? 'unreachable'}, server ${sent.status}${sent.body?.data?.status ? ` ${sent.body.data.status}` : ''}`);
  return 'worked';
}

async function run(args) {
  const config = readConfig();
  if (!config?.token) {
    console.error('Pair first: node bridge.js pair <code> --server <address>');
    process.exit(2);
  }
  const address = tallyAddress(args, config);
  log(`running for ${config.serverName}, Tally at ${address}`);
  for (;;) {
    let outcome;
    try {
      outcome = await runOnce(config, address);
    } catch (error) {
      log(`could not reach the server: ${error?.name === 'TimeoutError' ? 'timed out' : error?.message}`);
      outcome = 'error';
    }
    if (outcome === 'revoked') {
      log('This bridge was switched off on the server. Ask the owner for a new pairing code.');
      process.exit(1);
    }
    // After a job, ask again at once; there may be more.
    if (outcome !== 'worked') await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

const args = process.argv.slice(2);
const commands = { pair, check, run };
const command = commands[args[0]];
if (!command) {
  console.log('Tally bridge\n  node bridge.js pair <code> --server <address>\n  node bridge.js check [--tally host:port]\n  node bridge.js run [--tally host:port]');
  process.exit(args[0] ? 2 : 0);
}
await command(args);
