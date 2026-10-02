import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { BackIcon } from '../../components/ui/icons/index.jsx';
import Money from '../../components/ui/Money.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
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
import { formatTimeIst } from '../../utils/formatDate.js';
import BillOrderButton from '../billing/BillOrderButton.jsx';
import Bilingual from '../i18n/Bilingual.jsx';
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

/** The order's state as a chip, in the floor's words. */
function orderChip(order) {
  switch (order.status) {
    case 'READY_TO_BILL':
      return { state: 'served', word: 'Served, waiting for the cashier' };
    case 'BILLED':
      return { state: 'ok', word: 'Billed' };
    case 'CANCELLED':
      return { state: 'alert', word: 'Cancelled' };
    case 'NO_CHARGE':
      return { state: 'ok', word: 'No Charge, no bill' };
    default:
      return { state: 'open', word: 'Open' };
  }
}

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
    return <Shell><p className="type-body text-muted">Loading the order…</p></Shell>;
  }

  if (orderQuery.isError) {
    return (
      <Shell>
        <p className="type-body text-alert">{errorMessage(orderQuery.error)}</p>
        <Link to="/floor" className="mt-3 inline-block type-caption underline">
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
  // Takeaway and delivery have no table, so on a wide screen the order is a
  // ledger beside the menu rather than a bar and a slide-over.
  const isCounter = order.orderType !== 'DINE_IN';

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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/floor"
            aria-label="Back to the floor"
            className="flex size-12 flex-none items-center justify-center rounded-lg border border-line bg-surface hover:bg-sunken"
          >
            <BackIcon />
          </Link>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="type-title">{placeLabel(order)}</h1>
              <StateChip {...orderChip(order)} size="sm" />
            </div>
            <p className="type-caption text-muted">
              {ORDER_TYPE_LABELS[order.orderType]}
              {order.guestCount != null && ` · ${order.guestCount} ${order.guestCount === 1 ? 'guest' : 'guests'}`}
              {' · '}
              <span className="type-num-meta">#{order.orderNumber}</span>
              {order.openedAt && (
                <>
                  {' · opened '}
                  <span className="type-num-meta">{formatTimeIst(order.openedAt)}</span>
                </>
              )}
              {order.customerName && ` · ${order.customerName}`}
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
                className="type-body min-h-12 w-full rounded-lg border border-muted bg-surface px-4 text-ink placeholder:text-muted"
              />
            </label>
          )}
          {canMove && (
            <button
              type="button"
              disabled={write.isPending}
              onClick={() => setIsMoving(true)}
              className="type-button min-h-12 whitespace-nowrap rounded-lg border border-ink bg-surface px-4 hover:bg-sunken disabled:opacity-50"
            >
              Switch table
            </button>
          )}
          {!isOpen && <BillOrderButton order={order} />}
        </div>
      </header>

      {isOpen ? (
        <div className={isCounter ? 'flex flex-1 flex-col gap-4 lg:flex-row lg:items-start' : 'contents'}>
          <div className={isCounter ? 'flex min-w-0 flex-1 flex-col gap-4' : 'contents'}>
          <MenuPicker
            tree={menuQuery.data}
            isPending={menuQuery.isPending}
            isError={menuQuery.isError}
            search={search}
            compact={isCounter}
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

          <div
            className={[
              'sticky bottom-4 z-20 mx-auto mt-auto w-full max-w-5xl',
              isCounter ? 'lg:hidden' : '',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-surface p-2 pl-4 shadow-float">
              <button
                type="button"
                onClick={() => setIsReviewing(true)}
                className="flex min-h-12 min-w-0 flex-col items-start rounded-lg text-left"
              >
                <span className="flex items-baseline gap-2">
                  <span className="type-label">
                    <span className="type-num">{itemCount}</span> {itemCount === 1 ? 'item' : 'items'}
                  </span>
                  <Money paise={order.totals.subtotalInPaise} size="num" />
                </span>
                <span className="type-caption text-muted">
                  Item total, before GST
                  {pendingCount > 0 && ` · ${pendingCount} not sent`}
                </span>
              </button>

              <div className="flex flex-none items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsReviewing(true)}
                  className="type-button hidden min-h-12 items-center rounded-lg px-4 hover:bg-sunken md:flex"
                >
                  Review order
                </button>
                <button
                  type="button"
                  disabled={pendingCount === 0 || write.isPending}
                  onClick={fire}
                  className="min-h-14 rounded-lg bg-accent px-5 text-on-accent hover:brightness-110 disabled:opacity-50 sm:px-7"
                >
                  {pendingCount === 0 ? (
                    <span className="type-button">Nothing to send</span>
                  ) : (
                    <Bilingual k="sendToKitchen" en={`Send ${pendingCount} to kitchen`} keep align="center" />
                  )}
                </button>
              </div>
            </div>
          </div>
          </div>

          {isCounter && (
            <aside
              aria-label="This order"
              className="sticky top-4 hidden max-h-[calc(100vh-2rem)] w-[360px] flex-none flex-col overflow-hidden rounded-[10px] border border-line bg-surface lg:flex xl:w-[420px]"
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <h2 className="type-heading">Current order</h2>
                  <p className="type-caption text-muted">
                    {placeLabel(order)}
                    {order.customerName && ` · ${order.customerName}`}
                    {order.customerPhone && ` · ${order.customerPhone}`}
                  </p>
                </div>
                <span className="type-num-meta text-muted">#{order.orderNumber}</span>
              </div>
              {details}
            </aside>
          )}
        </div>
      ) : (
        <section aria-label="This order" className="mx-auto w-full max-w-3xl rounded-[10px] bg-surface border border-line">
          {details}
        </section>
      )}

      {isOpen && isReviewing && (
        <Sheet title={placeLabel(order)} subtitle={`#${order.orderNumber}`} onClose={() => setIsReviewing(false)}>
          {details}
        </Sheet>
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

      <footer className="flex flex-col gap-2 border-t border-line px-5 py-4">
        <div className="flex items-baseline justify-between">
          <span className="type-label text-muted">Item total</span>
          <Money paise={order.totals.subtotalInPaise} size="tile" />
        </div>

        {isOpen && (
          <button
            type="button"
            disabled={pendingCount === 0 || isBusy}
            onClick={onFire}
            className="type-button min-h-14 w-full rounded-lg bg-accent text-on-accent hover:brightness-110 disabled:opacity-50"
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
            className="type-button min-h-12 w-full rounded-lg border border-ink bg-surface hover:bg-sunken disabled:opacity-50"
          >
            No Charge
          </button>
        )}

        {isOpen && canCancelOrder && (
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancelOrder}
            className="type-button min-h-12 w-full rounded-lg text-alert hover:bg-alert-tint"
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
    <main className="v2 flex min-h-full flex-col gap-4 bg-ground px-4 pb-4 pt-4 text-ink lg:px-6">{children}</main>
  );
}
