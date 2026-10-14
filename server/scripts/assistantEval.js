/**
 * The WhatsApp assistant's eval. P51 section 16.
 *
 *   npm run assistant:eval
 *   npm run assistant:eval -- --provider GROQ --model openai/gpt-oss-120b
 *   npm run assistant:eval -- --only so1,ns5        (some cases, by id)
 *   npm run assistant:eval -- --label NOT_STOP      (one label)
 *   npm run assistant:eval -- --from ns12           (resume a run that stopped)
 *
 * Sends every labelled message in `tests/assistant/eval.json` once to a real
 * model, with the real system prompt and tools and made-up restaurant facts,
 * and compares the first thing the model does with what the case accepts. No
 * database, no restaurant, no guest: nothing is stored and no tool runs.
 *
 * The bar: no clear stop missed, no message that is not a stop taken as one,
 * and 95% of every case right. Run it before and after any change to the
 * system prompt or the tools, and write the numbers into PROJECT-STATE.
 *
 * The key comes from the root `.env`: GROQ_API_KEY, GEMINI_API_KEY or
 * ANTHROPIC_API_KEY, never from the command line, where it would sit in the
 * shell's history.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import '../config/env.js';
import { buildSystemPrompt } from '../services/chatbot/systemPrompt.js';
import { TOOL_DEFINITIONS } from '../services/chatbot/tools.js';
import { adapterFor, providerFor } from '../services/integrations/providers.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const EVAL_FILE = path.join(SCRIPT_DIR, '..', 'tests', 'assistant', 'eval.json');

export const LABELS = Object.freeze(['STOP_OFFERS', 'STOP_ALL', 'STOP_EITHER', 'NOT_STOP', 'BOOKING', 'MENU', 'INFO', 'HANDOFF', 'INJECTION']);
const STOP_LABELS = new Set(['STOP_OFFERS', 'STOP_ALL', 'STOP_EITHER']);
export const PASS_RATE = 0.95;

const KEY_VARIABLES = Object.freeze({ GROQ: 'GROQ_API_KEY', GEMINI: 'GEMINI_API_KEY', ANTHROPIC: 'ANTHROPIC_API_KEY' });
const GAP_MS = 2_100;
const MAX_TRIES = 8;
const LONGEST_WAIT_MS = 120_000;

/** A made-up restaurant, fixed so two runs read the same prompt. */
export const EVAL_FACTS = Object.freeze({
  restaurantName: 'Test Chaat',
  city: 'Gandhinagar',
  todayLong: 'Sunday 11 October 2026',
  todayIso: '2026-10-11',
  timeNow: '6:30 pm',
  openNowSentence: 'open now, until 11:00 pm',
  address: 'Shop 4, Sample Complex, Sector 21, Gandhinagar 382021',
  restaurantPhone: '079 0000 0000',
  bookingsTaken: true,
  pageLink: 'https://example.test/r/test-chaat',
  handoffHours: 'between 10 am and 11 pm',
});

/** Every outcome a case may accept. */
export function outcomeNames() {
  const names = new Set(['NONE', 'ASK']);
  for (const tool of TOOL_DEFINITIONS) names.add(tool.name);
  names.add('stop_messages:OFFERS');
  names.add('stop_messages:ALL');
  return names;
}

