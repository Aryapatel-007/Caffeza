import { Fragment } from 'react';

import { formatTimeIst } from '../../utils/formatDate.js';
import { useEffect, useRef, useState } from 'react';

import { CrossIcon, TickIcon } from './icons/index.jsx';
import StateChip from './StateChip.jsx';
import TimeEdge, { ElapsedTime, useElapsed } from './TimeEdge.jsx';

/** P29 Part E. How long the whole-ticket button is held before it marks everything ready. */
const HOLD_MS = 500;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One kitchen ticket. DESIGN-SYSTEM sections 8b and 9.
 *
 *   ┌──────────────────┐
 *   │ KOT 412  T 14    │
 *   ├──────────────────┤
 *   │ 1  Creamy Pesto  │
 *   │ 2  Cheesy Tornado│
 *   │    + Extra cheese│
 *   ├──────────────────┤
 *   │ 12 min   Ready ✓ │
 *   │████████░░░░░░░░░░│
 *   └──────────────────┘
 *
 * Items in `ticket-item`, the narrower width, so long dish names fit one line
 * more often. P38: each item has a Cooking / Ready switch, at least 56 px
 * tall; switched on it is ready, switched off again it goes back to the
 * kitchen (P29's undo). Tapping the dish itself does nothing, so a brushed
 * row never marks food ready. A ready item stays, struck through and faded,
 * until the whole ticket is done.
 * Marking the whole ticket needs the footer held for half a second, the fill
 * showing how long is left; with reduced motion it asks "Mark all 6 ready?"
 * instead. The time edge runs against the station's target and turns `alert`
 * with "Late" once past it. Nothing else on the ticket is loud.
 */
export default function TicketCard({
  kotNumber,
  place,
  subtitle = null,
  firedAt,
  targetMinutes,
  lines,
  notPrinted = false,
  isBusy = false,
  onLineReady,
  onLineUndo = null,
  onAllReady,
  onReprint,
}) {
  const outstanding = lines.filter((line) => line.status === 'PENDING');
  const { isLate } = useElapsed(firedAt, targetMinutes);

  return (
    <article
      className={[
        'relative flex h-full animate-[ticket-in_160ms_ease-out] flex-col overflow-hidden rounded-[10px] bg-surface text-ink',
        isLate ? 'border-[3px] border-alert' : 'border border-line',
      ].join(' ')}
    >
      <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="type-num-tile">KOT {kotNumber}</span>
            <span className="type-heading truncate">{place}</span>
          </p>
          {subtitle && <p className="type-caption mt-1 text-muted">{subtitle}</p>}
        </div>
        {onReprint && (
          <button type="button" onClick={onReprint} className="type-label min-h-12 flex-none rounded-lg px-2 text-muted hover:bg-sunken hover:text-ink">
            Reprint
          </button>
        )}
      </header>

      {notPrinted && (
        <p className="type-label border-b border-line bg-alert-tint px-4 py-2 text-alert">Not printed. Tap Reprint.</p>
      )}

      <ul className="flex flex-1 flex-col gap-1 px-2 py-2">
        {lines.map((line, index) => {
          const isDone = line.status === 'READY';
          const isCancelled = line.status === 'CANCELLED';
          // P36. A later Send on the same ticket starts under its own caption.
          const startsRound = (line.round ?? 1) > 1 && (index === 0 || lines[index - 1].round !== line.round);
          return (
            <Fragment key={line.id}>
            {startsRound && (
              <li className="type-caption border-t border-line px-2 pt-2 text-muted">Added {formatTimeIst(line.firedAt)}</li>
            )}
            <li className="flex items-center gap-2 rounded-lg px-2 py-2">
              <div className={['flex min-w-0 flex-1 items-start gap-3', isDone ? 'opacity-60' : ''].join(' ')}>
                <span className="type-num-tile w-8 flex-none text-right">{line.quantity}</span>
                <span className="min-w-0 flex-1">
                  <span
                    title={line.variantName ? `${line.itemName} · ${line.variantName}` : line.itemName}
                    className={['type-ticket-item line-clamp-2 break-words', isDone || isCancelled ? 'text-muted line-through' : ''].join(' ')}
                  >
                    {line.itemName}
                    {line.variantName && <span className="text-muted"> · {line.variantName}</span>}
                  </span>
                  {line.addOnNames?.length > 0 && <span className="type-body block pl-3 text-muted">+ {line.addOnNames.join(', ')}</span>}
                  {line.notes && <span className="type-body block pl-3 italic text-ink">{line.notes}</span>}
                  {isCancelled && <StateChip state="alert" word="Cancelled, do not make" size="sm" className="mt-1" />}
                </span>
              </div>
              {isCancelled ? (
                <span className="mt-1 flex-none text-alert" aria-hidden="true">
                  <CrossIcon />
                </span>
              ) : (
                <ReadySwitch
                  name={line.itemName}
                  isReady={isDone}
                  disabled={isBusy || (isDone && !onLineUndo)}
                  onChange={() => (isDone ? onLineUndo(line.id) : onLineReady(line.id))}
                />
              )}
            </li>
            </Fragment>
          );
        })}
      </ul>

      <footer className="border-t border-line">
        <HoldToConfirm count={outstanding.length} total={lines.length} disabled={isBusy || outstanding.length === 0} onConfirm={onAllReady}>
          <ElapsedTime since={firedAt} targetMinutes={targetMinutes} />
          <span className="type-button flex items-center gap-2">
            {outstanding.length === 0 ? 'All ready' : outstanding.length === lines.length ? 'Hold for all ready' : `Hold: ${outstanding.length} left ready`}
            <TickIcon />
          </span>
        </HoldToConfirm>
      </footer>
      <TimeEdge since={firedAt} targetMinutes={targetMinutes} state="open" />
    </article>
  );
}

/**
 * P38. One dish's switch: Cooking (off) or Ready (on). A real switch for
 * screen readers, named after the dish, with the state in words beside the
 * knob so it never relies on colour. The knob slides; nothing loops.
 */
function ReadySwitch({ name, isReady, disabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isReady}
      aria-label={`${name} ready`}
      disabled={disabled}
      onClick={onChange}
      className="flex min-h-14 flex-none items-center gap-2 rounded-full px-1 disabled:opacity-50"
    >
      <span className={`type-label w-16 text-right ${isReady ? 'text-ok' : 'text-muted'}`}>{isReady ? 'Ready' : 'Cooking'}</span>
      <span
        aria-hidden="true"
        className={['relative flex h-9 w-16 flex-none items-center rounded-full border-2 transition-colors duration-150', isReady ? 'border-ok bg-ok' : 'border-line bg-sunken'].join(' ')}
      >
        <span
          className={['absolute top-0.5 size-7 rounded-full bg-surface shadow transition-transform duration-150', isReady ? 'translate-x-[1.85rem]' : 'translate-x-0.5'].join(' ')}
        />
      </span>
    </button>
  );
}

