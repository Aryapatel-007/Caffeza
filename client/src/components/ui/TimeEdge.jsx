import { useSyncExternalStore } from 'react';

import { STATES } from './StateChip.jsx';
import { TriangleIcon } from './icons/index.jsx';

/**
 * The time edge. DESIGN-SYSTEM section 7a, the signature of service screens.
 *
 * A 4px bar along the bottom of anything that is waiting, filling left to right
 * with the time elapsed against that thing's target. Until the target it is the
 * item's state colour; at the target it turns `alert`, stays full, and "Late"
 * appears beside the time.
 *
 * It updates once a minute from ONE timer shared by the whole page, however
 * many tiles and tickets are on it, and never animates on its own.
 */
const listeners = new Set();
let now = Date.now();
let timer = null;

function subscribe(listener) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((notify) => notify());
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const snapshot = () => now;

/** The page's shared minute clock, in epoch milliseconds. */
export function useMinuteClock() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Whole minutes since `since`, and how that sits against the target. Display only. */
export function useElapsed(since, targetMinutes) {
  const clock = useMinuteClock();
  const start = since ? new Date(since).getTime() : clock;
  const minutes = Math.max(0, Math.floor((clock - start) / 60_000));
  const target = Math.max(1, targetMinutes ?? 1);
  return { minutes, isLate: minutes >= target, fraction: Math.min(1, minutes / target) };
}

/** The bar itself, laid along the bottom edge of a `relative` parent. */
export default function TimeEdge({ since, targetMinutes, state = 'open', className = '' }) {
  const { isLate, fraction } = useElapsed(since, targetMinutes);
  const fill = isLate ? STATES.alert.bar : (STATES[state] ?? STATES.open).bar;
  return (
    <span aria-hidden="true" className={`absolute inset-x-0 bottom-0 h-1 bg-sunken ${className}`}>
      <span className={`block h-full ${fill}`} style={{ width: `${(isLate ? 1 : fraction) * 100}%` }} />
    </span>
  );
}

/** "34 min", or the triangle, "Late" and the minutes once past the target. */
export function ElapsedTime({ since, targetMinutes, className = '' }) {
  const { minutes, isLate } = useElapsed(since, targetMinutes);
  if (!isLate) return <span className={`type-num-meta whitespace-nowrap text-muted ${className}`}>{minutes} min</span>;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-alert ${className}`}>
      <TriangleIcon size={16} />
      <span className="type-label">Late</span>
      <span className="type-num-meta">{minutes} min</span>
    </span>
  );
}
