import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import { MoreIcon } from '../../components/ui/icons/index.jsx';
import Money from '../../components/ui/Money.jsx';
import TableTile from '../../components/ui/TableTile.jsx';
import TimeEdge, { ElapsedTime } from '../../components/ui/TimeEdge.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { seatReservation } from '../../api/online.js';
import { createOrder, getOrder, listTables, moveOrderToTable } from '../../api/orders.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorMessage, occupiedByOrderId } from './errorCopy.js';
import MoveTablePanel from './MoveTablePanel.jsx';
import SeatTablePanel from './SeatTablePanel.jsx';

import Spinner from '../../components/ui/Spinner.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';

/** How a screen reader names a table: "Table 5" for a table called "5", and "Table 5" for one called "Table 5". */
const spokenName = (name) => (/^table\b/i.test(name) ? name : `Table ${name}`);

const ALL = '__all__';
const UNASSIGNED = 'Unassigned';
const GRID_COLUMNS = 24;
const GRID_ROWS = 16;

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

  // P23. Seating the booking the table is reserved for opens the order with its party.
  const seatBooking = useMutation({
    mutationFn: ({ reservation, table }) => seatReservation(reservation.id, { tableId: table.id, guestCount: reservation.partySize }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      navigate(`/orders/${result.order.id}`);
    },
    onError: (error) => {
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
    <main className="v2 min-h-full bg-ground px-4 py-4 text-ink sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="type-title">Floor</h1>
            <p className="type-caption text-muted">
              <span className="type-num-meta text-ink">{rows.length - seated.length}</span> free ·{' '}
              <span className="type-num-meta text-ink">{seated.length}</span> seated
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/orders/takeaway" className="type-button flex min-h-12 items-center rounded-lg border border-ink bg-surface px-4 hover:bg-sunken">
              Takeaway
            </Link>
            <Link to="/orders/delivery" className="type-button flex min-h-12 items-center rounded-lg border border-ink bg-surface px-4 hover:bg-sunken">
              Delivery
            </Link>
          </div>
        </header>

        {waiting.length > 0 && (
          <section aria-labelledby="billing-strip">
            <h2 id="billing-strip" className="type-heading mb-2">
              Billing
            </h2>
            <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {waiting.map((table) => (
                <li key={table.id} className="flex-none">
                  <Link
                    to={`/bills/${table.occupancy.billId}`}
                    className="relative flex min-h-16 items-center gap-4 overflow-hidden rounded-[10px] border-[3px] border-bill bg-surface px-4 pb-3 pt-2 hover:bg-sunken"
                  >
                    <span className="type-tile-name">{table.name}</span>
                    <span className="flex flex-col">
                      <Money paise={table.occupancy.billTotalInPaise} size="num" />
                      <span className="type-caption text-muted">
                        {table.occupancy.guestCount != null ? `${table.occupancy.guestCount} guests` : 'Guests not recorded'}
                      </span>
                    </span>
                    <ElapsedTime since={table.occupancy.openedAt} targetMinutes={floor.longOpenMinutes} />
                    <TimeEdge since={table.occupancy.openedAt} targetMinutes={floor.longOpenMinutes} state="bill" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {sections.length > 1 && (
          <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Section">
            <SectionPill label="All tables" count={rows.length} isActive={section === ALL} onClick={() => setSection(ALL)} />
            {sections.map(([name, list]) => (
              <SectionPill key={name} label={name} count={list.length} isActive={section === name} onClick={() => setSection(name)} />
            ))}
          </div>
        )}

        {tables.isPending && <Spinner label="Loading the floor" />}
        {tables.isError && <ErrorState error={errorMessage(tables.error)} onRetry={() => tables.refetch()} />}

        {tables.isSuccess && rows.length === 0 && (
          <EmptyState
            title="No tables have been set up yet"
            description="An owner or manager adds them on the Table setup screen."
            action={
              <Link to="/tables" className="type-button flex min-h-12 items-center rounded-lg bg-accent px-4 text-on-accent">
                Set up tables
              </Link>
            }
          />
        )}

        {shown.map(([name, list]) => (
          <FloorSection key={name} name={name} tables={list} target={floor.longOpenMinutes} onTap={tapTable} onMove={startMove} />
        ))}
      </div>

      {seating && (
        <SeatTablePanel
          table={seating}
          isBusy={open.isPending}
          allowSkip={!floor.requireGuestCount}
          onCancel={() => setSeating(null)}
          onConfirm={(guestCount) => open.mutate({ tableId: seating.id, guestCount })}
          reservation={seating.occupancy.upcomingReservation}
          onSeatReservation={(reservation) => seatBooking.mutate({ reservation, table: seating })}
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

/** The tile's props from a table and its occupancy block. */
function tileProps(table, target) {
  const { occupancy } = table;
  const printed = occupancy.state === 'BILL_PRINTED';
  const taken = occupancy.isOccupied;
  return {
    name: table.name,
    floorState: taken ? occupancy.state : 'FREE',
    guestCount: occupancy.guestCount,
    amountInPaise: printed ? occupancy.billTotalInPaise : occupancy.itemTotalInPaise,
    openedAt: occupancy.openedAt,
    targetMinutes: target,
    isLong: occupancy.isLong,
    captainName: occupancy.captainName,
    // P23. A free table with a confirmed booking soon.
    reservedLabel: !taken && occupancy.upcomingReservation
      ? `Reserved ${formatTimeIst(occupancy.upcomingReservation.at)}, ${occupancy.upcomingReservation.partySize}`
      : null,
    // A name that already says "Table" is read as it is, never "Table Table 5".
    ariaLabel: taken
      ? `${spokenName(table.name)}, ${STATE_WORDS[occupancy.state]}, open the order`
      : occupancy.upcomingReservation
        ? `${spokenName(table.name)}, reserved at ${formatTimeIst(occupancy.upcomingReservation.at)}, seat guests`
        : `${spokenName(table.name)}, free, seat guests`,
  };
}

const STATE_WORDS = { OPEN: 'open', SERVED: 'served', BILL_PRINTED: 'bill printed' };

/** One section: its plan when any table has a place, else tiles, and the choice remembered. */
function FloorSection({ name, tables, target, onTap, onMove }) {
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
        <h2 className="type-heading">{name}</h2>
        {canPlan && (
          <div className="flex rounded-lg border border-line bg-surface p-1" role="group" aria-label={`${name} view`}>
            {[
              ['plan', 'Plan'],
              ['tiles', 'Tiles'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => choose(key)}
                className={['type-label min-h-10 rounded-md px-4', view === key ? 'bg-sunken text-ink' : 'text-muted hover:text-ink'].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {showPlan ? (
        <>
          <div className="relative w-full overflow-hidden rounded-[10px] border border-line bg-sunken" style={{ aspectRatio: `${GRID_COLUMNS} / ${GRID_ROWS}` }}>
            {placed.map((table) => (
              <div
                key={table.id}
                className="absolute p-[0.4%]"
                style={{
                  left: `${(table.layout.x / GRID_COLUMNS) * 100}%`,
                  top: `${(table.layout.y / GRID_ROWS) * 100}%`,
                  width: `${(table.layout.w / GRID_COLUMNS) * 100}%`,
                  height: `${(table.layout.h / GRID_ROWS) * 100}%`,
                }}
              >
                <TableTile
                  {...tileProps(table, target)}
                  fill
                  shape={table.layout.shape}
                  onTap={() => onTap(table)}
                  menu={table.occupancy.isOccupied && <TableMenu table={table} onMove={() => onMove(table)} small />}
                />
              </div>
            ))}
          </div>
          {tables.length > placed.length && (
            <div>
              <p className="type-caption mb-2 text-muted">Not on the plan yet</p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {tables
                  .filter((table) => !table.layout)
                  .map((table) => (
                    <li key={table.id}>
                      <TableTile
                        {...tileProps(table, target)}
                        compact
                        onTap={() => onTap(table)}
                        menu={table.occupancy.isOccupied && <TableMenu table={table} onMove={() => onMove(table)} />}
                      />
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {tables.map((table) => (
            <li key={table.id}>
              <TableTile
                {...tileProps(table, target)}
                onTap={() => onTap(table)}
                menu={table.occupancy.isOccupied && <TableMenu table={table} onMove={() => onMove(table)} />}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
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
    <div ref={ref} className={['absolute z-10', small ? '-right-1 -top-1' : 'right-1 top-1'].join(' ')}>
      <button
        type="button"
        aria-label={`More for table ${table.name}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={[
          'flex items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink',
          small ? 'size-8 border border-line bg-surface' : 'size-12',
        ].join(' ')}
      >
        <MoreIcon />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-56 overflow-hidden rounded-lg border border-line bg-surface text-ink shadow-float">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onMove();
            }}
            className="type-body block min-h-12 w-full px-4 text-left hover:bg-sunken"
          >
            Move to another table
          </button>
          {table.occupancy.billId && (
            <button
              type="button"
              role="menuitem"
              onClick={() => navigate(`/bills/${table.occupancy.billId}`)}
              className="type-body block min-h-12 w-full px-4 text-left hover:bg-sunken"
            >
              View bill
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SectionPill({ label, count, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={[
        'type-label flex min-h-12 flex-none items-center gap-2 whitespace-nowrap rounded-lg border px-4 transition-colors',
        isActive ? 'border-ink bg-sunken text-ink' : 'border-line bg-surface text-muted hover:text-ink',
      ].join(' ')}
    >
      {label}
      <span className="type-num-meta">{count}</span>
    </button>
  );
}
