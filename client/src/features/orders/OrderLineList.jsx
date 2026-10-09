import Money from '../../components/ui/Money.jsx';
import StateChip from '../../components/ui/StateChip.jsx';

import { QuantityStepper } from './LineOptionsPanel.jsx';
import { describeReason, LINE_CANCEL_REASONS } from './cancelReasons.js';

/**
 * How far along one line is, through `StateChip`: word, icon and colour
 * together. Not sent has no state colour, the way a free table has none.
 */
const LINE_STATES = {
  PENDING: { state: 'free', word: 'Not sent' },
  FIRED: { state: 'open', word: 'With the kitchen' },
  READY: { state: 'ok', word: 'Ready' },
  SERVED: { state: 'served', word: 'Served' },
  CANCELLED: { state: 'alert', word: 'Cancelled' },
};

/** P29 Part C. Served by the kitchen's ready: the served state's colour, with the kitchen's word. */
const READY_SERVED = { state: 'served', word: 'Ready' };

/**
 * The lines on an order, densest thing on the screen.
 *
 * A list, not cards: this is read, not tapped. Only a PENDING line can be
 * edited, because once the kitchen has it the dish is being cooked and the only
 * honest option is to cancel it and say whether it was made.
 */
export default function OrderLineList({
  lines,
  isBusy,
  onChangeQuantity,
  onCancelLine,
  onServeLine,
  // P29. The order has a bill: its lines change only through the bill.
  locked = false,
  // P29 Part C. The kitchen's ready serves the line: no served step, and a served line reads "Ready".
  readyMeansServed = false,
}) {
  if (lines.length === 0) {
    return (
      <p className="type-body px-4 py-8 text-muted">
        Nothing on this order yet. Pick something from the menu.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {lines.map((line) => {
        const isCancelled = line.status === 'CANCELLED';
        const isPending = line.status === 'PENDING';

        return (
          <li key={line.id} className={['px-4 py-3', isCancelled ? 'opacity-60' : ''].join(' ')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  title={line.variantName ? `${line.itemName} · ${line.variantName}` : line.itemName}
                  className={[
                    'type-body line-clamp-2 break-words',
                    isCancelled ? 'line-through' : '',
                  ].join(' ')}
                >
                  {line.itemName}
                  {line.variantName && (
                    <span className="text-muted"> · {line.variantName}</span>
                  )}
                </p>

                {line.addOns.length > 0 && (
                  <p className="type-caption text-muted">
                    {line.addOns.map((addOn) => addOn.name).join(', ')}
                  </p>
                )}

                {line.notes && (
                  <p className="type-caption text-muted">“{line.notes}”</p>
                )}

                <p className="mt-1 flex flex-wrap items-center gap-2">
                  <StateChip
                    {...(readyMeansServed && line.status === 'SERVED' ? READY_SERVED : (LINE_STATES[line.status] ?? LINE_STATES.PENDING))}
                    size="sm"
                  />
                  {isCancelled && line.wasPrepared === true && <span className="type-caption text-muted">was made</span>}
                  {isCancelled && line.wasPrepared === false && <span className="type-caption text-muted">not made</span>}
                </p>

                {/* P04. The fixed reason's label and the note. A line cancelled
                    with the whole order carries only the note. */}
                {isCancelled && describeReason(LINE_CANCEL_REASONS, line.cancelReasonCode, line.cancelReason) && (
                  <p className="type-caption text-muted">
                    {describeReason(LINE_CANCEL_REASONS, line.cancelReasonCode, line.cancelReason)}
                  </p>
                )}
              </div>

              <div className="flex-none text-right">
                <Money paise={line.lineTotalInPaise} size="num" tabular className="block" />
                <span className="type-num-meta block text-muted">
                  {line.quantity} × <Money paise={line.unitPriceInPaise} />
                </span>
              </div>
            </div>

            {!isCancelled && (
              <div className="mt-3 flex flex-wrap items-center gap-2 empty:hidden">
                {isPending && !locked && (
                  <QuantityStepper
                    value={line.quantity}
                    disabled={isBusy}
                    onChange={(quantity) => onChangeQuantity(line, quantity)}
                  />
                )}

                {line.status === 'READY' && !readyMeansServed && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onServeLine(line)}
                    className="type-button min-h-12 rounded-lg border border-ink bg-surface px-4 hover:bg-sunken disabled:opacity-60"
                  >
                    Mark served
                  </button>
                )}

                {/* P29: when the kitchen's ready serves the dish, a served line is one the kitchen just made, and may still be cancelled. */}
                {(line.status !== 'SERVED' || readyMeansServed) && !locked && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onCancelLine(line)}
                    className="type-label min-h-12 rounded-lg px-3 text-alert hover:bg-alert-tint disabled:opacity-60"
                  >
                    Cancel line
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
