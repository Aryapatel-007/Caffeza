import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import Button from '../../components/ui/Button.jsx';
import { deleteRecipe, listRecipes, putRecipe } from '../../api/inventory.js';
import { BASE_UNIT_SHORT_LABELS } from '../../utils/units.js';
import { errorMessage } from './errorCopy.js';

/**
 * The ingredient rows for exactly one (menuItemId, variantId) recipe.
 *
 * Built in a `useState` initialiser and keyed by the caller on
 * `${menuItemId}:${variantId}`, the same fix `ItemEditorPanel.jsx` in M1
 * settled on: populating rows in an effect left the fields empty for a frame
 * every time the selection changed, and keying on the selection remounts the
 * whole thing on a different item instead.
 */
export default function RecipeLineEditor({ menuItemId, variantId, ingredients, onSaved, onDeleted, onError }) {
  const recipesQuery = useQuery({
    queryKey: ['recipes', { menuItemId }],
    queryFn: () => listRecipes({ menuItemId }),
  });

  const existing = (recipesQuery.data?.data ?? []).find(
    (recipe) => (recipe.variantId ?? null) === (variantId ?? null),
  );

  const [rows, setRows] = useState(() => existing?.items ?? []);
  const [addingIngredientId, setAddingIngredientId] = useState('');
  const [addingQty, setAddingQty] = useState('');

  // Once the query resolves (it starts empty), sync the initial rows exactly
  // once for this selection. Guarded by hasSynced so a later refetch after
  // saving does not stomp on in-progress edits.
  const [hasSynced, setHasSynced] = useState(false);
  useEffect(() => {
    if (hasSynced || !recipesQuery.isSuccess) return;
    setRows(existing?.items ?? []);
    setHasSynced(true);
  }, [recipesQuery.isSuccess, hasSynced, existing]);

  const saveMutation = useMutation({
    mutationFn: () =>
      putRecipe({
        menuItemId,
        variantId,
        items: rows.map((row) => ({ ingredientId: row.ingredientId, qtyInBase: row.qtyInBase })),
      }),
    onSuccess: onSaved,
    onError: (error) => onError(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteRecipe(existing.id),
    onSuccess: () => {
      setRows([]);
      onDeleted();
    },
    onError: (error) => onError(errorMessage(error)),
  });

  const nameFor = (ingredientId) =>
    ingredients.find((i) => i.id === ingredientId)?.name ??
    rows.find((r) => r.ingredientId === ingredientId)?.ingredientName ??
    'Unknown ingredient';

  const unitFor = (ingredientId) => {
    const base =
      ingredients.find((i) => i.id === ingredientId)?.baseUnit ??
      rows.find((r) => r.ingredientId === ingredientId)?.baseUnit;
    return BASE_UNIT_SHORT_LABELS[base] ?? '';
  };

  const availableToAdd = ingredients.filter(
    (ingredient) => !rows.some((row) => row.ingredientId === ingredient.id),
  );

  if (recipesQuery.isPending) return <p className="type-caption text-muted">Loading recipe…</p>;

  return (
    <div>
      {rows.length === 0 && (
        <p className="mb-4 type-label text-muted">
          No recipe yet. Dishes selling with no recipe attached show on{' '}
          <span className="font-mono">GET /inventory/unmapped</span>, so this is worth setting up.
        </p>
      )}

      <ul className="mb-4 divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <li key={row.ingredientId} className="flex items-center justify-between gap-3 py-2">
            <span className="type-label">{nameFor(row.ingredientId)}</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                step="1"
                value={row.qtyInBase}
                onChange={(event) => {
                  const value = Math.max(1, Math.round(Number(event.target.value) || 1));
                  setRows((current) =>
                    current.map((r) => (r.ingredientId === row.ingredientId ? { ...r, qtyInBase: value } : r)),
                  );
                }}
                className="h-9 w-24 rounded-lg border-2 border-muted px-2 text-right type-num"
              />
              <span className="w-6 type-num-meta text-muted">{unitFor(row.ingredientId)}</span>
              <button
                type="button"
                onClick={() =>
                  setRows((current) => current.filter((r) => r.ingredientId !== row.ingredientId))
                }
                aria-label={`Remove ${nameFor(row.ingredientId)}`}
                className="flex size-9 items-center justify-center rounded-lg text-alert hover:bg-alert "
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mb-6 flex items-center gap-2">
        <select
          value={addingIngredientId}
          onChange={(event) => setAddingIngredientId(event.target.value)}
          className="min-h-12 flex-1 rounded-lg border border-muted bg-surface px-2 type-label"
        >
          <option value="">Add an ingredient…</option>
          {availableToAdd.map((ingredient) => (
            <option key={ingredient.id} value={ingredient.id}>
              {ingredient.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min="1"
          step="1"
          value={addingQty}
          onChange={(event) => setAddingQty(event.target.value)}
          placeholder="qty"
          className="min-h-12 w-20 rounded-lg border-2 border-muted px-2 text-right type-num"
        />
        <Button
          type="button"
          size="sm"
          disabled={!addingIngredientId || !addingQty || Number(addingQty) <= 0}
          onClick={() => {
            const ingredient = ingredients.find((i) => i.id === addingIngredientId);
            setRows((current) => [
              ...current,
              {
                ingredientId: addingIngredientId,
                ingredientName: ingredient?.name,
                baseUnit: ingredient?.baseUnit,
                qtyInBase: Math.round(Number(addingQty)),
              },
            ]);
            setAddingIngredientId('');
            setAddingQty('');
          }}
        >
          Add
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          isLoading={saveMutation.isPending}
          disabled={rows.length === 0}
          onClick={() => saveMutation.mutate()}
        >
          Save recipe
        </Button>
        {existing && (
          <Button
            type="button"
            variant="danger"
            isLoading={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            Delete recipe
          </Button>
        )}
      </div>
    </div>
  );
}
