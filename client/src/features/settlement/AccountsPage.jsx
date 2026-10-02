import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Toast from '../../components/ui/Toast.jsx';
import {
  adjustAccount,
  createAccount,
  getStatement,
  listAccounts,
  recordCollection,
} from '../../api/accounts.js';
import { listPaymentMethods } from '../../api/paymentMethods.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatBusinessDate } from '../../utils/formatDate.js';
import { parseRupeesToPaise } from '../../utils/formatMoney.js';
import { errorMessage } from '../billing/errorCopy.js';
import { ROLES } from '../users/roles.js';
import Money, { moneyText } from '../../components/ui/Money.jsx';

/**
 * On Hold accounts. P09.
 *
 * Every account with what it owes and the date of the oldest money still owed,
 * highest balance first. A cashier sees the list and records collections; the
 * statement and new accounts are for the owner and manager, and adjusting a
 * balance is the owner's. The server enforces each of those.
 */
const ENTRY_WORDS = {
  OPENING: 'Opening balance',
  CHARGE: 'Charged',
  CHARGE_REVERSED: 'Charge reversed',
  COLLECTION: 'Collection',
  ADJUSTMENT: 'Adjustment',
};

function MoneyField({ label, value, onChange }) {
  return (
    <Input
      label={label}
      inputMode="decimal"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="0.00"
    />
  );
}

function CollectionForm({ account, onDone, onError }) {
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: () => listPaymentMethods() });
  const inHand = (methods.data ?? []).filter((entry) => entry.kind === 'IN_HAND');
  const amountInPaise = parseRupeesToPaise(amount);

  const save = useMutation({
    mutationFn: () => recordCollection(account.id, { method, amountInPaise, reference }),
    onSuccess: onDone,
    onError,
  });

  return (
    <div className="grid gap-3 rounded-lg border border-line p-3">
      <p className="type-body font-semibold">Record collection</p>
      <div className="flex flex-wrap gap-2">
        {inHand.map((entry) => (
          <button
            key={entry.code}
            type="button"
            aria-pressed={method === entry.code}
            onClick={() => setMethod(entry.code)}
            className={[
              'min-h-12 rounded-lg border-2 px-4 type-body font-semibold',
              method === entry.code ? 'border-ink bg-sunken' : 'border-muted text-muted',
            ].join(' ')}
          >
            {entry.name}
          </button>
        ))}
      </div>
      <MoneyField label={`Amount, up to ${moneyText(account.outstandingInPaise)}`} value={amount} onChange={setAmount} />
      <Input label="Reference, optional" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
      <div>
        <Button
          type="button"
          disabled={!amountInPaise || amountInPaise <= 0}
          isLoading={save.isPending}
          onClick={() => save.mutate()}
        >
          Record collection
        </Button>
      </div>
    </div>
  );
}

