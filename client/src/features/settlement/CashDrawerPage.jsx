import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { listCashMovements, recordCashMovement, voidCashMovement } from '../../api/dayClose.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatBusinessDate, formatTimeIst } from '../../utils/formatDate.js';
import { formatPaise, parseRupeesToPaise } from '../../utils/formatMoney.js';
import { errorMessage } from '../billing/errorCopy.js';
import { ROLES } from '../users/roles.js';
import InlineVoid from './InlineVoid.jsx';

/**
 * The cash drawer for today. P10. OWNER, MANAGER and CASHIER.
 *
 * The opening float, cash paid in and cash paid out, each with when. A
 * cashier records the float and cash paid in; taking cash out, and voiding an
 * entry, is a manager's. The server dates every entry today and enforces each
 * of those rules; this screen only leaves out what a cashier cannot use.
 */
const WORDS = { OPENING_FLOAT: 'Opening float', PAID_IN: 'Paid in', PAID_OUT: 'Paid out' };

function EntryForm({ type, onDone, onError }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const amountInPaise = parseRupeesToPaise(amount);
  const needsReason = type !== 'OPENING_FLOAT';

  const save = useMutation({
    mutationFn: () => recordCashMovement({ type, amountInPaise, reason: reason.trim() }),
    onSuccess: () => {
      setAmount('');
      setReason('');
      onDone(`${WORDS[type]} recorded.`);
    },
    onError,
  });

  return (
    <div className="grid gap-3 rounded-xl border border-black/5 shadow-card/20 p-3">
      <p className="text-[15px] font-semibold leading-6">{WORDS[type]}</p>
      <Input label="Amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
      {needsReason && (
        <Input
          label="What for, required"
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={type === 'PAID_OUT' ? 'Milk from the dairy' : 'Change from the bank'}
        />
      )}
      <div>
        <Button
          type="button"
          disabled={!amountInPaise || amountInPaise <= 0 || (needsReason && !reason.trim())}
          isLoading={save.isPending}
          onClick={() => save.mutate()}
        >
          Record {WORDS[type].toLowerCase()}
        </Button>
      </div>
    </div>
  );
}

export default function CashDrawerPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [toast, setToast] = useState(null);
  const isManager = [ROLES.OWNER, ROLES.MANAGER].includes(user?.role);

  const query = useQuery({ queryKey: ['cash-movements'], queryFn: () => listCashMovements() });
  const done = (message) => {
    queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
    setToast({ tone: 'success', message });
  };
  const fail = (error) => setToast({ tone: 'error', message: errorMessage(error) });

  const voiding = useMutation({
    mutationFn: ({ id, reason }) => voidCashMovement(id, reason),
    onSuccess: () => done('Entry voided.'),
    onError: fail,
  });

  const movements = query.data?.movements ?? [];
  const hasFloat = movements.some((entry) => entry.type === 'OPENING_FLOAT' && !entry.isVoided);

  return (
    <main className="min-h-full bg-paper">
      <header className="border-b border-black/5 px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold leading-7">Cash drawer</h1>
            <p className="text-[13px] leading-[18px] text-steel">
              {query.data ? formatBusinessDate(query.data.businessDate) : 'Today'}. Cash from bills is added
              automatically.
            </p>
          </div>
          <Link to="/dashboard" className="text-[13px] font-medium text-steel underline">
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-2xl gap-6 px-4 py-6">
        {query.isPending && <Spinner label="Loading the drawer" />}
        {query.isError && <p className="text-[15px] text-mirch">{errorMessage(query.error)}</p>}

        {query.isSuccess && (
          <ul className="divide-y divide-steel/15 border-y border-black/5/10">
            {movements.map((entry) => (
              <li key={entry.id} className={`flex items-center justify-between gap-3 py-3 ${entry.isVoided ? 'text-steel line-through' : ''}`}>
                <span>
                  <span className="block text-[15px] leading-[22px]">{WORDS[entry.type]}</span>
                  <span className="block text-[12px] leading-4 text-steel">
                    {formatTimeIst(entry.at)}
                    {entry.reason ? ` · ${entry.reason}` : ''}
                    {entry.isVoided ? ` · voided: ${entry.voidReason}` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-[15px]">
                    {entry.type === 'PAID_OUT' ? '− ' : ''}
                    {formatPaise(entry.amountInPaise)}
                  </span>
                  {isManager && !entry.isVoided && (
                    <InlineVoid
                      isBusy={voiding.isPending}
                      onConfirm={(reason) => voiding.mutate({ id: entry.id, reason })}
                    />
                  )}
                </span>
              </li>
            ))}
            {movements.length === 0 && <li className="py-4 text-[15px] text-steel">Nothing recorded yet today.</li>}
          </ul>
        )}

        {!hasFloat && <EntryForm type="OPENING_FLOAT" onDone={done} onError={fail} />}
        <EntryForm type="PAID_IN" onDone={done} onError={fail} />
        {isManager && <EntryForm type="PAID_OUT" onDone={done} onError={fail} />}
      </div>

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}
