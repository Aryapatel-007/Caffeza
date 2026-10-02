/**
 * What the setup script and the menu import share. P11.
 *
 * Both start the real app in-process, sign in as the owner through
 * POST /auth/login, and drive the API, the way scripts/seedDemo.js does, so
 * every permission check and validator runs exactly as it does for a person.
 * Neither ever writes a document directly.
 *
 * The owner's password is typed at the terminal with the characters hidden. It
 * is never read from a file, a flag or the environment, and never printed.
 */
import readline from 'node:readline';

import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { httpLogger, logger } from '../../config/logger.js';
import { createApp } from '../../server.js';

export const TO_CONFIRM = 'TO CONFIRM';

/** A failed API call, with the server's own message. */
export class ApiCallError extends Error {
  constructor(method, path, status, body) {
    const error = body?.error ?? {};
    const fields = error.fields ? ` ${JSON.stringify(error.fields)}` : '';
    super(`${method} ${path} -> ${status} ${error.code ?? ''} ${error.message ?? ''}${fields}`.trim());
    this.name = 'ApiCallError';
    this.status = status;
    this.body = body;
  }
}

/**
 * A small client over any `send(method, path, { body, token })` that answers
 * `{ status, body }`. The scripts pass one that calls the in-process server;
 * the tests pass tests/helpers/testServer.js `request`.
 */
export function apiClient(send, token) {
  const call = async (method, path, body) => {
    const response = await send(method, path, { body, token });
    if (response.status < 200 || response.status >= 300) {
      throw new ApiCallError(method, path, response.status, response.body);
    }
    return response.body.data;
  };
  return {
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body),
    patch: (path, body) => call('PATCH', path, body),
    put: (path, body) => call('PUT', path, body),
    /** Every page of a paged list. */
    async getAll(path) {
      const rows = [];
      for (let page = 1; ; page += 1) {
        const separator = path.includes('?') ? '&' : '?';
        const response = await send('GET', `${path}${separator}page=${page}&limit=200`, { token });
        if (response.status !== 200) throw new ApiCallError('GET', path, response.status, response.body);
        rows.push(...response.body.data);
        const total = response.body.meta?.total ?? rows.length;
        if (rows.length >= total || response.body.data.length === 0) return rows;
      }
    },
  };
}

/** Reads one line from the terminal with what is typed hidden. */
export function readHiddenLine(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('The owner password must be typed at a terminal. It is never read from a pipe, a file or a flag.'));
      return;
    }
    const input = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    const write = input._writeToOutput?.bind(input);
    input._writeToOutput = (text) => {
      if (!muted) write?.(text);
    };
    input.question(prompt, (answer) => {
      input.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

/** Reads `--name value` pairs and bare `--flags` from argv. */
export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  if ('password' in args) {
    throw new Error('Passwords are never accepted as a flag. You will be asked for the owner password.');
  }
  return args;
}

/**
 * Starts the app in-process on a random local port, signs in as the owner, and
 * returns `{ client, close }`.
 */
export async function startOwnerSession(ownerPhone) {
  if (!ownerPhone) throw new Error('Give the owner phone number with --owner-phone.');
  logger.level = 'warn';
  httpLogger.logger.level = 'warn';

  await connectDatabase();
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  const send = async (method, path, { body, token } = {}) => {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };

  const close = async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectDatabase();
  };

  try {
    const password = await readHiddenLine(`Owner password for ${ownerPhone}: `);
    const login = await send('POST', '/auth/login', { body: { phone: ownerPhone, password } });
    if (login.status !== 200) throw new ApiCallError('POST', '/auth/login', login.status, login.body);
    const client = apiClient(send, login.body.data.accessToken);
    const me = await client.get('/auth/me');
    if (me.user.role !== 'OWNER') throw new Error('Sign in as the owner. These scripts change owner-only settings.');
    return { client, restaurantName: me.restaurant.name, close };
  } catch (error) {
    await close();
    throw error;
  }
}

/** One plan line per step: section, name, what would happen, and why. */
export function formatPlan(steps) {
  const lines = [];
  let section = null;
  for (const step of steps) {
    if (step.section !== section) {
      section = step.section;
      lines.push('', section);
    }
    const word = { create: 'create', update: 'update', unchanged: 'already as wanted', skip: 'skipped', note: 'note' }[step.action] ?? step.action;
    lines.push(`  ${word.padEnd(17)} ${step.name}${step.detail ? `  (${step.detail})` : ''}`);
  }
  return lines.join('\n');
}

/** Counts by action. */
export function countSteps(steps) {
  const counts = { create: 0, update: 0, unchanged: 0, skip: 0 };
  for (const step of steps) if (step.action in counts) counts[step.action] += 1;
  return counts;
}

/** Runs every step that changes something, in order. Returns what the steps returned. */
export async function applySteps(steps) {
  const results = [];
  for (const step of steps) {
    if (typeof step.run === 'function' && (step.action === 'create' || step.action === 'update')) {
      results.push({ step, result: await step.run() });
    }
  }
  return results;
}
