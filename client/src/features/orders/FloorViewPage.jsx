import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import Toast from '../../components/ui/Toast.jsx';
import { createOrder, listTables } from '../../api/orders.js';
import { formatPaise } from '../../utils/formatMoney.js';
import { errorMessage, occupiedByOrderId } from './errorCopy.js';

/**
 * The floor. The screen a waiter looks at most, so it is the one that has to be
 * readable at arm's length across a room.
 *
 * Tables are grouped by section and drawn as tap tiles rather than list rows.
 * DESIGN-SYSTEM.md section 6 says lists for anything staff scan and cards for
 * tap targets: this is the second case. A waiter is not reading the floor, they
 * are hitting one table.
 *
 * Occupancy is not stored anywhere. Every tile's state comes from the server
 * working out whether an order is open on that table, so a tile cannot be stuck
 * occupied with nothing on it.
 */
export default function FloorViewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState(null);

  const tables = useQuery({
    queryKey: ['tables', { includeInactive: false }],
    queryFn: () => listTables(),
    // A table is taken and freed by other people all through a service.
    refetchInterval: 15_000,
  });

  const open = useMutation({
    mutationFn: (tableId) => createOrder({ orderType: 'DINE_IN', tableId }),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      navigate(`/orders/${order.id}`);
    },
    onError: (error) => {
      /**
       * Another waiter got there first. The server sends the id of the order
       * that won, so the right thing is to open that order rather than show an
       * error and leave this waiter with nowhere to go.
       */
      const existingOrderId = occupiedByOrderId(error);
      if (existingOrderId) {
        queryClient.invalidateQueries({ queryKey: ['tables'] });
        navigate(`/orders/${existingOrderId}`);
        return;
      }
      setToast({ tone: 'error', message: errorMessage(error) });
    },
  });

  /** Grouped by section, with unsectioned tables last under a plain heading. */
  const sections = useMemo(() => {
    const rows = tables.data ?? [];
    const bySection = new Map();

    for (const table of rows) {
      const key = table.section ?? '';
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key).push(table);
    }

    return [...bySection.entries()]
      .sort(([a], [b]) => {
        if (a === '') return 1;
        if (b === '') return -1;
        return a.localeCompare(b);
      })
      .map(([name, entries]) => ({ name: name || 'Unassigned', tables: entries }));
  }, [tables.data]);

  const occupiedCount = (tables.data ?? []).filter((table) => table.occupancy.isOccupied).length;

  return (
    <main className="min-h-full bg-paper">
      <header className="sticky top-0 z-10 border-b-2 border-ink bg-paper px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold leading-7">Floor</h1>
            <p className="text-[13px] leading-[18px] text-steel">
              <span className="font-mono">{occupiedCount}</span> of{' '}
              <span className="font-mono">{tables.data?.length ?? 0}</span> tables seated
            </p>
          </div>

          <nav className="flex items-center gap-2">
            <Link
              to="/orders/takeaway"
              className="flex h-12 items-center rounded-[10px] border-2 border-ink px-4 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Takeaway
            </Link>
            <Link
              to="/kitchen"
              className="flex h-12 items-center rounded-[10px] px-3 text-[13px] font-medium text-steel hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
            >
              Kitchen
            </Link>
            <Link
              to="/dashboard"
              className="flex h-12 items-center rounded-[10px] px-3 text-[13px] font-medium text-steel hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {tables.isPending && <p className="text-[15px] text-steel">Loading the floor…</p>}

        {tables.isError && (
          <p className="text-[15px] text-mirch">{errorMessage(tables.error)}</p>
        )}

        {tables.isSuccess && sections.length === 0 && (
          <div className="rounded-[10px] border-2 border-dashed border-steel/50 px-6 py-12 text-center">
            <p className="text-[15px] leading-[22px]">No tables have been set up yet.</p>
            <p className="mt-1 text-[13px] leading-[18px] text-steel">
              An owner or manager adds them on the Tables screen.
            </p>
            <Link
              to="/tables"
              className="mt-4 inline-flex h-12 items-center rounded-[10px] bg-chana px-5 text-[15px] font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Set up tables
            </Link>
          </div>
        )}

        {sections.map((section) => (
          <section key={section.name} className="mb-8">
            <h2 className="mb-3 text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
              {section.name}
            </h2>

            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {section.tables.map((table) => (
                <li key={table.id}>
                  <TableTile
                    table={table}
                    isBusy={open.isPending && open.variables === table.id}
                    onOpen={() => {
                      if (table.occupancy.isOccupied) {
                        navigate(`/orders/${table.occupancy.orderId}`);
                        return;
                      }
                      open.mutate(table.id);
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Toast
        tone={toast?.tone}
        message={toast?.message}
        onDismiss={() => setToast(null)}
      />
    </main>
  );
}

/**
 * One table.
 *
 * The whole tile is the tap target, not a small button inside it, and it is
 * well over the 48px minimum from DESIGN-SYSTEM.md section 7.
 *
 * A seated table is marked by a thicker ink border and the order number, never
 * by colour alone. `chana`, `mirch` and `patta` are functional colour and
 * "this table has people at it" is not one of those three meanings.
 */
function TableTile({ table, isBusy, onOpen }) {
  const { occupancy } = table;
  const isOccupied = occupancy.isOccupied;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={isBusy}
      aria-label={
        isOccupied
          ? `Table ${table.name}, order ${occupancy.orderNumber}, open it`
          : `Table ${table.name}, free, start an order`
      }
      className={[
        'flex min-h-[104px] w-full flex-col justify-between rounded-[10px] border-2 bg-paper p-3 text-left',
        'transition-transform active:translate-y-0.5',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        'disabled:opacity-60',
        isOccupied ? 'border-ink shadow-[0_2px_0_0_var(--color-ink)]' : 'border-steel/40',
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold leading-5">{table.name}</span>
        {table.seats != null && (
          <span className="font-mono text-[12px] leading-4 text-steel">{table.seats} seats</span>
        )}
      </div>

      {isOccupied ? (
        <div>
          <p className="font-mono text-[12px] leading-4 text-steel">#{occupancy.orderNumber}</p>
          <p className="font-mono text-[18px] font-semibold leading-6">
            {formatPaise(occupancy.runningTotalInPaise)}
          </p>
        </div>
      ) : (
        <p className="text-[13px] leading-[18px] text-steel">Free — tap to start</p>
      )}
    </button>
  );
}
