import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import Button from '../../components/ui/Button.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import Input from '../../components/ui/Input.jsx';
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
    <main className="v2 min-h-full bg-ground px-4 py-4 text-ink sm:px-6">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <header>
          <h1 className="type-title">Takeaway</h1>
          <p className="type-caption text-muted">Both fields are optional. Add them if the customer wants a call when it is ready.</p>
        </header>

        <form
          className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            start.mutate();
          }}
        >
          <Input label="Guest name" value={customerName} maxLength={100} onChange={(event) => setCustomerName(event.target.value)} />
          <Input
            label="Phone"
            type="tel"
            inputMode="numeric"
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
            placeholder="9876543210"
          />

          {start.isError && <ErrorState error={errorMessage(start.error)} />}

          <Button type="submit" size="lg" fullWidth isLoading={start.isPending}>
            {start.isPending ? 'Starting…' : 'Start the order'}
          </Button>
        </form>
      </div>
    </main>
  );
}
