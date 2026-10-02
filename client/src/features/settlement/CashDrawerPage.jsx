import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Money from '../../components/ui/Money.jsx';
import NumericKeypad from '../../components/ui/NumericKeypad.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { listCashMovements, recordCashMovement, voidCashMovement } from '../../api/dayClose.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatBusinessDate, formatTimeIst } from '../../utils/formatDate.js';
import { parseRupeesToPaise } from '../../utils/formatMoney.js';
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

/**
 * One form for every entry: pick what it is, type the amount on the keypad,
 * say what for. `types` is what this person may record, in the order they are
 * usually needed, so the opening float comes first until there is one.
 */
function EntryForm({ types, onDone, onError }) {
  const [type, setType] = useState(types[0]);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [round, setRound] = useState(0);
  const chosen = types.includes(type) ? type : types[0];
  const amountInPaise = parseRupeesToPaise(amount);
  const needsReason = chosen !== 'OPENING_FLOAT';

  const save = useMutation({
    mutationFn: () => recordCashMovement({ type: chosen, amountInPaise, reason: reason.trim() }),
    onSuccess: () => {
      setAmount('');
      setReason('');
      setRound((value) => value + 1);
      onDone(`${WORDS[chosen]} recorded.`);
    },
    onError,
  });

  return (
    <section className="grid gap-4 rounded-[10px] border border-line bg-surface p-4">
      <h2 className="type-heading">Record cash</h2>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="What it is">
        {types.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={chosen === option}
            onClick={() => setType(option)}
            className={[
              'type-label min-h-12 rounded-lg border px-2',
              chosen === option ? 'border-2 border-ink bg-sunken text-ink' : 'border-line bg-surface text-muted hover:text-ink',
            ].join(' ')}
          >
            {WORDS[option]}
          </button>
        ))}
      </div>
      <NumericKeypad key={`${chosen}-${round}`} title="Amount" prefix="₹" allowDecimal onChange={setAmount} hideActions />
      {needsReason && (
        <Input
          label="What for, required"
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={chosen === 'PAID_OUT' ? 'Milk from the dairy' : 'Change from the bank'}
        />
      )}
      <Button
        type="button"
        size="lg"
        disabled={!amountInPaise || amountInPaise <= 0 || (needsReason && !reason.trim())}
        isLoading={save.isPending}
        onClick={() => save.mutate()}
      >
        Record {WORDS[chosen].toLowerCase()}
      </Button>
    </section>
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
    <main className="v2 text-ink min-h-full bg-ground">
      <header className="px-4 pt-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div>
            <h1 className="type-title">Cash drawer</h1>
            <p className="type-caption text-muted">
              {query.data ? formatBusinessDate(query.data.businessDate) : 'Today'}. Cash from bills is added
              automatically.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-2xl gap-6 px-4 py-6">
        {query.isPending && <Spinner label="Loading the drawer" />}
        {query.isError && <p className="type-body text-alert">{errorMessage(query.error)}</p>}

        {query.isSuccess && (
          <ul className="divide-y divide-line rounded-[10px] border border-line bg-surface px-4">
            {movements.map((entry) => (
              <li key={entry.id} className={`flex items-center justify-between gap-3 py-3 ${entry.isVoided ? 'text-muted line-through': ''}`}>
                <span>
                  <span className="block type-body">{WORDS[entry.type]}</span>
                  <span className="block type-caption text-muted">
                    {formatTimeIst(entry.at)}
                    {entry.reason ? ` · ${entry.reason}` : ''}
                    {entry.isVoided ? ` · voided: ${entry.voidReason}` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="type-num tabular-nums">
                    {entry.type === 'PAID_OUT' ? '− ' : ''}
                    <Money paise={entry.amountInPaise} />
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
            {movements.length === 0 && <li className="py-4 type-body text-muted">Nothing recorded yet today. Start with the opening float.</li>}
          </ul>
        )}

        <EntryForm
          types={[!hasFloat && 'OPENING_FLOAT', 'PAID_IN', isManager && 'PAID_OUT'].filter(Boolean)}
          onDone={done}
          onError={fail}
        />
      </div>

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}
