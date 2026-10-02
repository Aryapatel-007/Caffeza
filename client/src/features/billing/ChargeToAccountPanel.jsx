import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { listAccounts } from '../../api/accounts.js';

import { errorMessage } from './errorCopy.js';
import { LABELS } from '../i18n/labels.js';
import Sheet from '../../components/ui/Sheet.jsx';
import Money from '../../components/ui/Money.jsx';

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
    <Sheet title="Charge to account" onCancel={onCancel}>
      <p className="mb-4 type-caption text-muted">
        On Hold: <span className="font-mono text-ink"><Money paise={owedInPaise} /></span> goes on the
        account and is collected later.
      </p>

      <label className="mb-3 block">
        <span className="mb-1 block type-label text-muted">
          Find an account
        </span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="W-330 Office"
          className="w-full rounded-lg min-h-12 border border-muted bg-surface px-3 py-2 type-body placeholder:text-muted"
        />
      </label>

      {query.isPending && <p className="type-caption text-muted">Loading accounts…</p>}
      {query.isError && <p className="type-caption text-alert">{errorMessage(query.error)}</p>}

      <ul className="mb-4 divide-y divide-line">
        {accounts.map((account) => (
          <li key={account.id}>
            <button
              type="button"
              aria-pressed={chosen?.id === account.id}
              onClick={() => setChosen(account)}
              className={[
                'flex min-h-[52px] w-full items-center justify-between gap-3 px-2 text-left',
                '',
                chosen?.id === account.id ? 'bg-sunken font-semibold' : 'hover:bg-sunken',
              ].join(' ')}
            >
              <span className="type-body">{account.name}</span>
              <span className="type-num-meta text-muted"><Money paise={account.outstandingInPaise} /></span>
            </button>
          </li>
        ))}
        {query.isSuccess && accounts.length === 0 && (
          <li className="py-3 type-caption text-muted">No account matches.</li>
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
            className="min-w-0 flex-1 rounded-lg min-h-12 border border-muted bg-surface px-3 py-2 type-body"
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
            className="min-h-12 rounded-lg border border-line px-3 type-caption disabled:opacity-50"
          >
            Add
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mb-4 min-h-12 type-caption text-accent underline-offset-4 underline"
        >
          Add account
        </button>
      )}

      {error && <p className="mb-3 type-caption text-alert">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-14 flex-1 rounded-lg border border-ink bg-surface type-button text-ink hover:bg-sunken"
        >
          {LABELS.cancel}
        </button>
        <button
          type="button"
          disabled={!chosen || isBusy}
          onClick={() => onConfirm(chosen.id)}
          className="min-h-14 flex-[2] rounded-lg bg-accent type-button text-on-accent disabled:opacity-50"
        >
          {isBusy ? 'Charging…' : chosen ? `Charge to ${chosen.name}` : 'Choose an account'}
        </button>
      </div>
    </Sheet>
  );
}