function AdjustForm({ account, onDone, onError }) {
  const [direction, setDirection] = useState('DOWN');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const amountInPaise = parseRupeesToPaise(amount);

  const save = useMutation({
    mutationFn: () => adjustAccount(account.id, { direction, amountInPaise, reason: reason.trim() }),
    onSuccess: onDone,
    onError,
  });

  return (
    <div className="grid gap-3 rounded-lg border border-line p-3">
      <p className="type-body font-semibold">Adjust balance</p>
      <div className="grid grid-cols-2 gap-2">
        {[
          { value: 'DOWN', label: 'Owes less' },
          { value: 'UP', label: 'Owes more' },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={direction === option.value}
            onClick={() => setDirection(option.value)}
            className={[
              'min-h-12 rounded-lg border-2 type-body font-semibold',
              direction === option.value ? 'border-ink bg-sunken' : 'border-muted text-muted',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>
      <MoneyField label="Amount" value={amount} onChange={setAmount} />
      <Input label="Reason, required" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div>
        <Button
          type="button"
          disabled={!amountInPaise || amountInPaise <= 0 || !reason.trim()}
          isLoading={save.isPending}
          onClick={() => save.mutate()}
        >
          Save adjustment
        </Button>
      </div>
    </div>
  );
}

function Statement({ account }) {
  const query = useQuery({
    queryKey: ['account-statement', account.id, account.outstandingInPaise],
    queryFn: () => getStatement(account.id),
  });
  if (query.isPending) return <Spinner label="Loading the statement" />;
  if (query.isError) return <p className="type-caption text-alert">{errorMessage(query.error)}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full type-caption">
        <thead>
          <tr className="border-b border-line text-left type-caption text-muted">
            <th className="py-2 pr-3 font-medium">Business date</th>
            <th className="py-2 pr-3 font-medium">Entry</th>
            <th className="py-2 pr-3 text-right font-medium">Amount</th>
            <th className="py-2 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {query.data.entries.map((entry) => (
            <tr key={entry.id}>
              <td className="py-2 pr-3 font-mono">{entry.businessDate}</td>
              <td className="py-2 pr-3">
                {ENTRY_WORDS[entry.type]}
                {entry.billNumber ? ` · ${entry.billNumber}` : ''}
                {entry.methodName ? ` · ${entry.methodName}` : ''}
                {entry.note ? ` · ${entry.note}` : ''}
              </td>
              <td className="py-2 pr-3 text-right font-mono">
                {entry.direction === 'DOWN' ? '− ' : ''}
                <Money paise={entry.amountInPaise} />
              </td>
              <td className="py-2 text-right font-mono"><Money paise={entry.balanceInPaise} tabular /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {query.data.entries.length === 0 && <p className="py-3 type-caption text-muted">Nothing recorded yet. Charges and collections appear here as they happen.</p>}
    </div>
  );
}

export default function AccountsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);
  const [newName, setNewName] = useState('');
  const [newOpening, setNewOpening] = useState('');

  const isManager = [ROLES.OWNER, ROLES.MANAGER].includes(user?.role);
  const isOwner = user?.role === ROLES.OWNER;

  const query = useQuery({ queryKey: ['accounts'], queryFn: () => listAccounts() });
  const refresh = (message) => {
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    queryClient.invalidateQueries({ queryKey: ['account-statement'] });
    setToast({ tone: 'success', message });
  };
  const fail = (error) => setToast({ tone: 'error', message: errorMessage(error) });

  const create = useMutation({
    mutationFn: () =>
      createAccount({
        name: newName.trim(),
        openingBalanceInPaise: newOpening ? parseRupeesToPaise(newOpening) ?? 0 : 0,
      }),
    onSuccess: () => {
      setNewName('');
      setNewOpening('');
      refresh('Account added.');
    },
    onError: fail,
  });

  const accounts = [...(query.data ?? [])].sort((a, b) => b.outstandingInPaise - a.outstandingInPaise);

  return (
    <main className="v2 text-ink min-h-full bg-ground">
      <header className="px-4 pt-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div>
            <h1 className="type-title">On Hold accounts</h1>
            <p className="type-caption text-muted">Bills charged to a name, collected later.</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-2xl gap-6 px-4 py-6">
        {query.isPending && <Spinner label="Loading accounts" />}
        {query.isError && <p className="type-body text-alert">{errorMessage(query.error)}</p>}

        <ul className="divide-y divide-line border-y border-line">
          {accounts.map((account) => {
            const open = openId === account.id;
            return (
              <li key={account.id} className="py-3">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : account.id)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 text-left"
                >
                  <span>
                    <span className="block type-body font-semibold">{account.name}</span>
                    <span className="block type-caption text-muted">
                      {account.oldestUncollectedDate
                        ? `Owed since ${formatBusinessDate(account.oldestUncollectedDate)}`
                        : 'Nothing owed'}
                    </span>
                  </span>
                  <span className="type-num-tile"><Money paise={account.outstandingInPaise} /></span>
                </button>

                {open && (
                  <div className="mt-3 grid gap-4">
                    {isManager && <Statement account={account} />}
                    {account.outstandingInPaise > 0 && (
                      <CollectionForm
                        account={account}
                        onDone={() => refresh('Collection recorded.')}
                        onError={fail}
                      />
                    )}
                    {isOwner && (
                      <AdjustForm account={account} onDone={() => refresh('Balance adjusted.')} onError={fail} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {query.isSuccess && accounts.length === 0 && (
            <li className="py-4 type-body text-muted">No accounts yet. Add one for a regular who pays later.</li>
          )}
        </ul>

        {isManager && (
          <div className="grid gap-3 rounded-lg border border-line p-3">
            <p className="type-body font-semibold">Add account</p>
            <Input label="Name" maxLength={40} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <MoneyField label="Opening balance, optional" value={newOpening} onChange={setNewOpening} />
            <div>
              <Button type="button" disabled={!newName.trim()} isLoading={create.isPending} onClick={() => create.mutate()}>
                Add account
              </Button>
            </div>
          </div>
        )}
      </div>

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}
