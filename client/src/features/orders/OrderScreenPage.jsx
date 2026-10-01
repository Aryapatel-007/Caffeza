import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import Toast from '../../components/ui/Toast.jsx';
import { getMenuTree } from '../../api/menu.js';
import {
  addOrderLines,
  cancelOrder,
  cancelOrderLine,
  editOrderLine,
  fireOrder,
  getOrder,
  giveNoCharge,
  markLineServed,
  moveOrderToTable,
} from '../../api/orders.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatPaise } from '../../utils/formatMoney.js';
import { formatTimeIst } from '../../utils/formatDate.js';
import BillOrderButton from '../billing/BillOrderButton.jsx';
import CancelPanel from './CancelPanel.jsx';
import { LINE_CANCEL_REASONS, ORDER_CANCEL_REASONS } from './cancelReasons.js';
import LineOptionsPanel from './LineOptionsPanel.jsx';
import MenuPicker from './MenuPicker.jsx';
import MoveTablePanel from './MoveTablePanel.jsx';
import NoChargePanel from './NoChargePanel.jsx';
import OrderLineList from './OrderLineList.jsx';
import { errorMessage, shouldRefetch } from './errorCopy.js';
import { placeLabel } from './orderLabel.js';

/** Only these two may cancel a whole order. The server is what enforces it. */
const CAN_CANCEL_ORDER = ['OWNER', 'MANAGER'];

/** A line that has been to the kitchen has to answer the wasPrepared question. */
const REACHED_KITCHEN = ['FIRED', 'READY', 'SERVED'];

const ORDER_TYPE_LABELS = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };

/**
 * One order.
 *
 * While the order is open the menu fills the screen and the order itself sits
 * in a bar along the bottom, opening into a slide-over. Once it is waiting for
 * the cashier, or closed, the menu goes and the lines are the page.
 *
 * The thing worth understanding here is how a 409 is handled. Two waiters can
 * both have this screen open on one table. Every write carries the version this
 * screen last read, and the server rejects the second one. When that happens
 * the order is refetched and a plain sentence is shown, and nothing the waiter
 * had half-typed is thrown away: the panels hold their own state and are not
 * unmounted by a refetch.
 */
