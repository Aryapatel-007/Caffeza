import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import StateChip from '../../components/ui/StateChip.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { listIngredients } from '../../api/inventory.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { baseToPurchaseDisplay, BASE_UNIT_SHORT_LABELS } from '../../utils/units.js';
import { ROLES } from '../users/roles.js';
import AdjustStockPanel from './AdjustStockPanel.jsx';
import { errorMessage } from './errorCopy.js';
import NewIngredientPanel from './NewIngredientPanel.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

/** IN_STOCK/LOW/OUT, one shared badge component with M3's bill status. */
const STOCK_FACES = {
  IN_STOCK: { state: 'ok', word: 'In stock' },
  LOW: { state: 'open', word: 'Low' },
  OUT: { state: 'alert', word: 'Out' },
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
    <main className="min-h-full bg-ground">
      <header className="sticky top-0 z-10 border-b border-line bg-ground px-4 py-3">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="type-heading">Stock</h1>
            <p className="type-caption text-muted">
              <span className="font-mono">{ingredients.length}</span> ingredient
              {ingredients.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canWrite && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex min-h-12 items-center rounded-lg bg-accent px-4 type-label text-on-accent"
              >
                + Ingredient
              </button>
            )}
            <Link
              to="/inventory/recipes"
              className="flex min-h-12 items-center rounded-lg px-3 type-caption text-muted hover:bg-sunken "
            >
              Recipes
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-3 flex max-w-2xl items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search ingredients"
            className="min-h-12 flex-1 rounded-lg border border-muted bg-surface px-3 type-body placeholder:text-muted"
          />
          <label className="flex min-h-12 items-center gap-2 whitespace-nowrap type-caption">
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
        {query.isPending && <Spinner label="Loading stock" />}
        {query.isError && <p className="type-body text-alert">{errorMessage(query.error)}</p>}

        {query.isSuccess && ingredients.length === 0 && (
          <EmptyState
            title={lowStockOnly ? 'Nothing is running low' : 'No ingredients yet'}
            description={lowStockOnly ? 'Show every ingredient to see the full stock.' : 'Add the first ingredient to start counting stock.'}
          />
        )}

        <ul className="divide-y divide-line border-y border-line">
          {ingredients.map((ingredient) => (
            <li key={ingredient.id}>
              <button
                type="button"
                onClick={() => canWrite && setAdjusting(ingredient)}
                disabled={!canWrite}
                className="flex min-h-[64px] w-full items-center justify-between gap-3 py-3 text-left disabled:cursor-default"
              >
                <div>
                  <p className="type-body">
                    {ingredient.name}
                    {ingredient.isActive === false && (
                      <span className="ml-2 type-caption text-muted">(off)</span>
                    )}
                  </p>
                  <p className="font-mono type-caption text-muted">
                    {ingredient.purchaseUnitName
                      ? `${baseToPurchaseDisplay(ingredient.currentQtyInBase, ingredient.unitsPerBase)} ${ingredient.purchaseUnitName}`
                      : `${ingredient.currentQtyInBase} ${BASE_UNIT_SHORT_LABELS[ingredient.baseUnit]}`}
                  </p>
                </div>
                <StateChip {...(STOCK_FACES[ingredient.stockState] ?? STOCK_FACES.IN_STOCK)} size="sm" />
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
