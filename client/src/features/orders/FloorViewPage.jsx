import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import Toast from '../../components/ui/Toast.jsx';
import { createOrder, getOrder, listTables, moveOrderToTable } from '../../api/orders.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatPaise } from '../../utils/formatMoney.js';
import { formatDateIst, formatTimeIst } from '../../utils/formatDate.js';
import { errorMessage, occupiedByOrderId } from './errorCopy.js';
import MoveTablePanel from './MoveTablePanel.jsx';
import SeatTablePanel from './SeatTablePanel.jsx';

const ALL = '__all__';
const UNASSIGNED = 'Unassigned';
const GRID_COLUMNS = 24;
const GRID_ROWS = 16;

/**
 * The four floor states, each a word as well as a look, so a state never
 * depends on colour alone. Existing tokens only; P20 may restyle them.
 */
const STATES = {
  FREE: { word: 'Free', card: 'bg-white', badge: 'bg-linen-2 text-steel', edge: '' },
  OPEN: { word: 'Open', card: 'bg-white', badge: 'bg-chana-soft text-ink', edge: 'bg-chana' },
  SERVED: { word: 'Served', card: 'bg-white', badge: 'bg-patta-tint text-ink', edge: 'bg-patta' },
  BILL_PRINTED: { word: 'Bill printed', card: 'bg-ink text-white', badge: 'bg-white/15 text-white', edge: 'bg-chana' },
};

const viewKey = (section) => `floor-view:${section}`;
function rememberedView(section) {
  try {
    return window.localStorage.getItem(viewKey(section));
  } catch {
    return null;
  }
}
function rememberView(section, view) {
  try {
    window.localStorage.setItem(viewKey(section), view);
  } catch {
    // Blocked storage: the default view is used next time.
  }
}

/**
 * The floor. M2, with P19's floor plan.
 *
 * Each section shows as a plan, its tables where they stand in the room, when
 * at least one of its tables has a place; otherwise, or by choice, as tiles.
 * The choice is remembered per section on this device. Every table says its
 * state in a word: Free, Open, Served or Bill printed, and Long when it has run
 * past the restaurant's threshold. Tables waiting to pay are also listed in a
 * billing strip at the top, newest first.
 *
 * Occupancy is not stored anywhere: every state comes from the server working
 * out what is open on that table, so a table cannot be stuck occupied.
 */
