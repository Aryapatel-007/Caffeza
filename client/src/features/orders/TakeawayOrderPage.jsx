import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import { createOrder } from '../../api/orders.js';
import { errorMessage } from './errorCopy.js';

/**
 * Starting a takeaway order.
 *
 * A takeaway has no table and no guest count, and the request schema refuses
 * both rather than ignoring them. The customer's name and phone are optional:
 * plenty of counter sales are anonymous and making someone type a phone number
 * to sell a chai would be worse than useless.
 *
 * Once it exists this hands straight over to the order screen, which is the
 * same screen a dine-in order uses. There is only one place lines are added.
 */
export default function TakeawayOrderPage() {
  const navigate = useNavigate();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const start = useMutation({
    mutationFn: () =>
      createOrder({
        orderType: 'TAKEAWAY',
        // Empty means absent. Sending "" would fail validation, and rightly:
        // an empty string is not a name.
        ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
        ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
      }),
    onSuccess: (order) => navigate(`/orders/${order.id}`),
  });

  return (
    <main className="min-h-full bg-paper px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <header className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-center gap-3">
            <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-chana" />
            <h1 className="text-[20px] font-semibold leading-7">Takeaway counter</h1>
          </div>
          <Link
            to="/floor"
            className="flex h-11 items-center rounded-full bg-linen px-4 text-[13px] font-medium hover:bg-linen-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Tables
          </Link>
        </header>

        <form
          className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card"
          onSubmit={(event) => {
            event.preventDefault();
            start.mutate();
          }}
        >
          <p className="text-[14px] leading-5 text-steel">
            Both fields are optional. Add them if the customer wants a call when it is ready.
          </p>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-steel">
              Guest name
            </span>
            <input
              type="text"
              value={customerName}
              maxLength={100}
              onChange={(event) => setCustomerName(event.target.value)}
              className="h-12 w-full rounded-xl bg-linen px-4 text-[15px] focus:bg-white focus:outline-none focus:ring-2 focus:ring-chana"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-steel">
              Phone
            </span>
            {/* A phone number is digits, so it is Mono. */}
            <input
              type="tel"
              inputMode="numeric"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              placeholder="9876543210"
              className="h-12 w-full rounded-xl bg-linen px-4 font-mono text-[15px] placeholder:text-steel focus:bg-white focus:outline-none focus:ring-2 focus:ring-chana"
            />
          </label>

          {start.isError && (
            <p className="text-[13px] leading-[18px] text-mirch">{errorMessage(start.error)}</p>
          )}

          <button
            type="submit"
            disabled={start.isPending}
            className="flex h-14 w-full items-center justify-center rounded-full bg-chana text-[15px] font-semibold text-ink shadow-card transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
          >
            {start.isPending ? 'Starting…' : 'Start the order →'}
          </button>
        </form>
      </div>
    </main>
  );
}
