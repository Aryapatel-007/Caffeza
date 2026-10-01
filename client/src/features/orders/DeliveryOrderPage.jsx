import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import Toast from '../../components/ui/Toast.jsx';
import { getMenuTree } from '../../api/menu.js';
import { createOrder, fireOrder } from '../../api/orders.js';
import { formatPaise } from '../../utils/formatMoney.js';
import { errorMessage } from './errorCopy.js';
import LineOptionsPanel from './LineOptionsPanel.jsx';
import MenuPicker from './MenuPicker.jsx';
import { PLATFORMS } from './platforms.js';

const PLATFORM_ORDER_ID = /^[A-Za-z0-9]{3,40}$/;

/**
 * A new Zomato or Swiggy order, typed in by hand from the platform's tablet.
 * P06, one screen.
 *
 * Platform, the platform's order number, then the dishes, all before anything
 * is saved. The order is a draft held on this screen until "Send to kitchen",
 * which creates the order with its lines in one request and then fires it.
 * Nothing exists on the server until then, so Clear really does throw it away,
 * and a number already entered is refused at that moment with a link to the
 * order that has it.
 *
 * The prices on the summary are the menu's, shown for reading out. The server
 * prices every line from the menu when the order is created, and decides the
 * GST when the bill is made: a platform order is frozen at 0% when the
 * platform pays the GST, a setting pending the CA's confirmation.
 */
