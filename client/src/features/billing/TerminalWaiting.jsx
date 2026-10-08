import { useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { cancelTerminalPayment, readTerminalPayment } from '../../api/terminalPayments.js';
import Button from '../../components/ui/Button.jsx';
import Money from '../../components/ui/Money.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import { errorMessage } from './errorCopy.js';

const FINISHED = ['APPROVED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'UNKNOWN'];
const WORDS = {
  WAITING: ['open', 'Waiting for the machine'],
  APPROVED: ['ok', 'Approved'],
  DECLINED: ['alert', 'Declined'],
  CANCELLED: ['free', 'Cancelled'],
  EXPIRED: ['free', 'Not finished in time'],
  UNKNOWN: ['alert', 'Check the machine'],
};

/**
 * A payment sent to the card machine, until it finishes. P25 Part I5.
 *
 * The PTRID is large enough to read off the screen and pick on the machine.
 * The status is asked every 3 seconds; the server asks Pine Labs. Approved
 * hands back to the bill, which is now paid by that much.
 */
export default function TerminalWaiting({ transaction, onFinished, onDismiss }) {
  const status = useQuery({
    queryKey: ['terminal-payment', transaction.id],
    queryFn: () => readTerminalPayment(transaction.id),
    initialData: transaction,
    refetchInterval: (query) => (FINISHED.includes(query.state.data?.status) ? false : 3_000),
  });
  const cancel = useMutation({ mutationFn: () => cancelTerminalPayment(transaction.id) });
  const current = cancel.data ?? status.data;
  const finished = FINISHED.includes(current.status);

  // Once per payment: the parent passes a new callback every render.
  const told = useRef(false);
  useEffect(() => {
    if (finished && !told.current) {
      told.current = true;
      onFinished?.(current);
    }
  }, [finished, current, onFinished]);

  const [state, word] = WORDS[current.status] ?? WORDS.WAITING;
  return (
    <div className="grid gap-3 rounded-[10px] border border-line bg-surface p-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-heading">
          <Money paise={current.amountInPaise} /> on {current.terminal.name}
        </p>
        <StateChip state={state} word={word} />
      </div>
      {current.ptrid && !finished && (
        <p className="grid gap-1">
          <span className="type-caption text-muted">Pick this on the machine</span>
          <span className="type-num-hero tracking-wider">{current.ptrid}</span>
        </p>
      )}
      {current.lastMessage && finished && current.status !== 'APPROVED' && <p className="type-body text-muted">{current.lastMessage}</p>}
      {cancel.isError && <p className="type-body text-alert">{errorMessage(cancel.error)}</p>}
      {!finished ? (
        <Button variant="secondary" isLoading={cancel.isPending} onClick={() => cancel.mutate()}>
          Cancel on the machine
        </Button>
      ) : (
        <Button variant="secondary" onClick={onDismiss}>
          {current.status === 'APPROVED' ? 'Done' : 'Try again'}
        </Button>
      )}
    </div>
  );
}
