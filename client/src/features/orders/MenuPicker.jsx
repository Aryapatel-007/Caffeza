import { useMemo, useState } from 'react';

import { formatPaise } from '../../utils/formatMoney.js';

/**
 * The menu, for adding lines to an order.
 *
 * Reads GET /menu, which is exactly what that endpoint is for: the sellable
 * menu, one request, no inactive records and, by default, nothing that is out
 * of stock. A waiter cannot order something that is not for sale, so nothing
 * that is not for sale is on this screen.
 *
 * A dense list rather than a grid of cards. Staff scan this looking for one
 * dish name, and DESIGN-SYSTEM.md section 6 is explicit that a list is read
 * faster than a grid.
 */
export default function MenuPicker({ tree, isPending, isError, onPick, disabled }) {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState(null);

  const categories = tree ?? [];

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return categories
      .filter((category) => categoryId === null || category.id === categoryId)
      .map((category) => ({
        ...category,
        items: needle
          ? category.items.filter((item) => item.name.toLowerCase().includes(needle))
          : category.items,
      }))
      .filter((category) => category.items.length > 0);
  }, [categories, categoryId, search]);

  return (
    <section aria-label="Menu" className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-black/10 px-4 py-3">
        <label className="block">
          <span className="sr-only">Search the menu</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search the menu"
            className="h-12 w-full rounded-xl border-2 border-steel/40 bg-paper px-3 text-[15px] leading-[22px] placeholder:text-steel focus:border-ink focus:outline-none"
          />
        </label>

        {categories.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <FilterChip
              label="All"
              isActive={categoryId === null}
              onClick={() => setCategoryId(null)}
            />
            {categories.map((category) => (
              <FilterChip
                key={category.id}
                label={category.name}
                isActive={categoryId === category.id}
                onClick={() => setCategoryId(category.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {isPending && <p className="text-[15px] text-steel">Loading the menu…</p>}

        {isError && (
          <p className="text-[15px] text-mirch">
            The menu could not be loaded. Check your connection.
          </p>
        )}

        {!isPending && !isError && visible.length === 0 && (
          <p className="text-[15px] leading-[22px] text-steel">
            {search.trim()
              ? `Nothing on the menu matches “${search.trim()}”.`
              : 'Nothing on the menu is available right now.'}
          </p>
        )}

        {visible.map((category) => (
          <div key={category.id} className="mb-6">
            <h3 className="mb-2 text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
              {category.name}
            </h3>

            <ul className="divide-y divide-steel/20">
              {category.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(item)}
                    className="flex min-h-[56px] w-full items-center justify-between gap-3 py-2.5 text-left transition-transform active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] leading-[22px]">{item.name}</span>
                      {/* An item description is prose, so it is Sans. */}
                      {item.description && (
                        <span className="block truncate text-[13px] leading-[18px] text-steel">
                          {item.description}
                        </span>
                      )}
                      {item.variants.length > 0 && (
                        <span className="block text-[13px] leading-[18px] text-steel">
                          {item.variants.length} sizes
                        </span>
                      )}
                    </span>

                    {/* Every number is Mono. */}
                    <span className="flex-none font-mono text-[15px] font-medium leading-5">
                      {formatPaise(item.priceInPaise)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function FilterChip({ label, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={[
        'flex h-10 items-center rounded-full border-2 px-3 text-[13px] font-medium',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        isActive ? 'border-ink bg-ink text-paper' : 'border-steel/40 text-steel',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