export default function FloorViewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { features } = useAuth();
  const floor = features?.floor ?? { sectionOrder: [], requireGuestCount: false };
  const [toast, setToast] = useState(null);
  const [section, setSection] = useState(ALL);
  const [seating, setSeating] = useState(null);
  const [moving, setMoving] = useState(null);
  const now = useNow(30_000);

  const tables = useQuery({
    queryKey: ['tables', { includeInactive: false }],
    queryFn: () => listTables(),
    // A table is taken and freed by other people all through a service.
    refetchInterval: 15_000,
  });

  const open = useMutation({
    mutationFn: ({ tableId, guestCount }) =>
      createOrder({ orderType: 'DINE_IN', tableId, ...(guestCount ? { guestCount } : {}) }),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      navigate(`/orders/${order.id}`);
    },
    onError: (error) => {
      // Another waiter got there first: open the order that won.
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

  const move = useMutation({
    mutationFn: ({ order, table }) => moveOrderToTable(order.id, { version: order.version, tableId: table.id }),
    onSuccess: (_order, { table }) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setMoving(null);
      setToast({ tone: 'success', message: `Moved to ${table.name}.` });
    },
    onError: (error) => setToast({ tone: 'error', message: errorMessage(error) }),
  });

  const startMove = async (table) => {
    try {
      setMoving(await getOrder(table.occupancy.orderId));
    } catch (error) {
      setToast({ tone: 'error', message: errorMessage(error) });
    }
  };

  const rows = tables.data ?? [];

  /** Sections in the restaurant's order, then the rest by name, unsectioned last. */
  const sections = useMemo(() => {
    const groups = new Map();
    for (const table of rows) {
      const name = table.section || UNASSIGNED;
      groups.set(name, [...(groups.get(name) ?? []), table]);
    }
    const order = (floor.sectionOrder ?? []).map((name) => name.toLowerCase());
    const rank = (name) => {
      const index = order.indexOf(name.toLowerCase());
      return index === -1 ? order.length : index;
    };
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === UNASSIGNED) return 1;
      if (b === UNASSIGNED) return -1;
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  }, [rows, floor.sectionOrder]);

  const shown = section === ALL ? sections : sections.filter(([name]) => name === section);
  const seated = rows.filter((table) => table.occupancy.isOccupied);
  const waiting = rows
    .filter((table) => table.occupancy.state === 'BILL_PRINTED')
    .sort((a, b) => new Date(b.occupancy.openedAt) - new Date(a.occupancy.openedAt));

  const tapTable = (table) => {
    if (table.occupancy.isOccupied) navigate(`/orders/${table.occupancy.orderId}`);
    else setSeating(table);
  };

  return (
    <main className="min-h-full bg-paper px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.015em]">Tables</h1>
            <p className="font-mono text-[13px] leading-[18px] text-steel">
              {formatDateIst(now)} · {formatTimeIst(now)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CountPill dot="bg-steel" count={rows.length - seated.length} label="Free" />
            <CountPill dot="bg-chana" count={seated.length} label="Seated" className="bg-chana-soft font-semibold" />
            <Link to="/orders/takeaway" className="flex h-10 items-center rounded-full bg-white px-4 text-[14px] font-semibold shadow-card hover:shadow-lift">
              Takeaway
            </Link>
            <Link to="/orders/delivery" className="flex h-10 items-center rounded-full bg-white px-4 text-[14px] font-semibold shadow-card hover:shadow-lift">
              Delivery
            </Link>
          </div>
        </header>

        {waiting.length > 0 && (
          <section aria-label="Billing" className="rounded-2xl bg-ink p-3 text-white shadow-lift">
            <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70">
              Billing · waiting to pay
            </h2>
            <ul className="flex gap-2 overflow-x-auto">
              {waiting.map((table) => (
                <li key={table.id} className="flex-none">
                  <Link
                    to={`/bills/${table.occupancy.billId}`}
                    className="flex min-h-[56px] items-center gap-3 rounded-xl bg-white/10 px-3 py-2 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                  >
                    <span className="font-mono text-[18px] font-bold">{table.name}</span>
                    <span className="text-[12px] text-white/70">
                      {table.occupancy.guestCount != null ? `${table.occupancy.guestCount} guests` : 'Guests not recorded'}
                    </span>
                    <span className="font-mono text-[15px] font-bold text-chana">{formatPaise(table.occupancy.billTotalInPaise)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {sections.length > 1 && (
          <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
            <SectionPill label={`All tables (${rows.length})`} isActive={section === ALL} onClick={() => setSection(ALL)} />
            {sections.map(([name, list]) => (
              <SectionPill key={name} label={`${name} (${list.length})`} isActive={section === name} onClick={() => setSection(name)} />
            ))}
          </div>
        )}

        {tables.isPending && <p className="text-[15px] text-steel">Loading the floor…</p>}
        {tables.isError && <p className="text-[15px] text-mirch">{errorMessage(tables.error)}</p>}

        {tables.isSuccess && rows.length === 0 && (
          <div className="rounded-2xl bg-white px-6 py-12 text-center shadow-card">
            <p className="text-[15px] leading-[22px]">No tables have been set up yet.</p>
            <p className="mt-1 text-[13px] leading-[18px] text-steel">An owner or manager adds them on the Table setup screen.</p>
            <Link to="/tables" className="mt-4 inline-flex h-12 items-center rounded-full bg-chana px-5 text-[15px] font-semibold text-ink">
              Set up tables
            </Link>
          </div>
        )}

        {shown.map(([name, list]) => (
          <FloorSection
            key={name}
            name={name}
            tables={list}
            now={now}
            selectedId={seating?.id}
            onTap={tapTable}
            onMove={startMove}
          />
        ))}
      </div>

      {seating && (
        <SeatTablePanel
          table={seating}
          isBusy={open.isPending}
          allowSkip={!floor.requireGuestCount}
          onCancel={() => setSeating(null)}
          onConfirm={(guestCount) => open.mutate({ tableId: seating.id, guestCount })}
        />
      )}

      {moving && (
        <MoveTablePanel
          order={moving}
          isBusy={move.isPending}
          onCancel={() => setMoving(null)}
          onConfirm={(table) => move.mutate({ order: moving, table })}
        />
      )}

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}

/** One section: its plan when any table has a place, else tiles, and the choice remembered. */
function FloorSection({ name, tables, now, selectedId, onTap, onMove }) {
  const placed = tables.filter((table) => table.layout);
  const canPlan = placed.length > 0;
  const [view, setView] = useState(() => rememberedView(name) ?? (canPlan ? 'plan' : 'tiles'));
  const showPlan = canPlan && view === 'plan';

  const choose = (next) => {
    setView(next);
    rememberView(name, next);
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-steel">{name}</h2>
        {canPlan && (
          <div className="flex rounded-full bg-linen-2 p-1" role="group" aria-label={`${name} view`}>
            {[
              ['plan', 'Plan'],
              ['tiles', 'Tiles'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => choose(key)}
                className={['h-9 rounded-full px-4 text-[12px] font-semibold', view === key ? 'bg-white shadow-card' : 'text-steel'].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {showPlan ? (
        <>
          <div className="relative w-full overflow-hidden rounded-2xl bg-linen shadow-card" style={{ aspectRatio: `${GRID_COLUMNS} / ${GRID_ROWS}` }}>
            {placed.map((table) => (
              <PlanTable key={table.id} table={table} now={now} onTap={() => onTap(table)} onMove={() => onMove(table)} />
            ))}
          </div>
          {tables.length > placed.length && (
            <div>
              <p className="mb-2 text-[12px] text-steel">Not on the plan yet</p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {tables
                  .filter((table) => !table.layout)
                  .map((table) => (
                    <li key={table.id}>
                      <TableCard table={table} now={now} compact isSelected={selectedId === table.id} onTap={() => onTap(table)} onMove={() => onMove(table)} />
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map((table) => (
            <li key={table.id}>
              <TableCard table={table} now={now} isSelected={selectedId === table.id} onTap={() => onTap(table)} onMove={() => onMove(table)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A table drawn where it stands: its grid place, scaled to the plan's width. */
function PlanTable({ table, now, onTap, onMove }) {
  const { layout, occupancy } = table;
  const look = STATES[occupancy.state] ?? STATES.FREE;
  const taken = occupancy.isOccupied;
  const amount = occupancy.state === 'BILL_PRINTED' ? occupancy.billTotalInPaise : occupancy.itemTotalInPaise;

  return (
    <div
      className="absolute p-[0.4%]"
      style={{
        left: `${(layout.x / GRID_COLUMNS) * 100}%`,
        top: `${(layout.y / GRID_ROWS) * 100}%`,
        width: `${(layout.w / GRID_COLUMNS) * 100}%`,
        height: `${(layout.h / GRID_ROWS) * 100}%`,
      }}
    >
      <button
        type="button"
        onClick={onTap}
        aria-label={taken ? `Table ${table.name}, ${look.word}, open the order` : `Table ${table.name}, free, seat guests`}
        className={[
          'relative flex h-full w-full flex-col items-center justify-center overflow-hidden text-center shadow-card transition-shadow hover:shadow-lift',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
          layout.shape === 'ROUND' ? 'rounded-full' : 'rounded-xl',
          look.card,
          occupancy.isLong ? 'ring-2 ring-mirch' : '',
        ].join(' ')}
      >
        <span className="font-mono text-[clamp(10px,1.6vw,18px)] font-bold leading-tight">{table.name}</span>
        <span className="text-[clamp(8px,0.9vw,11px)] font-semibold uppercase tracking-wide opacity-80">
          {look.word}
          {occupancy.isLong && ' · Long'}
        </span>
        {taken && (
          <span className="hidden font-mono text-[11px] leading-tight sm:block">
            {occupancy.guestCount != null && `${occupancy.guestCount}g · `}
            {minutesSince(now, occupancy.openedAt)}m
            {amount != null && ` · ${formatPaise(amount)}`}
          </span>
        )}
      </button>
      {taken && <TableMenu table={table} onMove={onMove} small />}
    </div>
  );
}

/** A table as a tile: the tile view, and the tray of tables not yet on the plan. */
function TableCard({ table, now, compact = false, isSelected, onTap, onMove }) {
  const { occupancy } = table;
  const look = STATES[occupancy.state] ?? STATES.FREE;
  const taken = occupancy.isOccupied;
  const printed = occupancy.state === 'BILL_PRINTED';

  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={onTap}
        aria-label={taken ? `Table ${table.name}, ${look.word}, open the order` : `Table ${table.name}, free, seat guests`}
        className={[
          'relative flex w-full flex-col justify-between overflow-hidden rounded-2xl p-5 text-left shadow-card transition-shadow hover:shadow-lift',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
          compact ? 'min-h-[96px] p-3' : 'min-h-[176px]',
          look.card,
          isSelected ? 'ring-2 ring-chana/60' : '',
          occupancy.isLong ? 'ring-2 ring-mirch' : '',
        ].join(' ')}
      >
        {look.edge && <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${look.edge}`} />}
        <div className="flex items-start justify-between gap-2 pr-8">
          <div className="min-w-0">
            <span className={['block truncate font-mono font-bold tracking-[-0.02em]', compact ? 'text-[20px]' : 'text-[28px] leading-9'].join(' ')}>
              {table.name}
            </span>
            {!compact && table.seats != null && <span className="text-[11px] font-semibold uppercase tracking-[0.04em] opacity-70">{table.seats} seats</span>}
          </div>
          <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold ${look.badge}`}>{look.word}</span>
        </div>

        {taken ? (
          <div className="mt-3 flex items-end justify-between gap-2">
            <span className="font-mono text-[13px] opacity-80">
              {occupancy.guestCount != null ? `${occupancy.guestCount} guests` : 'Guests not recorded'} · {minutesSince(now, occupancy.openedAt)}m
              {occupancy.isLong && <span className="ml-1 rounded bg-mirch px-1.5 py-0.5 font-sans text-[10px] font-bold text-white">LONG</span>}
              {!compact && occupancy.captainName && <span className="block font-sans text-[12px]">{occupancy.captainName}</span>}
            </span>
            <span className="text-right">
              {!compact && <span className="block text-[10px] font-semibold uppercase tracking-[0.04em] opacity-70">{printed ? 'Bill total' : 'Item total'}</span>}
              <span className="font-mono text-[18px] font-bold">{formatPaise(printed ? occupancy.billTotalInPaise : occupancy.itemTotalInPaise)}</span>
            </span>
          </div>
        ) : (
          !compact && (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-steel">Ready to seat</span>
              <span className="rounded-full bg-linen-3 px-4 py-2 text-[12px] font-medium">+ Seat table</span>
            </div>
          )
        )}
      </button>
      {taken && <TableMenu table={table} onMove={onMove} />}
    </div>
  );
}

/** The "⋯" menu on a taken table: move the order, or open its bill. */
function TableMenu({ table, onMove, small = false }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={ref} className={['absolute z-10', small ? '-right-2 -top-2' : 'right-3 top-3'].join(' ')}>
      <button
        type="button"
        aria-label={`More for table ${table.name}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={[
          'flex items-center justify-center rounded-full bg-white/90 font-bold text-ink shadow-card hover:bg-white',
          small ? 'size-7 text-[13px]' : 'size-9 text-[16px]',
        ].join(' ')}
      >
        ⋯
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-56 overflow-hidden rounded-xl bg-white text-ink shadow-lift">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onMove();
            }}
            className="block min-h-[48px] w-full px-4 text-left text-[14px] hover:bg-linen"
          >
            Move to another table
          </button>
          {table.occupancy.billId && (
            <button
              type="button"
              role="menuitem"
              onClick={() => navigate(`/bills/${table.occupancy.billId}`)}
              className="block min-h-[48px] w-full px-4 text-left text-[14px] hover:bg-linen"
            >
              View bill
            </button>
          )}
        </div>
      )}
    </div>
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

/** Whole minutes since an instant. Display only. */
function minutesSince(now, since) {
  return Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
}

/** The current time, refreshed on an interval, so minutes open move on their own. */
function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
