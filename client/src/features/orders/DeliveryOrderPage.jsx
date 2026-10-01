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

  return (
    <main className="min-h-full bg-paper">
      <header className="border-b border-black/5 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold leading-7">New delivery</h1>
          <Link
            to="/floor"
            className="flex h-12 items-center rounded-xl px-3 text-[13px] font-medium text-steel hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            Floor
          </Link>
        </div>
      </header>

      <form
        className="mx-auto max-w-xl px-4 py-6 sm:px-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (canStart) start.mutate();
        }}
      >
        <fieldset className="mb-6">
          <legend className="mb-2 text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
            Platform
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {PLATFORMS.map((platform) => {
              const chosen = platformCode === platform.code;
              return (
                <button
                  key={platform.code}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => setPlatformCode(platform.code)}
                  className={[
                    'h-16 rounded-xl border-2 text-[17px] font-semibold',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                    chosen ? 'border-ink bg-chana/20' : 'border-steel/40',
                  ].join(' ')}
                >
                  {platform.name}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="mb-4 block">
          <span className="mb-2 block text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
            Platform order number
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={platformOrderId}
            maxLength={40}
            onChange={(event) => setPlatformOrderId(event.target.value)}
            placeholder="249377796192385"
            className="h-12 w-full rounded-xl border-2 border-steel/40 bg-paper px-3 font-mono text-[15px] leading-[22px] placeholder:text-steel focus:border-ink focus:outline-none"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-2 block text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
            Customer name, optional
          </span>
          <input
            type="text"
            value={customerName}
            maxLength={100}
            onChange={(event) => setCustomerName(event.target.value)}
            className="h-12 w-full rounded-xl border-2 border-steel/40 bg-paper px-3 text-[15px] leading-[22px] focus:border-ink focus:outline-none"
          />
        </label>

        {start.isError && (
          <p className="mb-4 text-[13px] leading-[18px] text-mirch">
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
          className="h-14 w-full rounded-xl bg-chana text-[15px] font-semibold text-ink transition-transform active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
        >
          {start.isPending ? 'Starting…' : 'Start the order'}
        </button>
      </form>
    </main>
  );
}