/**
 * P29 Part E. The whole-ticket button, held for half a second, the fill
 * growing across it as it is held; let go early and nothing happens. With
 * reduced motion, or from the keyboard, it asks in words instead, on the
 * ticket itself, never in a browser dialog.
 */
function HoldToConfirm({ count, total, disabled, onConfirm, children }) {
  const [holding, setHolding] = useState(false);
  const [asking, setAsking] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const cancel = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };
  const start = (event) => {
    if (disabled || event.button > 0) return;
    if (prefersReducedMotion()) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onConfirm();
    }, HOLD_MS);
  };

  if (asking) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <span className="type-body">Mark all {count} ready?</span>
        <span className="flex gap-2">
          <button type="button" onClick={() => setAsking(false)} className="type-button min-h-14 rounded-lg border border-line px-4 hover:bg-sunken">
            No
          </button>
          <button
            type="button"
            onClick={() => {
              setAsking(false);
              onConfirm();
            }}
            className="type-button min-h-14 rounded-lg bg-accent px-4 text-on-accent hover:brightness-110"
          >
            Yes
          </button>
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(event) => event.preventDefault()}
      // A keyboard press, or a tap with reduced motion, asks in words. A held pointer never reaches here.
      onClick={(event) => {
        if (disabled) return;
        if (event.detail === 0 || prefersReducedMotion()) setAsking(true);
      }}
      aria-label={total > 0 ? `Mark all ${count} ready. Hold to confirm.` : undefined}
      className="relative flex min-h-14 w-full touch-none select-none items-center justify-between gap-3 overflow-hidden px-4 pb-3 pt-2 hover:bg-sunken disabled:cursor-default disabled:hover:bg-transparent"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-ok-tint transition-[width] ease-linear"
        style={{ width: holding ? '100%' : '0%', transitionDuration: holding ? `${HOLD_MS}ms` : '0ms' }}
      />
      <span className="relative flex w-full items-center justify-between gap-3">{children}</span>
    </button>
  );
}
