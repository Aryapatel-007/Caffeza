import StateChip, { availabilityChip } from '../../components/ui/StateChip.jsx';
import { formatBasisPoints } from '../../utils/formatMoney.js';
import { moneyText } from '../../components/ui/Money.jsx';

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
        'flex items-center gap-3 border-b border-line py-3.5 sm:gap-5',
        item.isActive ? '' : 'opacity-50',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="type-body text-ink">{item.name}</span>
          {!item.isActive && (
            <span className="type-caption rounded-full border border-line px-2 py-0.5 text-muted">
              Off the menu
            </span>
          )}
        </div>
        {item.description && (
          <p className="type-caption text-muted">{item.description}</p>
        )}
        {item.variants?.length > 0 && (
          <p className="mt-0.5 font-mono text-xs text-muted">
            {item.variants.length} variant{item.variants.length === 1 ? '' : 's'}
            {item.addOns?.length > 0 ? ` · ${item.addOns.length} add-on${item.addOns.length === 1 ? '' : 's'}` : ''}
          </p>
        )}
      </div>

      <span className="hidden rounded border border-muted px-2 py-0.5 font-mono text-xs text-muted sm:inline">
        GST {formatBasisPoints(item.taxRateBps)}
      </span>

      <span className="type-num tabular-nums text-ink">
        {moneyText(item.priceInPaise, { symbol: false })}
      </span>

      <StateChip {...availabilityChip(item.isAvailable)} size="sm" onClick={() => onToggleAvailability(item)} disabled={isBusy} />

      <button
        type="button"
        onClick={() => onEdit(item)}
        className="min-h-12 px-1 type-caption text-muted underline-offset-4 hover:underline "
      >
        Edit
      </button>
    </div>
  );
}