export default function OrderScreenPage() {
  const { orderId } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [pickingItem, setPickingItem] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  const orderQuery = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => getOrder(orderId),
  });

  const menuQuery = useQuery({
    queryKey: ['menu', { includeUnavailable: false }],
    // The ordering screen's read: only what can actually be sold right now.
    queryFn: () => getMenuTree({ includeUnavailable: false }),
    staleTime: 60_000,
  });

  const order = orderQuery.data;

  /**
   * Every write goes through here so the version handling exists once.
   *
   * On any failure the order is refetched when the code says our copy is stale,
   * which covers both a version conflict and a line someone else removed. The
   * refetch replaces the data, not the screen, so an open panel keeps whatever
   * was typed into it.
   */
  const write = useMutation({
    mutationFn: ({ run }) => run(),
    onSuccess: (updated, variables) => {
      // Fire returns { kots, kot, order }; everything else returns the order itself.
      const next = updated?.order ?? updated;
      queryClient.setQueryData(['order', orderId], next);
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['kots'] });

      if (variables.successMessage) {
        setToast({ tone: 'success', message: variables.successMessage });
      }
      variables.onDone?.();
    },
    onError: (error) => {
      if (shouldRefetch(error)) orderQuery.refetch();
      setToast({ tone: 'error', message: errorMessage(error) });
    },
  });

  const run = (options) => write.mutate(options);

  /**
   * Unsent lines grouped by dish, for the menu cards. A "simple" line has no
   * size, extras or note, so another tap on the same dish can just raise its
   * quantity.
   */
  const { simpleLines, pendingCounts } = useMemo(() => {
    const simple = new Map();
    const counts = new Map();
    for (const line of order?.lines ?? []) {
      if (line.status !== 'PENDING') continue;
      counts.set(line.menuItemId, (counts.get(line.menuItemId) ?? 0) + line.quantity);
      const isSimple = !line.variantId && line.addOns.length === 0 && !line.notes;
      if (isSimple && !simple.has(line.menuItemId)) simple.set(line.menuItemId, line);
    }
    return { simpleLines: simple, pendingCounts: counts };
  }, [order]);

  if (orderQuery.isPending) {
    return <Shell><p className="text-[15px] text-steel">Loading the order…</p></Shell>;
  }

  if (orderQuery.isError) {
    return (
      <Shell>
        <p className="text-[15px] text-mirch">{errorMessage(orderQuery.error)}</p>
        <Link to="/floor" className="mt-3 inline-block text-[13px] font-medium underline">
          Back to the tables
        </Link>
      </Shell>
    );
  }

  const liveLines = order.lines.filter((line) => line.status !== 'CANCELLED');
  const itemCount = liveLines.reduce((sum, line) => sum + line.quantity, 0);
  const pendingCount = order.lines.filter((line) => line.status === 'PENDING').length;
  const isOpen = order.status === 'OPEN';
  const canCancelOrder = CAN_CANCEL_ORDER.includes(user?.role);
  const canMove = isOpen && order.orderType === 'DINE_IN';

  const changeQuantity = (line, quantity) =>
    run({
      run: () => editOrderLine(order.id, line.id, { version: order.version, quantity }),
    });

  const fire = () =>
    run({
      run: () => fireOrder(order.id, order.version),
      successMessage: 'Sent to the kitchen.',
      onDone: () => setIsReviewing(false),
    });

  const details = (
    <OrderDetails
      order={order}
      isOpen={isOpen}
      isBusy={write.isPending}
      pendingCount={pendingCount}
      canCancelOrder={canCancelOrder}
      onChangeQuantity={changeQuantity}
      onServeLine={(line) =>
        run({
          run: () => markLineServed(order.id, line.id, order.version),
          successMessage: 'Marked served.',
        })
      }
      onCancelLine={(line) => setCancelling({ kind: 'line', line })}
      onFire={fire}
      onCancelOrder={() => setCancelling({ kind: 'order' })}
      onNoCharge={() => setCancelling({ kind: 'noCharge' })}
    />
  );

  return (
    <Shell>
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-card">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            to="/floor"
            aria-label="Back to the tables"
            className="flex size-14 flex-none items-center justify-center rounded-xl bg-linen text-[22px] shadow-card transition-transform hover:bg-linen-2 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            ←
          </Link>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="rounded-full bg-chana px-3 py-1 font-mono text-[13px] font-bold uppercase tracking-wider text-ink">
                {placeLabel(order)}
              </h1>
              <span className="flex items-center gap-1.5 rounded-full bg-patta-tint px-3 py-1 text-[12px] font-medium">
                {order.guestCount != null &&
                  `${order.guestCount} ${order.guestCount === 1 ? 'guest' : 'guests'} · `}
                {ORDER_TYPE_LABELS[order.orderType]}
              </span>
              <span className="rounded-lg bg-linen px-2.5 py-1 font-mono text-[12px] text-steel">
                #{order.orderNumber}
                {order.openedAt && ` · opened ${formatTimeIst(order.openedAt)}`}
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-4 text-steel">
              {order.status === 'READY_TO_BILL'
                ? 'Everything served. Waiting for the cashier.'
                : order.status === 'CANCELLED'
                  ? 'This order was cancelled.'
                  : order.status === 'NO_CHARGE'
                    ? 'Given No Charge. No bill.'
                    : order.status === 'BILLED'
                      ? 'Billed.'
                      : order.customerName || 'Open'}
            </p>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2 sm:max-w-xl">
          {isOpen && (
            <label className="relative block w-full max-w-sm">
              <span className="sr-only">Search the menu</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search dishes"
                className="h-14 w-full rounded-xl bg-linen px-4 text-[15px] placeholder:text-steel focus:bg-white focus:outline-none focus:ring-2 focus:ring-chana"
              />
            </label>
          )}
          {canMove && (
            <button
              type="button"
              disabled={write.isPending}
              onClick={() => setIsMoving(true)}
              className="h-14 whitespace-nowrap rounded-xl bg-linen px-4 text-[13px] font-medium hover:bg-linen-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
            >
              Switch table
            </button>
          )}
          {!isOpen && <BillOrderButton order={order} />}
        </div>
      </header>

      {isOpen ? (
        <>
          <MenuPicker
            tree={menuQuery.data}
            isPending={menuQuery.isPending}
            isError={menuQuery.isError}
            search={search}
            disabled={write.isPending}
            simpleLines={simpleLines}
            pendingCounts={pendingCounts}
            onStep={changeQuantity}
            onRemove={(line) => setCancelling({ kind: 'line', line })}
            onPick={(item) => {
              // Straight on when there is nothing to choose, panel when there is.
              if (item.variants.length > 0 || item.addOns.length > 0) {
                setPickingItem(item);
                return;
              }
              const existing = simpleLines.get(item.id);
              if (existing) {
                changeQuantity(existing, existing.quantity + 1);
                return;
              }
              run({
                run: () =>
                  addOrderLines(order.id, {
                    version: order.version,
                    lines: [{ menuItemId: item.id, quantity: 1 }],
                  }),
              });
            }}
          />

          <div className="sticky bottom-4 z-20 mx-auto mt-auto w-full max-w-5xl">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-ink p-2 pl-4 text-white shadow-[0_8px_30px_rgba(28,27,25,0.25)]">
              <button
                type="button"
                onClick={() => setIsReviewing(true)}
                className="flex min-w-0 items-center gap-3 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <span className="hidden max-w-[7rem] truncate rounded-xl bg-chana px-3 py-3 font-mono text-[12px] font-bold text-ink sm:block">
                  {placeLabel(order)}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[14px] font-bold">
                      <span className="font-mono">{itemCount}</span> {itemCount === 1 ? 'item' : 'items'}
                    </span>
                    <span className="text-white/40">·</span>
                    <span className="font-mono text-[16px] font-bold text-chana">
                      {formatPaise(order.totals.subtotalInPaise)}
                    </span>
                  </span>
                  <span className="block text-[12px] text-white/70">
                    Item total, before GST
                    {pendingCount > 0 && ` · ${pendingCount} not sent`}
                  </span>
                </span>
              </button>

              <div className="flex flex-none items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsReviewing(true)}
                  className="hidden h-11 items-center rounded-xl bg-white/10 px-4 text-[13px] font-medium hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:flex"
                >
                  Review order
                </button>
                <button
                  type="button"
                  disabled={pendingCount === 0 || write.isPending}
                  onClick={fire}
                  className="h-14 rounded-full bg-chana px-5 text-[15px] font-bold text-ink shadow-card transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50 sm:px-7"
                >
                  {pendingCount === 0 ? 'Nothing to send' : `Send ${pendingCount} to kitchen →`}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <section aria-label="This order" className="mx-auto w-full max-w-3xl rounded-2xl bg-white shadow-card">
          {details}
        </section>
      )}

      {isOpen && isReviewing && (
        <div className="fixed inset-0 z-30 flex">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setIsReviewing(false)}
            className="flex-1 bg-ink/30"
          />
          <aside
            role="dialog"
            aria-label="This order"
            className="flex w-full max-w-md flex-col bg-white shadow-[-8px_0_30px_rgba(28,27,25,0.18)]"
          >
            <header className="flex items-center justify-between px-5 py-4">
              <h2 className="text-[20px] font-semibold leading-7">{placeLabel(order)}</h2>
              <button
                type="button"
                onClick={() => setIsReviewing(false)}
                aria-label="Close"
                className="flex size-10 items-center justify-center rounded-full bg-linen-2 text-steel hover:bg-linen-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
              >
                ✕
              </button>
            </header>
            {details}
          </aside>
        </div>
      )}

      {pickingItem && (
        <LineOptionsPanel
          item={pickingItem}
          isBusy={write.isPending}
          onCancel={() => setPickingItem(null)}
          onConfirm={(line) =>
            run({
              run: () => addOrderLines(order.id, { version: order.version, lines: [line] }),
              onDone: () => setPickingItem(null),
            })
          }
        />
      )}

      {isMoving && (
        <MoveTablePanel
          order={order}
          isBusy={write.isPending}
          onCancel={() => setIsMoving(false)}
          onConfirm={(table) =>
            run({
              run: () => moveOrderToTable(order.id, { version: order.version, tableId: table.id }),
              successMessage: `Moved to ${table.name}.`,
              onDone: () => setIsMoving(false),
            })
          }
        />
      )}

      {cancelling?.kind === 'line' && (
        <CancelPanel
          title={`Cancel ${cancelling.line.itemName}`}
          reasons={LINE_CANCEL_REASONS}
          description="It stays on the order, marked cancelled, with the reason."
          needsWasPrepared={REACHED_KITCHEN.includes(cancelling.line.status)}
          isBusy={write.isPending}
          onCancel={() => setCancelling(null)}
          onConfirm={(answers) =>
            run({
              run: () =>
                cancelOrderLine(order.id, cancelling.line.id, {
                  version: order.version,
                  ...answers,
                }),
              successMessage: 'Line cancelled.',
              onDone: () => setCancelling(null),
            })
          }
        />
      )}

      {cancelling?.kind === 'order' && (
        <CancelPanel
          title={`Cancel order #${order.orderNumber}`}
          reasons={ORDER_CANCEL_REASONS}
          description="Every line goes with it. Nothing is deleted."
          needsWasPrepared={order.lines.some((line) => REACHED_KITCHEN.includes(line.status))}
          isBusy={write.isPending}
          onCancel={() => setCancelling(null)}
          onConfirm={(answers) =>
            run({
              run: () => cancelOrder(order.id, { version: order.version, ...answers }),
              successMessage: 'Order cancelled.',
              onDone: () => {
                setCancelling(null);
                setIsReviewing(false);
              },
            })
          }
        />
      )}

      {cancelling?.kind === 'noCharge' && (
        <NoChargePanel
          order={order}
          isBusy={write.isPending}
          onCancel={() => setCancelling(null)}
          onConfirm={(answers) =>
            run({
              run: () => giveNoCharge(order.id, { version: order.version, ...answers }),
              successMessage: 'No Charge given. The table is free.',
              onDone: () => {
                setCancelling(null);
                setIsReviewing(false);
              },
            })
          }
        />
      )}

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </Shell>
  );
}

