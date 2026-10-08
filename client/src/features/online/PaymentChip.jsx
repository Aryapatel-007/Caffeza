/**
 * What happened to the money a guest paid online, on a staff card. P24.
 * A failed refund carries a retry for the owner and manager.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { retryRefund } from '../../api/online.js';
import { moneyText } from '../../components/ui/Money.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const LOOKS = {
  CREATED: { state: 'open', word: () => 'Waiting for payment' },
  PAID: { state: 'ok', word: (payment) => `Paid online ${moneyText(payment.amountInPaise)}` },
  REFUNDED: { state: 'free', word: (payment) => `Refunded ${moneyText(payment.refundedInPaise)}` },
  PARTLY_REFUNDED: { state: 'ok', word: (payment) => `Paid ${moneyText(payment.amountInPaise)}, ${moneyText(payment.refundedInPaise)} refunded` },
  REFUND_FAILED: { state: 'alert', word: () => 'Refund failed' },
  FORFEITED: { state: 'bill', word: (payment) => `Deposit kept ${moneyText(payment.amountInPaise)}` },
  EXPIRED: { state: 'free', word: () => 'Not paid' },
  FAILED: { state: 'free', word: () => 'Not paid' },
};

export default function PaymentChip({ payment }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => retryRefund(payment.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['online'] }),
  });
  if (!payment) return null;
  const look = LOOKS[payment.status] ?? LOOKS.PAID;
  const canRetry = payment.status === 'REFUND_FAILED' && ['OWNER', 'MANAGER'].includes(user?.role);

  return (
    <span className="flex flex-wrap items-center gap-2">
      <StateChip state={look.state} word={look.word(payment)} size="sm" />
      {canRetry && (
        <button
          type="button"
          disabled={retry.isPending}
          onClick={() => retry.mutate()}
          className="type-label min-h-12 rounded-lg px-3 text-alert underline underline-offset-4 disabled:opacity-50"
        >
          Retry refund
        </button>
      )}
    </span>
  );
}
