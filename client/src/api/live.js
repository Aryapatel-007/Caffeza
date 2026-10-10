/**
 * The live channel, on the screens' side. P33, docs/API-CONTRACT.md "P33".
 *
 * One connection per signed-in device, opened by the app shell. It carries no
 * data: a message names a topic, and the only reaction is to invalidate that
 * topic's queries, so the screen reads again over the ordinary authenticated
 * API. A lost message costs at most one poll interval.
 *
 * Polling stays. While the channel is healthy, open and heard from in the last
 * 30 seconds, the screens on these topics poll every 60 seconds; the moment it
 * is not, they go straight back to their own interval and read once at once.
 * Nothing on screen shows the connection.
 */
import { useSyncExternalStore } from 'react';
import { io } from 'socket.io-client';

/** The path on the server; the same through any origin. */
const LIVE_PATH = '/api/v1/live';
/** No heartbeat for this long and the channel is not trusted. The server sends one every 20 seconds. */
export const HEARTBEAT_LIMIT_MS = 30_000;
/** How often a screen polls while the channel is healthy. */
export const SLOW_POLL_MS = 60_000;

/** The queries each topic tells screens to read again. */
export const TOPIC_KEYS = Object.freeze({
  kots: [['kots']],
  tables: [['tables'], ['reports', 'dashboard']],
  online: [['online']],
  'platform-orders': [['platform-orders'], ['online', 'inbox']],
  'print-queue': [['print-queue']],
});

let socket = null;
let queryClient = null;
let lastHeartbeat = 0;
let healthy = false;
let checker = null;
const listeners = new Set();

const notify = () => listeners.forEach((listener) => listener());

/** Every topic's queries, read again: on connecting, and on losing the channel, nothing may have been missed. */
function readEverythingAgain() {
  for (const keys of Object.values(TOPIC_KEYS)) for (const queryKey of keys) queryClient?.invalidateQueries({ queryKey });
}

function recheck() {
  // performance.now() keeps counting whatever the device's clock is set to.
  const now = socket?.connected === true && lastHeartbeat > 0 && performance.now() - lastHeartbeat < HEARTBEAT_LIMIT_MS;
  if (now === healthy) return;
  healthy = now;
  readEverythingAgain();
  notify();
}

/**
 * Opens the channel. `getToken` is asked on every attempt, so a reconnect
 * after the server closed an expired token's socket uses the newest one.
 */
export function startLive({ origin, getToken, client }) {
  stopLive();
  queryClient = client;
  socket = io(origin ?? undefined, {
    path: LIVE_PATH,
    transports: ['websocket'],
    auth: (send) => send({ token: getToken() }),
    reconnectionDelay: 2_000,
    reconnectionDelayMax: 30_000,
  });
  socket.on('heartbeat', () => {
    lastHeartbeat = performance.now();
    recheck();
  });
  socket.on('changed', (message) => {
    for (const queryKey of TOPIC_KEYS[message?.topic] ?? []) queryClient?.invalidateQueries({ queryKey });
  });
  socket.on('disconnect', (reason) => {
    recheck();
    // The server closes a socket whose token expired; Socket.IO does not
    // reconnect after that on its own. Try again with the next token.
    if (reason === 'io server disconnect') setTimeout(() => socket?.connect(), 5_000);
  });
  socket.on('connect_error', recheck);
  checker = setInterval(recheck, 5_000);
}

/** Closes the channel; every screen polls at its own interval. */
export function stopLive() {
  clearInterval(checker);
  checker = null;
  socket?.removeAllListeners();
  socket?.close();
  socket = null;
  lastHeartbeat = 0;
  if (healthy) {
    healthy = false;
    notify();
  }
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The poll interval for a screen: its own while the channel is not healthy,
 * 60 seconds while it is. Every polling screen on a live topic reads it here,
 * so the rule exists once.
 */
export function useLiveInterval(ownMs) {
  const isHealthy = useSyncExternalStore(subscribe, () => healthy, () => false);
  return isHealthy ? Math.max(ownMs, SLOW_POLL_MS) : ownMs;
}