/**
 * The lines and what can be done to the order as a whole. Rendered inside the
 * slide-over while the order is open, and as the page once it is not.
 */
function OrderDetails({
  order,
  isOpen,
  isBusy,
  pendingCount,
  canCancelOrder,
  onChangeQuantity,
  onServeLine,
  onCancelLine,
  onFire,
  onCancelOrder,
  onNoCharge,
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <OrderLineList
          lines={order.lines}
          isBusy={isBusy}
          onChangeQuantity={onChangeQuantity}
          onServeLine={onServeLine}
          onCancelLine={onCancelLine}
        />
      </div>

      <footer className="flex flex-col gap-2 border-t border-black/5 px-5 py-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-steel">Item total</span>
          <span className="font-mono text-[18px] font-semibold">
            {formatPaise(order.totals.subtotalInPaise)}
          </span>
        </div>

        {isOpen && (
          <button
            type="button"
            disabled={pendingCount === 0 || isBusy}
            onClick={onFire}
            className="h-14 w-full rounded-full bg-chana text-[15px] font-semibold text-ink transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
          >
            {pendingCount === 0 ? 'Nothing new to send' : `Send ${pendingCount} to the kitchen`}
          </button>
        )}

        {/* P08. Manager work, on an open order or one waiting for the cashier. */}
        {canCancelOrder && (isOpen || order.status === 'READY_TO_BILL') && (
          <button
            type="button"
            disabled={isBusy}
            onClick={onNoCharge}
            className="h-12 w-full rounded-full bg-linen-2 text-[13px] font-medium hover:bg-linen-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
          >
            No Charge
          </button>
        )}

        {isOpen && canCancelOrder && (
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancelOrder}
            className="h-12 w-full rounded-full text-[13px] font-medium text-mirch focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirch"
          >
            Cancel the whole order
          </button>
        )}
      </footer>
    </div>
  );
}

function Shell({ children }) {
  return (
    <main className="flex min-h-full flex-col gap-4 bg-paper px-4 pb-4 pt-4 lg:px-6">{children}</main>
  );
}
