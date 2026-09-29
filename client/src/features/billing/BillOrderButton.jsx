import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { createBill } from '../../api/bills.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../users/roles.js';
import { errorMessage, existingBillId } from './errorCopy.js';
import { BILL_LABELS } from './labels.js';

const CAN_BILL = [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER];

/**
 * The order screen's one link into M3.
 *
 * Kept in features/billing/ rather than written inline on OrderScreenPage
 * (which CONVENTIONS section 10 already flags as close to the file-length
 * limit) so the billing-specific role check and error handling for creating a
 * bill live beside the rest of this module, not scattered into M2's.
 *
 * `order.billId` already existing means a bill was created here before —
 * possibly by this same cashier reloading the page, possibly by a colleague on
 * another till — so the button reopens it rather than trying to create a
 * second one.
 */
export default function BillOrderButton({ order }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [error, setError] = useState(null);

  const mutation = useMutation({
    mutationFn: () => createBill({ orderId: order.id, version: order.version }),
    onSuccess: (bill) => navigate(`/bills/${bill.id}`),
    onError: (mutationError) => {
      const raced = existingBillId(mutationError);
      if (raced) {
        navigate(`/bills/${raced}`);
        return;
      }
      setError(errorMessage(mutationError));
    },
  });

  if (order.billId) {
    return (
      <button
        type="button"
        onClick={() => navigate(`/bills/${order.billId}`)}
        className="flex h-12 items-center rounded-[10px] border-2 border-ink bg-chana px-4 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {BILL_LABELS.openBill.en}
      </button>
    );
  }

  if (order.status !== 'READY_TO_BILL' || !CAN_BILL.includes(user?.role)) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="flex h-12 items-center rounded-[10px] border-2 border-ink bg-chana px-4 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
      >
        {mutation.isPending ? 'Billing…' : BILL_LABELS.billThisOrder.en}
      </button>
      {error && <p className="text-[12px] text-mirch">{error}</p>}
    </div>
  );
}
