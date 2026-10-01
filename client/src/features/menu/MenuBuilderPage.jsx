import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import * as menuApi from '../../api/menu.js';
import { listStations } from '../../api/stations.js';
import Button from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Toast from '../../components/ui/Toast.jsx';
import CategoryRail from './CategoryRail.jsx';
import ItemEditorPanel from './ItemEditorPanel.jsx';
import MenuItemRow from './MenuItemRow.jsx';
import { errorMessage, shouldRefetch } from './errorCopy.js';

/**
 * The menu builder. OWNER and MANAGER.
 *
 * Reads categories and menu-items directly rather than GET /menu, because the
 * contract is explicit that inactive categories and inactive items never
 * appear on that endpoint under any query, and this screen exists to switch
 * them back on. GET /menu is the availability board's read.
 */
export default function MenuBuilderPage() {
  const queryClient = useQueryClient();

  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [editorState, setEditorState] = useState(null);
  const [toast, setToast] = useState(null);

  const categoriesQuery = useQuery({
    queryKey: ['categories', { includeInactive: true }],
    queryFn: () => menuApi.listCategories({ includeInactive: true }),
  });

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const activeCategoryId = selectedCategoryId ?? categories[0]?.id ?? null;
  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? null;

  const itemsQuery = useQuery({
    queryKey: ['menu-items', { categoryId: activeCategoryId, includeInactive: true }],
    queryFn: () =>
      menuApi.listMenuItems({ categoryId: activeCategoryId, includeInactive: true, limit: 200 }),
    enabled: Boolean(activeCategoryId),
  });

  const items = itemsQuery.data?.data ?? [];

  function refreshAll() {
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['menu-items'] });
    queryClient.invalidateQueries({ queryKey: ['menu'] });
  }

  /** Every mutation lands here, so the failure copy is written once. */
  function handleFailure(error, context) {
    setToast({ tone: 'error', message: errorMessage(error, context) });
    if (shouldRefetch(error)) refreshAll();
  }

  const createCategory = useMutation({
    mutationFn: (name) => menuApi.createCategory({ name }),
    onSuccess: (category) => {
      refreshAll();
      setSelectedCategoryId(category.id);
      setToast({ tone: 'success', message: 'Category added.' });
    },
    onError: (error, name) => handleFailure(error, { name }),
  });

  const renameCategory = useMutation({
    mutationFn: ({ id, name }) => menuApi.updateCategory(id, { name }),
    onSuccess: () => {
      refreshAll();
      setToast({ tone: 'success', message: 'Category renamed.' });
    },
    onError: (error, { name }) => handleFailure(error, { name }),
  });

  // P05. Stations, for the category's station picker.
  const stations = useQuery({ queryKey: ['stations'], queryFn: () => listStations() });

  const setCategoryStation = useMutation({
    mutationFn: ({ id, stationId }) => menuApi.updateCategory(id, { stationId }),
    onSuccess: () => {
      refreshAll();
      setToast({ tone: 'success', message: 'Station changed. New orders go there from now on.' });
    },
    onError: (error) => handleFailure(error, {}),
  });

  const toggleCategoryActive = useMutation({
    mutationFn: (category) => menuApi.setCategoryActive(category.id, !category.isActive),
    onSuccess: (category) => {
      refreshAll();
      setToast({
        tone: 'success',
        message: category.isActive
          ? `${category.name} is back on the menu.`
          : `${category.name} is turned off. Its items are untouched.`,
      });
    },
    onError: handleFailure,
  });

  const saveItem = useMutation({
    mutationFn: (body) =>
      editorState?.item
        ? menuApi.updateMenuItem(editorState.item.id, body)
        : menuApi.createMenuItem(body),
    onSuccess: () => {
      refreshAll();
      setEditorState(null);
      setToast({ tone: 'success', message: 'Item saved.' });
    },
    onError: (error, body) => handleFailure(error, { name: body.name }),
  });

  const toggleItemActive = useMutation({
    mutationFn: (item) => menuApi.setMenuItemActive(item.id, !item.isActive),
    onSuccess: (item) => {
      refreshAll();
      setEditorState(null);
      setToast({
        tone: 'success',
        message: item.isActive ? 'Back on the menu.' : 'Taken off the menu. Nothing was deleted.',
      });
    },
    onError: handleFailure,
  });

  const toggleAvailability = useMutation({
    mutationFn: (item) =>
      menuApi.setAvailability(item.id, { isAvailable: !item.isAvailable, variantId: null }),
    onSuccess: refreshAll,
    onError: handleFailure,
  });

  const isBusy =
    createCategory.isPending ||
    renameCategory.isPending ||
    toggleCategoryActive.isPending ||
    toggleItemActive.isPending;

  return (
    <main className="flex min-h-full flex-col bg-paper">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-5 py-4 sm:px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold text-ink">Menu</h1>
          <span className="font-mono text-xs text-steel">
            {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/menu/availability"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-steel/50 px-4 text-[13px] font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Availability board
          </Link>
          <Button
            onClick={() => setEditorState({ item: null })}
            disabled={!activeCategoryId || categoriesQuery.isLoading}
          >
            Add item
          </Button>
        </div>
      </header>

      {categoriesQuery.isLoading && (
        <div className="p-8">
          <Spinner label="Loading the menu" />
        </div>
      )}

      {categoriesQuery.isError && (
        <div className="p-8">
          <ErrorMessage
            error={{ message: errorMessage(categoriesQuery.error) }}
            onRetry={() => categoriesQuery.refetch()}
          />
        </div>
      )}

      {!categoriesQuery.isLoading && !categoriesQuery.isError && (
        <div className="flex flex-1 flex-col md:flex-row md:overflow-hidden">
          <CategoryRail
            categories={categories}
            selectedId={activeCategoryId}
            isBusy={isBusy}
            onSelect={setSelectedCategoryId}
            onCreate={(name) => createCategory.mutate(name)}
            onRename={(id, name) => renameCategory.mutate({ id, name })}
            onToggleActive={(category) => toggleCategoryActive.mutate(category)}
            stations={stations.data ?? []}
            onStationChange={(id, stationId) => setCategoryStation.mutate({ id, stationId })}
          />

          <section className="flex-1 overflow-y-auto p-5 sm:px-7">
            {categories.length === 0 ? (
              <EmptyState
                title="Nothing on the menu yet"
                description="Add a category first, then put items inside it. Nothing is visible to a waiter until it exists."
              />
            ) : (
              <>
                <div className="flex items-center justify-between pb-1">
                  <h2 className="text-xs font-medium tracking-[0.06em] text-steel">
                    {activeCategory?.name?.toUpperCase()}
                  </h2>
                  {activeCategory && !activeCategory.isActive && (
                    <span className="font-mono text-xs text-mirch">TURNED OFF</span>
                  )}
                </div>

                {itemsQuery.isLoading && <Spinner label="Loading items" />}

                {itemsQuery.isError && (
                  <ErrorMessage
                    error={{ message: errorMessage(itemsQuery.error) }}
                    onRetry={() => itemsQuery.refetch()}
                  />
                )}

                {!itemsQuery.isLoading && !itemsQuery.isError && items.length === 0 && (
                  <EmptyState
                    title={`No items in ${activeCategory?.name ?? 'this category'}`}
                    description="This category is on the menu but has nothing in it, so it will not appear on the ordering screen."
                    action={
                      <Button onClick={() => setEditorState({ item: null })}>Add item</Button>
                    }
                  />
                )}

                {items.map((item) => (
                  <MenuItemRow
                    key={item.id}
                    item={item}
                    isBusy={toggleAvailability.isPending}
                    onEdit={(target) => setEditorState({ item: target })}
                    onToggleAvailability={(target) => toggleAvailability.mutate(target)}
                  />
                ))}

                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditorState({ item: null })}
                    className="min-h-[44px] py-4 text-[13px] font-medium text-steel underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    +&nbsp;&nbsp;Add item
                  </button>
                )}
              </>
            )}
          </section>

          {editorState && (
            <ItemEditorPanel
              key={editorState.item?.id ?? "new"}
              item={editorState.item}
              categories={categories}
              categoryId={activeCategoryId}
              isSaving={saveItem.isPending}
              saveError={saveItem.isError ? errorMessage(saveItem.error) : null}
              onSave={(body) => saveItem.mutate(body)}
              onToggleActive={(item) => toggleItemActive.mutate(item)}
              onClose={() => {
                saveItem.reset();
                setEditorState(null);
              }}
            />
          )}
        </div>
      )}

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}
