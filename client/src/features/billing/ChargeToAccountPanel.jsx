import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { listAccounts } from '../../api/accounts.js';
import { formatPaise } from '../../utils/formatMoney.js';
import { errorMessage } from './errorCopy.js';
import { BILL_LABELS } from './labels.js';
import PanelShell from './PanelShell.jsx';

/**
 * Charging a bill to an On Hold account. P09. OWNER and MANAGER.
 *
 * A searchable list of active accounts with what each already owes, and "Add
 * account" for someone new. Only what is still owed on the bill goes on the
 * account; the bill becomes On Hold and the table frees.
 */
export default function ChargeToAccountPanel({ owedInPaise, isBusy, error, onCancel, onConfirm, onCreate }) {
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const query = useQuery({ queryKey: ['accounts'], queryFn: () => listAccounts() });
  const term = search.trim().toLowerCase();
  const accounts = (query.data ?? []).filter((account) => account.name.toLowerCase().includes(term));

  return (
    <PanelShell title="Charge to account" onCancel={onCancel}>
      <p className="mb-4 text-[13px] leading-[18px] text-steel">
        On Hold: <span className="font-mono text-ink">{formatPaise(owedInPaise)}</span> goes on the
        account and is collected later.
      </p>

      <label className="mb-3 block">
        <span className="mb-1 block text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
          Find an account
        </span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="W-330 Office"
          className="w-full rounded-xl border-2 border-steel/40 bg-paper px-3 py-2 text-[15px] leading-[22px] placeholder:text-steel focus:border-ink focus:outline-none"
        />
      </label>

      {query.isPending && <p className="text-[13px] text-steel">Loading accounts…</p>}
      {query.isError && <p className="text-[13px] text-mirch">{errorMessage(query.error)}</p>}

      <ul className="mb-4 divide-y divide-steel/15">
        {accounts.map((account) => (
          <li key={account.id}>
            <button
              type="button"
              aria-pressed={chosen?.id === account.id}
              onClick={() => setChosen(account)}
              className={[
                'flex min-h-[52px] w-full items-center justify-between gap-3 px-2 text-left',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                chosen?.id === account.id ? 'bg-chana/20' : '',
              ].join(' ')}
            >
              <span className="text-[15px] leading-[22px]">{account.name}</span>
              <span className="font-mono text-[13px] text-steel">{formatPaise(account.outstandingInPaise)}</span>
            </button>
          </li>
        ))}
        {query.isSuccess && accounts.length === 0 && (
          <li className="py-3 text-[13px] text-steel">No account matches.</li>
        )}
      </ul>

      {adding ? (
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={newName}
            maxLength={40}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New account name"
            className="min-w-0 flex-1 rounded-xl border-2 border-steel/40 bg-paper px-3 py-2 text-[15px] focus:border-ink focus:outline-none"
          />
          <button
            type="button"
            disabled={!newName.trim()}
            onClick={async () => {
              const created = await onCreate(newName.trim());
              if (created) {
                setChosen(created);
                setAdding(false);
                setNewName('');
                query.refetch();
              }
            }}
            className="min-h-[48px] rounded-xl border border-black/5 shadow-card px-3 text-[13px] font-semibold disabled:opacity-50"
          >
            Add
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mb-4 min-h-[44px] text-[13px] font-medium text-steel underline"
        >
          Add account
        </button>
      )}

      {error && <p className="mb-3 text-[13px] leading-[18px] text-mirch">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-14 flex-1 rounded-xl border-2 border-steel/40 text-[15px] font-semibold text-steel"
        >
          {BILL_LABELS.cancel.en}
        </button>
        <button
          type="button"
          disabled={!chosen || isBusy}
          onClick={() => onConfirm(chosen.id)}
          className="h-14 flex-[2] rounded-xl bg-chana text-[15px] font-semibold text-ink transition-transform duration-100 active:translate-y-0.5 disabled:opacity-50"
        >
          {isBusy ? 'Charging…' : chosen ? `Charge to ${chosen.name}` : 'Choose an account'}
        </button>
      </div>
    </PanelShell>
  );
}
