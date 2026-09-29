/**
 * Drives the real application over a real socket.
 *
 * The app under test is the one `createApp()` builds for production, so the
 * whole middleware chain runs: helmet, cors, body parsing, logging, the rate
 * limiters, the tenant guard, and the error handler.
 */
import { httpLogger, logger } from '../../config/logger.js';
import { createApp } from '../../server.js';

let server;
let baseUrl;

/**
 * Every response body this suite has seen.
 *
 * Used by the test that asserts passwordHash never leaves the server. Checking
 * one endpoint proves one endpoint; checking every body the suite produced
 * proves the field is not reachable at all.
 */
export const observedResponses = [];

export async function startTestServer() {
  /**
   * Quiet. A passing suite should print test results, not request logs.
   *
   * Both, because pino-http holds its own child logger whose level does not
   * follow the parent. Set these to 'debug' locally when a failing test needs
   * the server side of the story.
   */
  logger.level = 'silent';
  httpLogger.logger.level = 'silent';

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}

export function stopTestServer() {
  return new Promise((resolve) => server.close(resolve));
}

/** Makes a request and returns { status, body, headers }. */
export async function request(method, path, { body, token, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  if (token) requestHeaders.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let parsed = null;
  const text = await response.text();
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }

  observedResponses.push({ method, path, status: response.status, body: parsed });

  return { status: response.status, body: parsed, headers: response.headers };
}
