import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import * as menuApi from '../../api/menu.js';
import AvailabilityStamp from '../../components/ui/AvailabilityStamp.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatPaise } from '../../utils/formatMoney.js';
import { errorMessage } from './errorCopy.js';

const MENU_KEY = ['menu', { includeUnavailable: true }];
const STAFF_ADMIN = new Set(['OWNER', 'MANAGER']);

/**
 * The availability board. All six roles.
 *
 * The one M1 write a cashier, waiter, cook or storekeeper may make. A kitchen
 * that runs out of paneer at 8pm cannot wait for the owner to unlock a phone.
 *
 * The toggle is optimistic: the tile flips immediately, the request goes in the
 * background, and a failure puts the tile back and says so. Someone standing at
 * a counter cannot wait for a round trip before the tile responds, which is the
 * whole reason this screen exists separately from the builder.
 */
export default function AvailabilityBoardPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [toast, setToast] = useState(null);

  const menuQuery = useQuery({
    queryKey: MENU_KEY,
    // includeUnavailable, or an item could never be switched back on from here.
    queryFn: () => menuApi.getMenuTree({ includeUnavailable: true }),
    // Two tablets open at once do not see each other live in v1. Refetching on
    // focus is what keeps them from drifting far apart. See Known Problems.
    refetchOnWindowFocus: true,
  });

  const setAvailability = useMutation({
    mutationFn: ({ item, variant, next }) =>
      menuApi.setAvailability(item.id, { isAvailable: next, variantId: variant?.id ?? null }),

    // Flip it now. The tile has to respond to the finger, not to the network.
    onMutate: async ({ item, variant, next }) => {
      await queryClient.cancelQueries({ queryKey: MENU_KEY });
      const previous = queryClient.getQueryData(MENU_KEY);

      queryClient.setQueryData(MENU_KEY, (tree) =>
        (tree ?? []).map((category) => ({
          ...category,
          items: category.items.map((candidate) => {
            if (candidate.id !== item.id) return candidate;
            if (!variant) return { ...candidate, isAvailable: next };
            return {
              ...candidate,
              variants: candidate.variants.map((v) =>
                v.id === variant.id ? { ...v, isAvailable: next } : v,
              ),
            };
          }),
        })),
      );

      return { previous };
    },

    // Put it back exactly as it was and say so in plain language.
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(MENU_KEY, context.previous);
      setToast({ tone: 'error', message: errorMessage(error) });
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: MENU_KEY }),
  });

  const tree = menuQuery.data ?? [];

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tree
      .filter((category) => !categoryFilter || category.id === categoryFilter)
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => !needle || item.name.toLowerCase().includes(needle)),
      }))
      .filter((category) => category.items.length > 0);
  }, [tree, search, categoryFilter]);

  const totalShown = visible.reduce((sum, category) => sum + category.items.length, 0);
  const chipBase =
    'min-h-[44px] rounded-full px-4 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
  const chipOn = 'border-2 border-ink bg-patta-tint text-ink';
  const chipOff = 'border border-steel/50 text-steel';

  return (
    <main className="flex min-h-full flex-col bg-paper">
      <header className="sticky top-0 z-10 flex flex-col gap-3 border-b-2 border-ink bg-paper px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-ink">Availability</h1>
          <div className="flex items-center gap-3">
            <span className="hidden text-[13px] text-steel sm:inline">Tap a tile to change it</span>
            {STAFF_ADMIN.has(user?.role) && (
              <Link
                to="/menu"
                className="inline-flex min-h-[44px] items-center rounded-lg border border-steel/50 px-4 text-[13px] font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                Edit menu
              </Link>
            )}
          </div>
        </div>

        <Input
          label="Search"
          type="search"
          placeholder="Search the menu"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter('')}
            className={`${chipBase} ${categoryFilter === '' ? chipOn : chipOff}`}
          >
            All
          </button>
          {tree.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryFilter(category.id)}
              className={`${chipBase} ${categoryFilter === category.id ? chipOn : chipOff}`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-5">
        {menuQuery.isLoading && <Spinner label="Loading the menu" />}

        {menuQuery.isError && (
          <ErrorMessage
            error={{ message: errorMessage(menuQuery.error) }}
            onRetry={() => menuQuery.refetch()}
          />
        )}

        {!menuQuery.isLoading && !menuQuery.isError && totalShown === 0 && (
          <EmptyState
            title={search || categoryFilter ? 'Nothing matches' : 'Nothing on the menu yet'}
            description={
              search || categoryFilter
                ? 'No dishes match what you typed. Try clearing the search or the filter.'
                : 'Once an owner or manager adds items, they show up here to switch on and off.'
            }
          />
        )}

        {visible.map((category) => (
          <section key={category.id} className="flex flex-col gap-3">
            <h2 className="text-xs font-medium tracking-[0.06em] text-steel">
              {category.name.toUpperCase()}
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {category.items.map((item) => (
                <article
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border-2 border-ink bg-paper p-4"
                >
                  <h3 className="text-[15px] leading-[22px] text-ink">{item.name}</h3>

                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-lg font-semibold tabular-nums text-ink">
                      {formatPaise(item.priceInPaise, { symbol: false })}
                    </span>
                    <AvailabilityStamp
                      size="md"
                      state={item.isAvailable ? 'available' : 'out_of_stock'}
                      onToggle={() =>
                        setAvailability.mutate({ item, variant: null, next: !item.isAvailable })
                      }
                    />
                  </div>

                  {item.variants?.length > 0 && (
                    <div className="flex flex-col gap-2 border-t border-steel/25 pt-3">
                      {item.variants.map((variant) => (
                        <div key={variant.id} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-ink">
                            {variant.name}
                            <span className="ml-2 font-mono text-xs text-steel">
                              {formatPaise(variant.priceInPaise, { symbol: false })}
                            </span>
                          </span>
                          <AvailabilityStamp
                            size="sm"
                            state={variant.isAvailable ? 'available' : 'out_of_stock'}
                            onToggle={() =>
                              setAvailability.mutate({ item, variant, next: !variant.isAvailable })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}
