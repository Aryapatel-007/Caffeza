import { useState } from 'react';
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
  markLineServed,
} from '../../api/orders.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatPaise } from '../../utils/formatMoney.js';
import BillOrderButton from '../billing/BillOrderButton.jsx';
import CancelPanel from './CancelPanel.jsx';
import { LINE_CANCEL_REASONS, ORDER_CANCEL_REASONS } from './cancelReasons.js';
import LineOptionsPanel from './LineOptionsPanel.jsx';
import MenuPicker from './MenuPicker.jsx';
import OrderLineList from './OrderLineList.jsx';
import { errorMessage, shouldRefetch } from './errorCopy.js';
import { placeLabel } from './orderLabel.js';

/** Only these two may cancel a whole order. The server is what enforces it. */
const CAN_CANCEL_ORDER = ['OWNER', 'MANAGER'];

/** A line that has been to the kitchen has to answer the wasPrepared question. */
const REACHED_KITCHEN = ['FIRED', 'READY', 'SERVED'];

/**
 * One order. Lines on the left, menu on the right.
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
  const [pickingItem, setPickingItem] = useState(null);
  const [cancelling, setCancelling] = useState(null);

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
      // Fire returns { kot, order }; everything else returns the order itself.
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

  if (orderQuery.isPending) {
    return <Shell><p className="p-6 text-[15px] text-steel">Loading the order…</p></Shell>;
  }

  if (orderQuery.isError) {
    return (
      <Shell>
        <div className="p-6">
          <p className="text-[15px] text-mirch">{errorMessage(orderQuery.error)}</p>
          <Link to="/floor" className="mt-3 inline-block text-[13px] font-medium underline">
            Back to the floor
          </Link>
        </div>
      </Shell>
    );
  }

  const pendingCount = order.lines.filter((line) => line.status === 'PENDING').length;
  const isOpen = order.status === 'OPEN';
  const canCancelOrder = CAN_CANCEL_ORDER.includes(user?.role);

  return (
    <Shell>
      <header className="sticky top-0 z-10 border-b-2 border-ink bg-paper px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-[20px] font-semibold leading-7">
                {placeLabel(order)}
              </h1>
              <span className="font-mono text-[12px] leading-4 text-steel">
                #{order.orderNumber}
              </span>
            </div>
            <p className="text-[13px] leading-[18px] text-steel">
              {order.status === 'READY_TO_BILL'
                ? 'Everything served. Waiting for the cashier.'
                : order.status === 'CANCELLED'
                  ? 'This order was cancelled.'
                  : order.customerName || `${order.totals.lineCount} lines`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-[12px] uppercase leading-4 tracking-[0.06em] text-steel">Subtotal</p>
              <p className="font-mono text-[18px] font-semibold leading-6">
                {formatPaise(order.totals.subtotalInPaise)}
              </p>
            </div>
            <BillOrderButton order={order} />
            <Link
              to="/floor"
              className="flex h-12 items-center rounded-[10px] px-3 text-[13px] font-medium text-steel hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
            >
              Floor
            </Link>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          aria-label="This order"
          className="flex min-h-0 flex-1 flex-col border-b-2 border-ink/10 lg:border-b-0 lg:border-r-2"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <OrderLineList
              lines={order.lines}
              isBusy={write.isPending}
              onChangeQuantity={(line, quantity) =>
                run({
                  run: () =>
                    editOrderLine(order.id, line.id, { version: order.version, quantity }),
                })
              }
              onServeLine={(line) =>
                run({
                  run: () => markLineServed(order.id, line.id, order.version),
                  successMessage: 'Marked served.',
                })
              }
              onCancelLine={(line) => setCancelling({ kind: 'line', line })}
            />
          </div>

          {isOpen && (
            <footer className="border-t-2 border-ink px-4 py-3">
              <button
                type="button"
                disabled={pendingCount === 0 || write.isPending}
                onClick={() =>
                  run({
                    run: () => fireOrder(order.id, order.version),
                    successMessage: 'Sent to the kitchen.',
                  })
                }
                className="h-14 w-full rounded-[10px] bg-chana text-[15px] font-semibold text-ink transition-transform active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
              >
                {pendingCount === 0
                  ? 'Nothing new to send'
                  : `Send ${pendingCount} to the kitchen`}
              </button>

              {canCancelOrder && (
                <button
                  type="button"
                  disabled={write.isPending}
                  onClick={() => setCancelling({ kind: 'order' })}
                  className="mt-2 h-12 w-full rounded-[10px] text-[13px] font-medium text-mirch focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirch"
                >
                  Cancel the whole order
                </button>
              )}
            </footer>
          )}
        </section>

        {isOpen && (
          <div className="flex min-h-0 flex-1 flex-col">
            <MenuPicker
              tree={menuQuery.data}
              isPending={menuQuery.isPending}
              isError={menuQuery.isError}
              disabled={write.isPending}
              onPick={(item) => {
                // Straight on when there is nothing to choose, panel when there is.
                if (item.variants.length === 0 && item.addOns.length === 0) {
                  run({
                    run: () =>
                      addOrderLines(order.id, {
                        version: order.version,
                        lines: [{ menuItemId: item.id, quantity: 1 }],
                      }),
                  });
                  return;
                }
                setPickingItem(item);
              }}
            />
          </div>
        )}
      </div>

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
              onDone: () => setCancelling(null),
            })
          }
        />
      )}

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </Shell>
  );
}

function Shell({ children }) {
  return <main className="flex h-full min-h-full flex-col bg-paper">{children}</main>;
}
