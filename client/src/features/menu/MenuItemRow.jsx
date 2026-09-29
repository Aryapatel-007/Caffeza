import AvailabilityStamp from '../../components/ui/AvailabilityStamp.jsx';
import { formatBasisPoints, formatPaise } from '../../utils/formatMoney.js';

/**
 * One dense row in the builder.
 *
 * A list, not a card. Staff scan a list faster, and this screen is read top to
 * bottom looking for one dish.
 *
 * The price is Mono because it is a number. The name and description are Sans
 * because they are not.
 */
export default function MenuItemRow({ item, onEdit, onToggleAvailability, isBusy }) {
  return (
    <div
      className={[
        'flex items-center gap-3 border-b border-steel/25 py-3.5 sm:gap-5',
        item.isActive ? '' : 'opacity-50',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] leading-[22px] text-ink">{item.name}</span>
          {!item.isActive && (
            <span className="rounded border border-steel/45 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-steel">
              OFF THE MENU
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-[13px] leading-[18px] text-steel">{item.description}</p>
        )}
        {item.variants?.length > 0 && (
          <p className="mt-0.5 font-mono text-xs text-steel">
            {item.variants.length} variant{item.variants.length === 1 ? '' : 's'}
            {item.addOns?.length > 0 ? ` · ${item.addOns.length} add-on${item.addOns.length === 1 ? '' : 's'}` : ''}
          </p>
        )}
      </div>

      <span className="hidden rounded border border-steel/45 px-2 py-0.5 font-mono text-xs text-steel sm:inline">
        GST {formatBasisPoints(item.taxRateBps)}
      </span>

      <span className="font-mono text-[15px] font-medium tabular-nums text-ink">
        {formatPaise(item.priceInPaise, { symbol: false })}
      </span>

      <AvailabilityStamp
        size="sm"
        state={item.isAvailable ? 'available' : 'out_of_stock'}
        onToggle={() => onToggleAvailability(item)}
        disabled={isBusy}
      />

      <button
        type="button"
        onClick={() => onEdit(item)}
        className="min-h-[44px] px-1 text-[13px] font-medium text-steel underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Edit
      </button>
    </div>
  );
}
