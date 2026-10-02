import { CrossIcon, TickIcon } from './icons/index.jsx';
import StateChip from './StateChip.jsx';
import TimeEdge, { ElapsedTime, useElapsed } from './TimeEdge.jsx';

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
 * more often. One tap on an item marks it ready; one tap on the footer marks
 * the whole ticket ready. The time edge runs against the station's target and
 * turns `alert` with "Late" once past it. Nothing else on the ticket is loud.
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

      <ul className="flex flex-1 flex-col px-2 py-2">
        {lines.map((line) => {
          const isDone = line.status === 'READY';
          const isCancelled = line.status === 'CANCELLED';
          return (
            <li key={line.id}>
              <button
                type="button"
                disabled={isBusy || isDone || isCancelled}
                onClick={() => onLineReady(line.id)}
                className="flex min-h-14 w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-sunken disabled:cursor-default disabled:hover:bg-transparent"
              >
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
                {isDone && (
                  <span className="mt-1 flex-none text-ok">
                    <TickIcon />
                    <span className="sr-only">Ready</span>
                  </span>
                )}
                {isCancelled && (
                  <span className="mt-1 flex-none text-alert" aria-hidden="true">
                    <CrossIcon />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="border-t border-line">
        <button
          type="button"
          disabled={isBusy || outstanding.length === 0}
          onClick={onAllReady}
          className="flex min-h-14 w-full items-center justify-between gap-3 px-4 pb-3 pt-2 hover:bg-sunken disabled:cursor-default disabled:hover:bg-transparent"
        >
          <ElapsedTime since={firedAt} targetMinutes={targetMinutes} />
          <span className="type-button flex items-center gap-2">
            {outstanding.length === 0 ? 'All ready' : outstanding.length === lines.length ? 'Ready' : `${outstanding.length} left, ready`}
            <TickIcon />
          </span>
        </button>
      </footer>
      <TimeEdge since={firedAt} targetMinutes={targetMinutes} state="open" />
    </article>
  );
}
