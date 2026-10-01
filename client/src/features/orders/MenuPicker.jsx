import { useMemo, useState } from 'react';

import { formatPaise } from '../../utils/formatMoney.js';

/**
 * The menu, for adding lines to an order.
 *
 * Reads GET /menu, which is exactly what that endpoint is for: the sellable
 * menu, one request, no inactive records and, by default, nothing that is out
 * of stock. A waiter cannot order something that is not for sale, so nothing
 * that is not for sale is on this screen, and no card needs an availability
 * stamp to say so.
 *
 * Cards, filtered by category pills, because on this screen every dish is a
 * tap target. The search box lives in the order screen's header and is passed
 * in.
 *
 * A dish with nothing to choose shows a stepper once it is on the order and
 * not yet sent. The stepper edits that one line's quantity rather than adding
 * a second line of the same dish, so the kitchen ticket reads "3 × Latte", not
 * three separate lattes. `simpleLines` maps a menu item id to that line.
 */
export default function MenuPicker({
  tree,
  isPending,
  isError,
  search,
  disabled,
  simpleLines,
  pendingCounts,
  onPick,
  onStep,
  onRemove,
}) {
  const [categoryId, setCategoryId] = useState(null);

  const categories = tree ?? [];
  const needle = search.trim().toLowerCase();

  const visible = useMemo(
    () =>
      categories
        .filter((category) => needle || categoryId === null || category.id === categoryId)
        .flatMap((category) =>
          needle
            ? category.items.filter((item) => item.name.toLowerCase().includes(needle))
            : category.items,
        ),
    [categories, categoryId, needle],
  );

  const totalItems = categories.reduce((sum, category) => sum + category.items.length, 0);

  return (
    <section aria-label="Menu" className="flex flex-col gap-4">
      {categories.length > 1 && !needle && (
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-1">
          <CategoryPill
            label="All"
            count={totalItems}
            isActive={categoryId === null}
            onClick={() => setCategoryId(null)}
          />
          {categories.map((category) => (
            <CategoryPill
              key={category.id}
              label={category.name}
              count={category.items.length}
              isActive={categoryId === category.id}
              onClick={() => setCategoryId(category.id)}
            />
          ))}
        </div>
      )}

      {isPending && <p className="text-[15px] text-steel">Loading the menu…</p>}

      {isError && (
        <p className="text-[15px] text-mirch">The menu could not be loaded. Check your connection.</p>
      )}

      {!isPending && !isError && visible.length === 0 && (
        <p className="text-[15px] leading-[22px] text-steel">
          {needle
            ? `Nothing on the menu matches “${search.trim()}”.`
            : 'Nothing on the menu is available right now.'}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((item) => (
          <li key={item.id}>
            <DishCard
              item={item}
              line={simpleLines.get(item.id)}
              pendingCount={pendingCounts.get(item.id) ?? 0}
              disabled={disabled}
              onPick={() => onPick(item)}
              onStep={onStep}
              onRemove={onRemove}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DishCard({ item, line, pendingCount, disabled, onPick, onStep, onRemove }) {
  const hasChoices = item.variants.length > 0 || item.addOns.length > 0;

  return (
    <div
      className={[
        'flex h-full flex-col justify-between rounded-2xl bg-white p-4 shadow-card transition-shadow hover:shadow-lift',
        line || (hasChoices && pendingCount > 0) ? 'ring-2 ring-chana/50' : '',
      ].join(' ')}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onPick}
        className="min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
      >
        <h3 className="line-clamp-2 text-[16px] font-semibold leading-6">{item.name}</h3>
        {/* An item description is prose, so it is Sans. */}
        {item.description && (
          <p className="mt-1 line-clamp-2 text-[12px] leading-4 text-steel">{item.description}</p>
        )}
        {hasChoices && (
          <span className="mt-2 inline-flex rounded bg-linen-2 px-2 py-0.5 text-[11px] font-semibold text-steel">
            {item.variants.length > 0 ? `${item.variants.length} sizes` : 'Extras'}
          </span>
        )}
      </button>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-black/5 pt-3">
        {/* Every number is Mono. */}
        <span className="font-mono text-[16px] font-bold leading-[22px]">
          {formatPaise(item.priceInPaise)}
        </span>

        {line ? (
          <div className="flex items-center rounded-full bg-chana p-1 shadow-card">
            <StepButton
              label={line.quantity === 1 ? `Remove ${item.name}` : 'One fewer'}
              symbol="−"
              disabled={disabled}
              onClick={() =>
                line.quantity === 1 ? onRemove(line) : onStep(line, line.quantity - 1)
              }
            />
            <span aria-live="polite" className="w-8 text-center font-mono text-[14px] font-bold">
              {line.quantity}
            </span>
            <StepButton
              label="One more"
              symbol="+"
              disabled={disabled}
              onClick={() => onStep(line, line.quantity + 1)}
            />
          </div>
        ) : hasChoices ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onPick}
            className="flex h-10 items-center gap-1 rounded-full bg-chana-soft px-3.5 text-[12px] font-semibold text-ink shadow-card transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
          >
            {pendingCount > 0 ? `${pendingCount} added · Select` : '+ Select'}
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Add ${item.name}`}
            disabled={disabled}
            onClick={onPick}
            className="flex size-10 items-center justify-center rounded-full bg-chana text-[20px] text-ink shadow-card transition-transform active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

function StepButton({ label, symbol, onClick, disabled }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-full bg-white text-[16px] font-bold transition-transform active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
    >
      {symbol}
    </button>
  );
}

function CategoryPill({ label, count, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={[
        'flex h-11 flex-none items-center gap-2 whitespace-nowrap rounded-full px-5 text-[14px] font-semibold transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        isActive ? 'bg-ink text-white shadow-lift' : 'bg-white text-steel shadow-card hover:bg-linen-3',
      ].join(' ')}
    >
      {label}
      <span
        className={[
          'rounded-full px-2 py-0.5 font-mono text-[11px]',
          isActive ? 'bg-white/20 text-white' : 'text-steel/70',
        ].join(' ')}
      >
        {count}
      </span>
    </button>
  );
}
