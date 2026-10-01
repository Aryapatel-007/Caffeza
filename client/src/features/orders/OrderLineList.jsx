import { formatPaise } from '../../utils/formatMoney.js';
import { QuantityStepper } from './LineOptionsPanel.jsx';
import { describeReason, LINE_CANCEL_REASONS } from './cancelReasons.js';

/**
 * How far along one line is.
 *
 * Text first, colour second. `patta` marks READY because that is its meaning,
 * available or succeeded, and a cancelled line is `mirch` for the same reason.
 * PENDING and FIRED get no colour at all: "waiting" is not one of the three
 * functional meanings, and painting it would make the two that matter harder
 * to pick out.
 */
const STATUS_LABELS = {
  PENDING: 'Not sent',
  FIRED: 'With the kitchen',
  READY: 'Ready',
  SERVED: 'Served',
  CANCELLED: 'Cancelled',
};

const STATUS_TONE = {
  READY: 'text-patta',
  CANCELLED: 'text-mirch',
};

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
}) {
  if (lines.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-[15px] leading-[22px] text-steel">
        Nothing on this order yet. Pick something from the menu.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-steel/20">
      {lines.map((line) => {
        const isCancelled = line.status === 'CANCELLED';
        const isPending = line.status === 'PENDING';

        return (
          <li key={line.id} className={['px-5 py-3', isCancelled ? 'opacity-60' : ''].join(' ')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={[
                    'text-[15px] leading-[22px]',
                    isCancelled ? 'line-through' : '',
                  ].join(' ')}
                >
                  {line.itemName}
                  {line.variantName && (
                    <span className="text-steel"> · {line.variantName}</span>
                  )}
                </p>

                {line.addOns.length > 0 && (
                  <p className="text-[13px] leading-[18px] text-steel">
                    {line.addOns.map((addOn) => addOn.name).join(', ')}
                  </p>
                )}

                {line.notes && (
                  <p className="text-[13px] leading-[18px] text-steel">“{line.notes}”</p>
                )}

                <p
                  className={[
                    'mt-0.5 text-[13px] leading-[18px]',
                    STATUS_TONE[line.status] ?? 'text-steel',
                  ].join(' ')}
                >
                  {STATUS_LABELS[line.status]}
                  {isCancelled && line.wasPrepared === true && ' · was made'}
                  {isCancelled && line.wasPrepared === false && ' · not made'}
                </p>

                {/* P04. The fixed reason's label and the note. A line cancelled
                    with the whole order carries only the note. */}
                {isCancelled && describeReason(LINE_CANCEL_REASONS, line.cancelReasonCode, line.cancelReason) && (
                  <p className="text-[13px] leading-[18px] text-steel">
                    {describeReason(LINE_CANCEL_REASONS, line.cancelReasonCode, line.cancelReason)}
                  </p>
                )}
              </div>

              <div className="flex-none text-right">
                <p className="font-mono text-[15px] font-medium leading-5">
                  {formatPaise(line.lineTotalInPaise)}
                </p>
                <p className="font-mono text-[12px] leading-4 text-steel">
                  {line.quantity} × {formatPaise(line.unitPriceInPaise)}
                </p>
              </div>
            </div>

            {!isCancelled && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {isPending && (
                  <QuantityStepper
                    value={line.quantity}
                    disabled={isBusy}
                    onChange={(quantity) => onChangeQuantity(line, quantity)}
                  />
                )}

                {line.status === 'READY' && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onServeLine(line)}
                    className="h-12 rounded-full bg-chana px-4 text-[15px] font-semibold text-ink transition-transform active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
                  >
                    Mark served
                  </button>
                )}

                {line.status !== 'SERVED' && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onCancelLine(line)}
                    className="h-12 rounded-full px-3 text-[13px] font-medium text-mirch focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirch disabled:opacity-60"
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
