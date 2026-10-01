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
    <main className="min-h-full bg-paper">
      <header className="border-b border-black/5 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold leading-7">New takeaway</h1>
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
          start.mutate();
        }}
      >
        <p className="mb-6 text-[15px] leading-[22px] text-steel">
          Both fields are optional. Add them if the customer wants a call when it is ready.
        </p>

        <label className="mb-4 block">
          <span className="mb-2 block text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
            Customer name
          </span>
          <input
            type="text"
            value={customerName}
            maxLength={100}
            onChange={(event) => setCustomerName(event.target.value)}
            className="h-12 w-full rounded-xl border-2 border-steel/40 bg-paper px-3 text-[15px] leading-[22px] focus:border-ink focus:outline-none"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-2 block text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
            Phone
          </span>
          {/* A phone number is digits, so it is Mono. */}
          <input
            type="tel"
            inputMode="numeric"
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
            placeholder="9876543210"
            className="h-12 w-full rounded-xl border-2 border-steel/40 bg-paper px-3 font-mono text-[15px] leading-[22px] placeholder:text-steel focus:border-ink focus:outline-none"
          />
        </label>

        {start.isError && (
          <p className="mb-4 text-[13px] leading-[18px] text-mirch">
            {errorMessage(start.error)}
          </p>
        )}

        <button
          type="submit"
          disabled={start.isPending}
          className="h-14 w-full rounded-xl bg-chana text-[15px] font-semibold text-ink transition-transform active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
        >
          {start.isPending ? 'Starting…' : 'Start the order'}
        </button>
      </form>
    </main>
  );
}
