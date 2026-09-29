import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import Toast from '../../components/ui/Toast.jsx';
import { listIngredients } from '../../api/inventory.js';
import { listMenuItems } from '../../api/menu.js';
import RecipeLineEditor from './RecipeLineEditor.jsx';

/**
 * The recipe editor. The one back-office screen in M4, and it is allowed to
 * be denser than the rest: nobody edits a recipe standing up mid-queue.
 *
 * A menu item list on the left, per DESIGN-SYSTEM section 6's "lists, not
 * cards, for anything staff scan". Selecting an item shows its variants as
 * tabs; the recipe editor on the right always edits exactly one
 * (menuItemId, variantId) pair, matching how the API itself is shaped.
 */
export default function RecipeEditorPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null); // { item, variantId }
  const [toast, setToast] = useState(null);

  const itemsQuery = useQuery({
    queryKey: ['menu-items', { search }],
    queryFn: () => listMenuItems({ search: search || undefined, limit: 200 }),
  });

  const ingredientsQuery = useQuery({
    queryKey: ['ingredients', { forRecipeEditor: true }],
    queryFn: () => listIngredients({ limit: 200 }),
  });

  const items = itemsQuery.data?.data ?? [];
  const ingredients = ingredientsQuery.data?.data ?? [];

  const variantTabs = useMemo(() => {
    if (!selected) return [];
    return [
      { variantId: null, label: 'Item level' },
      ...selected.item.variants.map((variant) => ({ variantId: variant.id, label: variant.name })),
    ];
  }, [selected]);

  return (
    <main className="min-h-full bg-paper">
      <header className="sticky top-0 z-10 border-b-2 border-ink bg-paper px-4 py-3">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold leading-7">Recipes</h1>
          <Link
            to="/inventory"
            className="flex h-11 items-center rounded-[10px] px-3 text-[13px] font-medium text-steel hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            Stock
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[280px_1fr]">
        <div>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search dishes"
            className="mb-3 h-11 w-full rounded-[10px] border-2 border-steel/40 bg-paper px-3 text-[15px] placeholder:text-steel focus:border-ink focus:outline-none"
          />
          {itemsQuery.isPending && <p className="text-[13px] text-steel">Loading…</p>}
          <ul className="divide-y divide-steel/15 border-y-2 border-ink/10">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelected({ item, variantId: null })}
                  className={[
                    'flex min-h-[48px] w-full items-center px-2 text-left text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                    selected?.item.id === item.id ? 'bg-chana/15 font-semibold' : '',
                  ].join(' ')}
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          {!selected && (
            <p className="rounded-[10px] border-2 border-dashed border-steel/40 px-4 py-8 text-center text-[15px] text-steel">
              Pick a dish on the left to see or edit its recipe.
            </p>
          )}

          {selected && (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {variantTabs.map((tab) => (
                  <button
                    key={tab.variantId ?? 'item'}
                    type="button"
                    onClick={() => setSelected({ item: selected.item, variantId: tab.variantId })}
                    className={[
                      'min-h-[40px] rounded-full border-2 px-3 text-[13px] font-medium',
                      selected.variantId === tab.variantId
                        ? 'border-ink bg-chana/20'
                        : 'border-steel/40 text-steel',
                    ].join(' ')}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <RecipeLineEditor
                key={`${selected.item.id}:${selected.variantId ?? 'item'}`}
                menuItemId={selected.item.id}
                variantId={selected.variantId}
                ingredients={ingredients}
                onSaved={() => {
                  queryClient.invalidateQueries({ queryKey: ['recipes'] });
                  setToast({ tone: 'success', message: 'Recipe saved.' });
                }}
                onDeleted={() => {
                  queryClient.invalidateQueries({ queryKey: ['recipes'] });
                  setToast({ tone: 'success', message: 'Recipe removed.' });
                }}
                onError={(message) => setToast({ tone: 'error', message })}
              />
            </>
          )}
        </div>
      </div>

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}
