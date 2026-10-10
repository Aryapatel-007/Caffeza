/**
 * Whether the app is waiting for the server to wake. P30.
 *
 * A tiny store outside React, because the API client, which is not React,
 * sets it, and the bar at the top of every screen reads it through
 * `useSyncExternalStore`.
 *
 * `waiting` counts what is waiting right now (retried reads, the first-load
 * check), so the bar stays until the last of them is answered. `since` is
 * when the first began, for the progress line. `unconfirmed` is a write the
 * server may or may not have received while it woke.
 */
let state = Object.freeze({ waiting: 0, since: null, unconfirmed: false });
const listeners = new Set();

function set(next) {
  state = Object.freeze({ ...state, ...next });
  for (const listener of listeners) listener();
}

export function subscribeServerState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getServerState() {
  return state;
}

/** Call once per wait that begins; pair it with `endWaiting`. */
export function beginWaiting() {
  set({ waiting: state.waiting + 1, since: state.since ?? Date.now() });
}

export function endWaiting() {
  const waiting = Math.max(0, state.waiting - 1);
  set({ waiting, since: waiting === 0 ? null : state.since });
}

export function markUnconfirmed() {
  set({ unconfirmed: true });
}

export function clearUnconfirmed() {
  set({ unconfirmed: false });
}
