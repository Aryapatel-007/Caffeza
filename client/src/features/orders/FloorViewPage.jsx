import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import Toast from '../../components/ui/Toast.jsx';
import { createOrder, listTables } from '../../api/orders.js';
import { formatPaise } from '../../utils/formatMoney.js';
import { formatDateIst, formatTimeIst } from '../../utils/formatDate.js';
import { errorMessage, occupiedByOrderId } from './errorCopy.js';
import SeatTablePanel from './SeatTablePanel.jsx';

const ALL = '__all__';
const UNASSIGNED = 'Unassigned';

/**
 * The floor. The screen a waiter looks at most, so it is the one that has to be
 * readable at arm's length across a room.
 *
 * Tables are cards, filtered by section with the pills along the top. A free
 * table asks for the guest count before the order opens, because covers are
 * frozen onto the bill from the order and every per-cover figure reads them.
 *
 * Occupancy is not stored anywhere. Every card's state comes from the server
 * working out whether an order is open on that table, so a card cannot be stuck
 * occupied with nothing on it.
 */
export default function FloorViewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState(null);
  const [section, setSection] = useState(ALL);
  const [seating, setSeating] = useState(null);
  const now = useNow(30_000);

  const tables = useQuery({
    queryKey: ['tables', { includeInactive: false }],
    queryFn: () => listTables(),
    // A table is taken and freed by other people all through a service.
    refetchInterval: 15_000,
  });

  const open = useMutation({
    mutationFn: ({ tableId, guestCount }) =>
      createOrder({ orderType: 'DINE_IN', tableId, guestCount }),
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
      setSeating(null);
      setToast({ tone: 'error', message: errorMessage(error) });
    },
  });

  const rows = tables.data ?? [];

  /** Section names in order, with unsectioned tables last. */
  const sections = useMemo(() => {
    const counts = new Map();
    for (const table of rows) {
      const name = table.section || UNASSIGNED;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => {
      if (a === UNASSIGNED) return 1;
      if (b === UNASSIGNED) return -1;
      return a.localeCompare(b);
    });
  }, [rows]);

  const visible =
    section === ALL ? rows : rows.filter((table) => (table.section || UNASSIGNED) === section);

  const seated = rows.filter((table) => table.occupancy.isOccupied);
  const openTotal = seated.reduce((sum, table) => sum + table.occupancy.runningTotalInPaise, 0);

  const openTable = (table) => {
    if (table.occupancy.isOccupied) {
      navigate(`/orders/${table.occupancy.orderId}`);
      return;
    }
    setSeating(table);
  };

  return (
    <main className="min-h-full bg-paper px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.015em]">Tables</h1>
              <span className="rounded-full bg-chana-soft px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-ink">
                Floor
              </span>
            </div>
            <p className="font-mono text-[13px] leading-[18px] text-steel">
              {formatDateIst(now)} · {formatTimeIst(now)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CountPill dot="bg-steel" count={rows.length - seated.length} label="Free" />
            <CountPill
              dot="bg-chana"
              count={seated.length}
              label="Seated"
              className="bg-chana-soft font-semibold"
            />
            <Link
              to="/orders/takeaway"
              className="flex h-10 items-center rounded-full bg-white px-4 text-[14px] font-semibold shadow-card hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Takeaway
            </Link>
            <Link
              to="/orders/delivery"
              className="flex h-10 items-center rounded-full bg-white px-4 text-[14px] font-semibold shadow-card hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Delivery
            </Link>
          </div>
        </header>

        {sections.length > 1 && (
          <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
            <SectionPill
              label={`All tables (${rows.length})`}
              isActive={section === ALL}
              onClick={() => setSection(ALL)}
            />
            {sections.map(([name, count]) => (
              <SectionPill
                key={name}
                label={`${name} (${count})`}
                isActive={section === name}
                onClick={() => setSection(name)}
              />
            ))}
          </div>
        )}

        {tables.isPending && <p className="text-[15px] text-steel">Loading the floor…</p>}

        {tables.isError && <p className="text-[15px] text-mirch">{errorMessage(tables.error)}</p>}

        {tables.isSuccess && rows.length === 0 && (
          <div className="rounded-2xl bg-white px-6 py-12 text-center shadow-card">
            <p className="text-[15px] leading-[22px]">No tables have been set up yet.</p>
            <p className="mt-1 text-[13px] leading-[18px] text-steel">
              An owner or manager adds them on the Table setup screen.
            </p>
            <Link
              to="/tables"
              className="mt-4 inline-flex h-12 items-center rounded-full bg-chana px-5 text-[15px] font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Set up tables
            </Link>
          </div>
        )}

        {visible.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((table) => (
              <li key={table.id}>
                <TableCard
                  table={table}
                  now={now}
                  isSelected={seating?.id === table.id}
                  onOpen={() => openTable(table)}
                />
              </li>
            ))}
          </ul>
        )}

        {tables.isSuccess && rows.length > 0 && (
          <footer className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[16px] font-semibold leading-6">
              <span className="font-mono">{seated.length}</span> of{' '}
              <span className="font-mono">{rows.length}</span> tables seated
            </p>
            <p className="text-[13px] leading-[18px] text-steel">
              Open tables, item total{' '}
              <span className="font-mono text-[15px] font-semibold text-ink">
                {formatPaise(openTotal)}
              </span>
            </p>
          </footer>
        )}
      </div>

      {seating && (
        <SeatTablePanel
          table={seating}
          isBusy={open.isPending}
          onCancel={() => setSeating(null)}
          onConfirm={(guestCount) => open.mutate({ tableId: seating.id, guestCount })}
        />
      )}

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}

