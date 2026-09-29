import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import StatusBadge from '../../components/ui/StatusBadge.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { listIngredients } from '../../api/inventory.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { baseToPurchaseDisplay, BASE_UNIT_SHORT_LABELS } from '../../utils/units.js';
import { ROLES } from '../users/roles.js';
import AdjustStockPanel from './AdjustStockPanel.jsx';
import { errorMessage } from './errorCopy.js';
import NewIngredientPanel from './NewIngredientPanel.jsx';

/** IN_STOCK/LOW/OUT, one shared badge component with M3's bill status. */
const STOCK_FACES = {
  IN_STOCK: { icon: '✓', label: 'IN STOCK', classes: 'border-patta bg-patta-tint text-ink' },
  LOW: { icon: '!', label: 'LOW', classes: 'border-chana bg-chana/15 text-ink' },
  OUT: { icon: '✕', label: 'OUT', classes: 'border-mirch text-mirch' },
};

const CAN_WRITE = [ROLES.OWNER, ROLES.MANAGER, ROLES.STOREKEEPER];

/**
 * The stock list. A storekeeper's home screen: what is running low, and one
 * tap into recording what just happened to it.
 *
 * Rows are a dense list, per DESIGN-SYSTEM section 6 -- staff scan a list
 * faster than cards -- and tapping a row goes straight into the adjustment
 * panel. There is no separate menu between seeing an ingredient and acting on
 * it, because the adjustment screen is the one this whole screen exists to
 * lead into.
 */
export default function StockListPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [adjusting, setAdjusting] = useState(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState(null);

  const canWrite = CAN_WRITE.includes(user?.role);

  const query = useQuery({
    queryKey: ['ingredients', { search, lowStockOnly }],
    queryFn: () => listIngredients({ search: search || undefined, lowStockOnly }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ingredients'] });

  const ingredients = query.data?.data ?? [];

  return (
    <main className="min-h-full bg-paper">
      <header className="sticky top-0 z-10 border-b-2 border-ink bg-paper px-4 py-3">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold leading-7">Stock</h1>
            <p className="text-[13px] leading-[18px] text-steel">
              <span className="font-mono">{ingredients.length}</span> ingredient
              {ingredients.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canWrite && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex h-11 items-center rounded-[10px] border-2 border-ink bg-chana px-4 text-[14px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                + Ingredient
              </button>
            )}
            <Link
              to="/inventory/recipes"
              className="flex h-11 items-center rounded-[10px] px-3 text-[13px] font-medium text-steel hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
            >
              Recipes
            </Link>
            <Link
              to="/dashboard"
              className="flex h-11 items-center rounded-[10px] px-3 text-[13px] font-medium text-steel hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-3 flex max-w-2xl items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search ingredients"
            className="h-11 flex-1 rounded-[10px] border-2 border-steel/40 bg-paper px-3 text-[15px] placeholder:text-steel focus:border-ink focus:outline-none"
          />
          <label className="flex h-11 items-center gap-2 whitespace-nowrap text-[13px]">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(event) => setLowStockOnly(event.target.checked)}
              className="size-4 accent-[var(--color-ink)]"
            />
            Low stock only
          </label>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-4">
        {query.isPending && <p className="text-[15px] text-steel">Loading stock…</p>}
        {query.isError && <p className="text-[15px] text-mirch">{errorMessage(query.error)}</p>}

        {query.isSuccess && ingredients.length === 0 && (
          <p className="rounded-[10px] border-2 border-dashed border-steel/40 px-4 py-8 text-center text-[15px] text-steel">
            {lowStockOnly ? 'Nothing is running low.' : 'No ingredients yet.'}
          </p>
        )}

        <ul className="divide-y divide-steel/15 border-y-2 border-ink/10">
          {ingredients.map((ingredient) => (
            <li key={ingredient.id}>
              <button
                type="button"
                onClick={() => canWrite && setAdjusting(ingredient)}
                disabled={!canWrite}
                className="flex min-h-[64px] w-full items-center justify-between gap-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default"
              >
                <div>
                  <p className="text-[15px] leading-[22px]">
                    {ingredient.name}
                    {ingredient.isActive === false && (
                      <span className="ml-2 text-[12px] text-steel">(off)</span>
                    )}
                  </p>
                  <p className="font-mono text-[12px] leading-4 text-steel">
                    {ingredient.purchaseUnitName
                      ? `${baseToPurchaseDisplay(ingredient.currentQtyInBase, ingredient.unitsPerBase)} ${ingredient.purchaseUnitName}`
                      : `${ingredient.currentQtyInBase} ${BASE_UNIT_SHORT_LABELS[ingredient.baseUnit]}`}
                  </p>
                </div>
                <StatusBadge state={ingredient.stockState} faces={STOCK_FACES} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {creating && (
        <NewIngredientPanel
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            invalidate();
            setToast({ tone: 'success', message: 'Ingredient added.' });
          }}
        />
      )}

      {adjusting && (
        <AdjustStockPanel
          ingredient={adjusting}
          onCancel={() => setAdjusting(null)}
          onAdjusted={() => {
            setAdjusting(null);
            invalidate();
            setToast({ tone: 'success', message: 'Stock updated.' });
          }}
        />
      )}

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}