/** What the model did first: a tool, the stop tool with its scope, or a text reply. */
export function outcomeOf(answer) {
  const call = answer.toolCalls?.[0];
  if (call) return call.name === 'stop_messages' ? `stop_messages:${call.arguments?.scope ?? '?'}` : call.name;
  const text = answer.text ?? '';
  return /\?|\[Options:/i.test(text) ? 'ASK' : 'NONE';
}

/** Whether an outcome is one the case accepts. A question is a text reply too. */
export function accepted(outcome, accept) {
  if (accept.includes(outcome)) return true;
  return outcome === 'ASK' && accept.includes('NONE');
}

/**
 * Right or wrong, and what kind of wrong: a stop missed, something taken as a
 * stop that was not, a stop with the wrong scope, or another mistake.
 */
export function judge(testCase, outcome) {
  const ok = accepted(outcome, testCase.accept);
  const isStop = outcome.startsWith('stop_messages:');
  let mistake = null;
  if (!ok) {
    if (STOP_LABELS.has(testCase.label)) mistake = isStop ? 'WRONG_SCOPE' : 'STOP_MISSED';
    else mistake = isStop ? 'FALSE_STOP' : 'OTHER';
  }
  return { id: testCase.id, label: testCase.label, outcome, ok, mistake };
}

export function summarise(results) {
  const count = (fn) => results.filter(fn).length;
  const total = results.length;
  const right = count((result) => result.ok);
  const stopCases = results.filter((result) => STOP_LABELS.has(result.label));
  const stopsTaken = stopCases.filter((result) => result.outcome.startsWith('stop_messages:'));
  const summary = {
    total,
    right,
    overall: total ? right / total : 0,
    stopMissed: count((result) => result.mistake === 'STOP_MISSED'),
    falseStops: count((result) => result.mistake === 'FALSE_STOP'),
    wrongScope: count((result) => result.mistake === 'WRONG_SCOPE'),
    scopeRight: stopsTaken.length ? stopsTaken.filter((result) => result.ok).length / stopsTaken.length : 1,
    byLabel: Object.fromEntries(LABELS.map((label) => [label, { total: count((r) => r.label === label), right: count((r) => r.label === label && r.ok) }]).filter(([, value]) => value.total > 0)),
  };
  summary.passes = summary.stopMissed === 0 && summary.falseStops === 0 && summary.overall >= PASS_RATE;
  return summary;
}

/** The messages for one case: any earlier chat, then the guest's message. */
export function messagesFor(testCase) {
  const history = (testCase.history ?? []).map(([role, text]) => ({ role: role === 'GUEST' ? 'user' : 'assistant', text }));
  return [...history, { role: 'user', text: testCase.text }];
}

export function readEvalFile(file = EVAL_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function parseArgs(argv) {
  const args = { provider: 'GROQ', model: null, only: null, label: null, from: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--provider') args.provider = String(argv[++i]).toUpperCase();
    else if (argv[i] === '--model') args.model = argv[++i];
    else if (argv[i] === '--only') args.only = String(argv[++i]).split(',').map((id) => id.trim()).filter(Boolean);
    else if (argv[i] === '--label') args.label = String(argv[++i]).toUpperCase();
    else if (argv[i] === '--from') args.from = String(argv[++i]);
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** "Please try again in 1m2.5s" in a rate limit message, as milliseconds. */
export function retryAfterMs(message) {
  const match = /try again in\s+(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(message ?? '');
  if (!match || !(match[1] || match[2] || match[3])) return /rate limit|429|quota/i.test(message ?? '') ? 20_000 : null;
  return Math.ceil(((Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)) * 60 + Number(match[3] ?? 0)) * 1000) + 500;
}

async function ask(adapter, connection, secrets, system, testCase) {
  for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
    try {
      return await adapter.complete(connection, secrets, { system, messages: messagesFor(testCase), tools: TOOL_DEFINITIONS, maxTokens: 400 });
    } catch (error) {
      const asked = retryAfterMs(error.message);
      if (asked === null || asked > LONGEST_WAIT_MS) throw error;
      // A minute's token budget refills slowly: "try again in 30ms" is rarely enough.
      const wait = Math.max(asked, 4_000 * (attempt + 1));
      process.stdout.write(`  (rate limited, waiting ${Math.round(wait / 1000)} s)\n`);
      await sleep(wait);
    }
  }
  throw new Error(`Still rate limited after ${MAX_TRIES} tries.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const keyVariable = KEY_VARIABLES[args.provider];
  if (!keyVariable) throw new Error(`--provider must be one of ${Object.keys(KEY_VARIABLES).join(', ')}.`);
  const apiKey = process.env[keyVariable];
  if (!apiKey) throw new Error(`${keyVariable} is not set. Add it to the root .env (it is git-ignored).`);

  const { cases, offer } = readEvalFile();
  const start = args.from ? cases.findIndex((testCase) => testCase.id === args.from) : 0;
  if (start < 0) throw new Error(`No case ${args.from}.`);
  const chosen = cases.slice(start).filter((testCase) => (!args.only || args.only.includes(testCase.id)) && (!args.label || testCase.label === args.label));
  // The provider's own default, so the eval tests what a restaurant gets.
  const model = args.model ?? providerFor(args.provider).configSchema.parse({}).model;
  // `skipLog`: these calls belong to no restaurant, so there is no event log to write.
  const connection = { provider: args.provider, config: { model }, skipLog: true };
  const adapter = await adapterFor(args.provider);
  const plainPrompt = buildSystemPrompt(EVAL_FACTS);
  const offerPrompt = buildSystemPrompt({ ...EVAL_FACTS, lastMessageToGuest: offer });

  process.stdout.write(`Assistant eval: ${chosen.length} cases, ${args.provider} ${model}\n\n`);
  const results = [];
  let stoppedEarly = null;
  for (const testCase of chosen) {
    try {
      const answer = await ask(adapter, connection, { apiKey }, testCase.afterOffer ? offerPrompt : plainPrompt, testCase);
      const result = judge(testCase, outcomeOf(answer));
      results.push(result);
      const mark = result.ok ? 'ok  ' : 'FAIL';
      process.stdout.write(`${mark} ${testCase.id.padEnd(5)} ${testCase.label.padEnd(12)} ${result.outcome.padEnd(22)} ${result.ok ? '' : `wanted ${testCase.accept.join(' or ')}`}\n`);
      if (!result.ok && answer.text) process.stdout.write(`       said: ${answer.text.replace(/\s+/g, ' ').slice(0, 160)}\n`);
    } catch (error) {
      stoppedEarly = `${testCase.id}: ${error.message}`;
      break;
    }
    await sleep(GAP_MS);
  }

  const summary = summarise(results);
  process.stdout.write(`\n${summary.right} of ${summary.total} right (${(summary.overall * 100).toFixed(1)}%, the bar is ${PASS_RATE * 100}%)\n`);
  process.stdout.write(`Stops missed: ${summary.stopMissed}. Taken as a stop wrongly: ${summary.falseStops}. Wrong scope: ${summary.wrongScope} (scope right ${(summary.scopeRight * 100).toFixed(1)}%).\n`);
  for (const [label, { total, right }] of Object.entries(summary.byLabel)) process.stdout.write(`  ${label.padEnd(12)} ${right} of ${total}\n`);
  if (stoppedEarly) process.stdout.write(`\nStopped early, so this is a partial run. ${stoppedEarly}\n`);
  process.stdout.write(`\n${summary.passes && !stoppedEarly ? 'PASSES' : 'DOES NOT PASS'}\n`);
  process.exitCode = summary.passes && !stoppedEarly ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