/**
 * One table.
 *
 * The whole card is the tap target, well over the 48px minimum from
 * DESIGN-SYSTEM.md section 7. A seated table is marked by the word, the order
 * number and the chana edge together, never by colour alone.
 */
function TableCard({ table, now, isSelected, onOpen }) {
  const { occupancy } = table;
  const isOccupied = occupancy.isOccupied;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        isOccupied
          ? `Table ${table.name}, order ${occupancy.orderNumber}, open it`
          : `Table ${table.name}, free, seat guests`
      }
      className={[
        'relative flex min-h-[188px] w-full flex-col justify-between overflow-hidden rounded-2xl p-5 text-left transition-shadow',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        isSelected
          ? 'bg-linen shadow-[0_4px_20px_rgba(122,89,0,0.14)] ring-2 ring-chana/60'
          : 'bg-white shadow-card hover:shadow-lift',
      ].join(' ')}
    >
      {isOccupied && <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-chana" />}

      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span
              className={[
                'block truncate font-mono text-[28px] font-bold leading-9 tracking-[-0.02em]',
                isOccupied ? 'text-ink' : 'text-steel',
              ].join(' ')}
            >
              {table.name}
            </span>
            {table.section && (
              <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-[0.04em] text-steel">
                {table.section}
              </span>
            )}
          </div>

          <span
            className={[
              'flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.04em]',
              isOccupied ? 'bg-chana-soft text-ink' : 'bg-linen-2 text-steel',
            ].join(' ')}
          >
            {isOccupied ? 'Seated' : 'Free'}
          </span>
        </div>

        <div className="flex items-center gap-4 font-mono text-[13px] leading-[18px] text-steel">
          {table.seats != null && <span>{table.seats} seats</span>}
          {isOccupied && occupancy.openedAt && (
            <span>{formatElapsed(now, occupancy.openedAt)}</span>
          )}
          {isOccupied && <span>#{occupancy.orderNumber}</span>}
        </div>
      </div>

      {isOccupied ? (
        <div className="mt-4 flex items-end justify-between gap-2 pt-4">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-steel">
              Item total
            </span>
            <span className="block font-mono text-[20px] font-bold leading-7">
              {formatPaise(occupancy.runningTotalInPaise)}
            </span>
          </div>
          <span className="rounded-full bg-linen-2 px-3.5 py-1.5 text-[12px] font-medium">
            Open order →
          </span>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between gap-2 pt-4">
          <span className="text-[11px] font-semibold tracking-[0.04em] text-steel">Ready to seat</span>
          <span className="rounded-full bg-linen-3 px-4 py-2 text-[12px] font-medium">
            + Seat table
          </span>
        </div>
      )}
    </button>
  );
}

function CountPill({ dot, count, label, className = 'bg-linen-3' }) {
  return (
    <span className={`flex items-center gap-2 rounded-full px-3.5 py-2 shadow-card ${className}`}>
      <span aria-hidden className={`size-2.5 rounded-full ${dot}`} />
      <span className="font-mono text-[14px] font-bold">{count}</span>
      <span className="text-[12px] font-medium text-steel">{label}</span>
    </span>
  );
}

function SectionPill({ label, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={[
        'flex h-11 flex-none items-center gap-2 whitespace-nowrap rounded-full px-5 text-[14px] font-semibold shadow-card transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        isActive ? 'bg-ink text-white' : 'bg-white text-steel hover:text-ink',
      ].join(' ')}
    >
      {isActive && <span aria-hidden className="size-2 rounded-full bg-chana" />}
      {label}
    </button>
  );
}

/** "32m" or "1h 12m" since an instant. Display only. */
function formatElapsed(now, since) {
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** The current time, refreshed on an interval, so elapsed times move on their own. */
function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