export default function DeliveryOrderPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [platformCode, setPlatformCode] = useState(null);
  const [platformOrderId, setPlatformOrderId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState([]);
  const [pickingItem, setPickingItem] = useState(null);
  const [toast, setToast] = useState(null);
  const [existingOrderId, setExistingOrderId] = useState(null);

  const menuQuery = useQuery({
    queryKey: ['menu', { includeUnavailable: false }],
    queryFn: () => getMenuTree({ includeUnavailable: false }),
    staleTime: 60_000,
  });

  const itemsById = useMemo(() => {
    const map = new Map();
    for (const category of menuQuery.data ?? []) {
      for (const item of category.items) map.set(item.id, item);
    }
    return map;
  }, [menuQuery.data]);

  /** Draft lines with no size, extras or note, by dish, so a second tap raises the quantity. */
  const { simpleLines, pendingCounts } = useMemo(() => {
    const simple = new Map();
    const counts = new Map();
    for (const line of draft) {
      counts.set(line.menuItemId, (counts.get(line.menuItemId) ?? 0) + line.quantity);
      const isSimple = !line.variantId && line.addOnIds.length === 0 && !line.notes;
      if (isSimple && !simple.has(line.menuItemId)) simple.set(line.menuItemId, line);
    }
    return { simpleLines: simple, pendingCounts: counts };
  }, [draft]);

  const platform = PLATFORMS.find((entry) => entry.code === platformCode) ?? null;
  const orderIdValid = PLATFORM_ORDER_ID.test(platformOrderId.trim());
  const itemCount = draft.reduce((sum, line) => sum + line.quantity, 0);
  const itemTotal = draft.reduce((sum, line) => sum + line.unitInPaise * line.quantity, 0);

  const missing = !platform
    ? 'Choose the platform'
    : !orderIdValid
      ? 'Enter the platform order number'
      : draft.length === 0
        ? 'Add a dish'
        : null;

  const addLine = (line) => {
    const item = itemsById.get(line.menuItemId);
    const variant = item?.variants.find((entry) => entry.id === line.variantId);
    const addOns = (item?.addOns ?? []).filter((entry) => (line.addOnIds ?? []).includes(entry.id));
    const unitInPaise =
      (variant ? variant.priceInPaise : item?.priceInPaise ?? 0) +
      addOns.reduce((sum, addOn) => sum + addOn.priceInPaise, 0);

    setDraft((current) => [
      ...current,
      {
        id: `${line.menuItemId}-${Date.now()}-${current.length}`,
        menuItemId: line.menuItemId,
        variantId: line.variantId ?? null,
        addOnIds: line.addOnIds ?? [],
        notes: line.notes ?? null,
        quantity: line.quantity,
        name: item?.name ?? 'Dish',
        detail: [variant?.name, ...addOns.map((addOn) => addOn.name), line.notes && `“${line.notes}”`]
          .filter(Boolean)
          .join(' · '),
        unitInPaise,
      },
    ]);
  };

  const setQuantity = (line, quantity) =>
    setDraft((current) =>
      quantity <= 0
        ? current.filter((entry) => entry.id !== line.id)
        : current.map((entry) => (entry.id === line.id ? { ...entry, quantity } : entry)),
    );

  const save = useMutation({
    mutationFn: async ({ fire }) => {
      const order = await createOrder({
        orderType: 'DELIVERY',
        platform: { code: platformCode, orderId: platformOrderId.trim() },
        ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
        lines: draft.map((line) => ({
          menuItemId: line.menuItemId,
          ...(line.variantId ? { variantId: line.variantId } : {}),
          quantity: line.quantity,
          ...(line.addOnIds.length > 0 ? { addOnIds: line.addOnIds } : {}),
          ...(line.notes ? { notes: line.notes } : {}),
        })),
      });
      if (!fire) return { order, fired: false };
      try {
        await fireOrder(order.id, order.version);
        return { order, fired: true };
      } catch {
        // The order exists; its own screen shows the lines still to send.
        return { order, fired: false, fireFailed: true };
      }
    },
    onSuccess: ({ order }) => {
      queryClient.invalidateQueries({ queryKey: ['kots'] });
      navigate(`/orders/${order.id}`);
    },
    onError: (error) => {
      setExistingOrderId(error?.existingOrderId ?? null);
      setToast({ tone: 'error', message: errorMessage(error) });
    },
  });

  const clear = () => {
    setDraft([]);
    setPlatformOrderId('');
    setCustomerName('');
    setExistingOrderId(null);
  };

  return (
    <main className="min-h-full bg-paper px-4 py-6 lg:px-6">
      <div className="mx-auto flex max-w-[1720px] flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left: platform, number, menu. */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <p className="text-[11px] font-semibold text-steel">
                <Link to="/floor" className="hover:text-ink">Orders</Link> ›{' '}
                <span className="text-ink">New delivery order</span>
              </p>
              <h1 className="mt-0.5 text-[24px] font-semibold leading-8 tracking-[-0.015em]">
                New delivery order
              </h1>
            </div>
            <span className="self-start rounded-full bg-linen-2 px-3 py-1 text-[12px] font-semibold text-steel sm:self-auto">
              Entered by hand from the platform tablet
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" role="group" aria-label="Platform">
            {PLATFORMS.map((entry) => {
              const chosen = platformCode === entry.code;
              return (
                <button
                  key={entry.code}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => setPlatformCode(entry.code)}
                  className={[
                    'relative flex min-h-[84px] flex-col justify-between overflow-hidden rounded-2xl p-4 text-left shadow-card transition-all active:scale-[0.99]',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                    chosen ? 'bg-chana-soft ring-2 ring-chana' : 'bg-white hover:bg-linen',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className={[
                          'flex size-10 items-center justify-center rounded-xl font-mono text-[16px] font-bold',
                          chosen ? 'bg-chana text-ink' : 'bg-linen-3 text-steel',
                        ].join(' ')}
                      >
                        {entry.name.charAt(0)}
                      </span>
                      <span className="text-[16px] font-semibold">{entry.name}</span>
                    </div>
                    <span
                      className={[
                        'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                        chosen ? 'bg-ink text-white' : 'bg-linen-2 text-steel',
                      ].join(' ')}
                    >
                      {chosen ? 'Selected' : 'Choose'}
                    </span>
                  </div>
                  <span className="mt-2 text-[12px] text-steel">
                    Paid by {entry.name}, settled in its payout
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-card md:flex-row md:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-steel">
                Platform order number
              </span>
              <span className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={platformOrderId}
                  maxLength={40}
                  onChange={(event) => {
                    setPlatformOrderId(event.target.value);
                    setExistingOrderId(null);
                  }}
                  placeholder="249377796192385"
                  className="h-12 w-full rounded-xl bg-linen px-4 font-mono text-[15px] font-bold placeholder:font-normal placeholder:text-steel focus:bg-white focus:outline-none focus:ring-2 focus:ring-chana"
                />
                {orderIdValid && (
                  <span className="absolute right-3 top-3 rounded bg-patta-tint px-2 py-0.5 text-[10px] font-semibold">
                    Looks right
                  </span>
                )}
              </span>
            </label>
            <label className="flex flex-col gap-1 md:w-64">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-steel">
                Customer name, optional
              </span>
              <input
                type="text"
                value={customerName}
                maxLength={100}
                onChange={(event) => setCustomerName(event.target.value)}
                className="h-12 w-full rounded-xl bg-linen px-4 text-[15px] focus:bg-white focus:outline-none focus:ring-2 focus:ring-chana"
              />
            </label>
          </div>

          {existingOrderId && (
            <p className="rounded-2xl bg-mirch-soft px-4 py-3 text-[13px]">
              This platform order number is already on an open order.{' '}
              <Link to={`/orders/${existingOrderId}`} className="font-semibold underline underline-offset-4">
                Open that order
              </Link>
            </p>
          )}

          <label className="relative block sm:max-w-sm">
            <span className="sr-only">Search the menu</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search dishes"
              className="h-11 w-full rounded-full bg-white px-4 text-[13px] shadow-card placeholder:text-steel focus:outline-none focus:ring-2 focus:ring-chana"
            />
          </label>

          <MenuPicker
            tree={menuQuery.data}
            isPending={menuQuery.isPending}
            isError={menuQuery.isError}
            search={search}
            compact
            disabled={save.isPending}
            simpleLines={simpleLines}
            pendingCounts={pendingCounts}
            onStep={setQuantity}
            onRemove={(line) => setQuantity(line, 0)}
            onPick={(item) => {
              if (item.variants.length > 0 || item.addOns.length > 0) {
                setPickingItem(item);
                return;
              }
              const existing = simpleLines.get(item.id);
              if (existing) setQuantity(existing, existing.quantity + 1);
              else addLine({ menuItemId: item.id, quantity: 1 });
            }}
          />
        </div>

        {/* Right: the order summary. */}
        <aside className="flex w-full flex-none flex-col lg:sticky lg:top-4 lg:w-[420px] xl:w-[460px]">
          <div className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-lift lg:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[20px] font-semibold leading-7 tracking-tight">Delivery order summary</h2>
                <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[12px] text-steel">
                  <span
                    aria-hidden
                    className={['size-2 rounded-full', platform && orderIdValid ? 'bg-patta' : 'bg-linen-3'].join(' ')}
                  />
                  {platform && orderIdValid ? `${platform.name} ${platformOrderId.trim()}` : 'Not saved yet'}
                </p>
              </div>
              {platform && (
                <span className="rounded-lg bg-chana px-2.5 py-1 font-mono text-[12px] font-bold uppercase tracking-wide">
                  {platform.name}
                </span>
              )}
            </div>

            {draft.length === 0 ? (
              <p className="rounded-xl bg-linen px-4 py-8 text-center text-[13px] text-steel">
                Tap a dish on the left to add it.
              </p>
            ) : (
              <ul className="flex max-h-[320px] flex-col gap-3 overflow-y-auto pr-1">
                {draft.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-linen/60 p-2.5 transition-colors hover:bg-linen"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">{line.name}</p>
                      {line.detail && <p className="truncate text-[12px] text-steel">{line.detail}</p>}
                      <p className="mt-0.5 font-mono text-[13px] font-bold">
                        {formatPaise(line.unitInPaise * line.quantity)}
                      </p>
                    </div>
                    <div className="flex flex-none items-center gap-1.5 rounded-lg bg-white px-2 py-1 shadow-card">
                      <button
                        type="button"
                        aria-label={line.quantity === 1 ? `Remove ${line.name}` : 'One fewer'}
                        onClick={() => setQuantity(line, line.quantity - 1)}
                        className="flex size-8 items-center justify-center rounded text-[15px] font-bold text-steel hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                      >
                        −
                      </button>
                      <span aria-live="polite" className="w-5 text-center font-mono text-[13px] font-bold">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="One more"
                        onClick={() => setQuantity(line, line.quantity + 1)}
                        className="flex size-8 items-center justify-center rounded text-[15px] font-bold text-steel hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                      >
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-2 rounded-xl bg-linen p-3.5">
              <div className="flex items-center justify-between text-[14px]">
                <span className="text-steel">
                  Item total (<span className="font-mono">{itemCount}</span> {itemCount === 1 ? 'item' : 'items'})
                </span>
                <span className="font-mono font-bold">{formatPaise(itemTotal)}</span>
              </div>
            </div>

            <p className="flex items-start gap-2 rounded-xl bg-linen-2 p-2.5 text-[12px] leading-4 text-steel">
              <span aria-hidden className="font-bold">i</span>
              <span>
                GST 0% when the platform pays the GST on this order under section 9(5), as set in
                Settings. The bill works it out.
              </span>
            </p>

            <div className="flex items-end justify-between px-1">
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-steel">
                  Item total
                </span>
                <span className="text-[11px] text-steel">Before GST · the bill has the final total</span>
              </div>
              <span className="font-mono text-[28px] font-bold leading-9 tracking-tight">
                {formatPaise(itemTotal)}
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={Boolean(missing) || save.isPending}
                onClick={() => save.mutate({ fire: true })}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-chana text-[15px] font-bold text-ink shadow-card transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
              >
                {save.isPending ? 'Sending…' : missing ?? 'Send to kitchen →'}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={Boolean(missing) || save.isPending}
                  onClick={() => save.mutate({ fire: false })}
                  className="h-10 rounded-full bg-linen-3 text-[12px] font-semibold hover:bg-linen-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                >
                  Save without sending
                </button>
                <button
                  type="button"
                  disabled={save.isPending || (draft.length === 0 && !platformOrderId)}
                  onClick={clear}
                  className="h-10 rounded-full bg-mirch-soft text-[12px] font-semibold text-mirch hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirch disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {pickingItem && (
        <LineOptionsPanel
          item={pickingItem}
          isBusy={false}
          onCancel={() => setPickingItem(null)}
          onConfirm={(line) => {
            addLine(line);
            setPickingItem(null);
          }}
        />
      )}

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}
