import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import { createOrder } from '../../api/orders.js';
import { errorMessage } from './errorCopy.js';
import { PLATFORMS } from './platforms.js';

/**
 * Starting a delivery order. P06.
 *
 * Zomato and Swiggy orders are typed in by hand at the counter, from the
 * platform's own tablet. One big button per platform, then the platform's
 * order number. Works from the keyboard: the platform buttons are tabbable and
 * Enter in the number field starts the order.
 *
 * A delivery order has no table and no guests. If the number was already
 * entered, the server says so and links to that order.
 */
export default function DeliveryOrderPage() {
  const navigate = useNavigate();
  const [platformCode, setPlatformCode] = useState(null);
  const [platformOrderId, setPlatformOrderId] = useState('');
  const [customerName, setCustomerName] = useState('');

  const start = useMutation({
    mutationFn: () =>
      createOrder({
        orderType: 'DELIVERY',
        platform: { code: platformCode, orderId: platformOrderId.trim() },
        ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
      }),
    onSuccess: (order) => navigate(`/orders/${order.id}`),
  });

  const canStart = platformCode && /^[A-Za-z0-9]{3,40}$/.test(platformOrderId.trim()) && !start.isPending;
  const existingOrderId = start.error?.existingOrderId;

  const field =
    'h-12 w-full rounded-xl bg-linen px-4 text-[15px] placeholder:text-steel focus:bg-white focus:outline-none focus:ring-2 focus:ring-chana';
  const legend = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-steel';

  return (
    <main className="min-h-full bg-paper px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <header className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-card">
          <div>
            <p className="text-[11px] font-semibold text-steel">Orders › New delivery order</p>
            <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.015em]">New delivery order</h1>
          </div>
          <Link
            to="/floor"
            className="flex h-11 items-center rounded-full bg-linen px-4 text-[13px] font-medium hover:bg-linen-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Tables
          </Link>
        </header>

        <form
          className="flex flex-col gap-5 rounded-2xl bg-white p-5 shadow-card"
          onSubmit={(event) => {
            event.preventDefault();
            if (canStart) start.mutate();
          }}
        >
          <fieldset>
            <legend className={legend}>Platform</legend>
            <div className="grid grid-cols-2 gap-3">
              {PLATFORMS.map((platform) => {
                const chosen = platformCode === platform.code;
                return (
                  <button
                    key={platform.code}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => setPlatformCode(platform.code)}
                    className={[
                      'relative flex min-h-[84px] flex-col justify-between rounded-2xl p-4 text-left shadow-card transition-all active:scale-[0.99]',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                      chosen ? 'bg-chana-soft ring-2 ring-chana' : 'bg-white hover:bg-linen',
                    ].join(' ')}
                  >
                    <span className="text-[17px] font-semibold">{platform.name}</span>
                    <span className="text-[12px] text-steel">
                      {chosen ? 'Selected' : 'Tap to choose'}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="block">
            <span className={legend}>Platform order number</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={platformOrderId}
              maxLength={40}
              onChange={(event) => setPlatformOrderId(event.target.value)}
              placeholder="249377796192385"
              className={`${field} font-mono font-bold`}
            />
          </label>

          <label className="block">
            <span className={legend}>Customer name, optional</span>
            <input
              type="text"
              value={customerName}
              maxLength={100}
              onChange={(event) => setCustomerName(event.target.value)}
              className={field}
            />
          </label>

          {start.isError && (
            <p className="text-[13px] leading-[18px] text-mirch">
              {errorMessage(start.error)}{' '}
              {existingOrderId && (
                <Link to={`/orders/${existingOrderId}`} className="font-semibold underline underline-offset-4">
                  Open that order
                </Link>
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={!canStart}
            className="flex h-14 w-full items-center justify-center rounded-full bg-chana text-[15px] font-semibold text-ink shadow-card transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
          >
            {start.isPending ? 'Starting…' : 'Start the order →'}
          </button>
        </form>
      </div>
    </main>
  );
}
