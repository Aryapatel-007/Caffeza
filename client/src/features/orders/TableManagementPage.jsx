import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import Toast from '../../components/ui/Toast.jsx';
import { createTable, listTables, setTableActive, updateTable } from '../../api/orders.js';
import { errorMessage } from './errorCopy.js';

/**
 * Setting up the floor. Owner and manager only.
 *
 * Route-gated by RequireRole, which is a convenience: the server refuses these
 * endpoints to anyone else whether or not the screen is reachable.
 *
 * A list, not tiles. This is a back-office screen read top to bottom, unlike
 * the floor view, which is tapped.
 *
 * `includeInactive` is on here and off on the floor view. Without it a switched
 * off table would be invisible and could never be switched back on.
 */
export default function TableManagementPage() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState(null);
  const [draft, setDraft] = useState({ name: '', section: '', seats: '' });

  const tables = useQuery({
    queryKey: ['tables', { includeInactive: true }],
    queryFn: () => listTables({ includeInactive: true }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tables'] });

  const add = useMutation({
    mutationFn: () =>
      createTable({
        name: draft.name.trim(),
        ...(draft.section.trim() ? { section: draft.section.trim() } : {}),
        ...(draft.seats.trim() ? { seats: Number(draft.seats) } : {}),
      }),
    onSuccess: () => {
      setDraft({ name: '', section: '', seats: '' });
      setToast({ tone: 'success', message: 'Table added.' });
      refresh();
    },
    onError: (error) => setToast({ tone: 'error', message: errorMessage(error) }),
  });

  const rename = useMutation({
    mutationFn: ({ table, name }) => updateTable(table.id, { name }),
    onSuccess: () => {
      setToast({ tone: 'success', message: 'Table renamed.' });
      refresh();
    },
    onError: (error) => setToast({ tone: 'error', message: errorMessage(error) }),
  });

  const toggle = useMutation({
    mutationFn: ({ table }) => setTableActive(table.id, !table.isActive),
    onSuccess: (updated) => {
      setToast({
        tone: 'success',
        message: updated.isActive ? 'Table turned on.' : 'Table turned off.',
      });
      refresh();
    },
    // The server refuses to switch a table off while an order is open on it,
    // and its sentence names the order number. Show that, do not restate it.
    onError: (error) => setToast({ tone: 'error', message: errorMessage(error) }),
  });

  const isBusy = add.isPending || rename.isPending || toggle.isPending;

  return (
    <main className="min-h-full bg-paper">
      <header className="border-b-2 border-ink px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold leading-7">Tables</h1>
          <Link
            to="/floor"
            className="flex h-12 items-center rounded-[10px] px-3 text-[13px] font-medium text-steel hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            Floor
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <form
          className="mb-8 flex flex-wrap items-end gap-3 border-b-2 border-ink/10 pb-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.name.trim()) add.mutate();
          }}
        >
          <label className="flex-1 basis-32">
            <span className="mb-2 block text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
              Name
            </span>
            <input
              value={draft.name}
              maxLength={20}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="T1"
              className="h-12 w-full rounded-[10px] border-2 border-steel/40 bg-paper px-3 text-[15px] placeholder:text-steel focus:border-ink focus:outline-none"
            />
          </label>

          <label className="flex-1 basis-40">
            <span className="mb-2 block text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
              Section
            </span>
            <input
              value={draft.section}
              maxLength={40}
              onChange={(event) => setDraft({ ...draft, section: event.target.value })}
              placeholder="Ground Floor"
              className="h-12 w-full rounded-[10px] border-2 border-steel/40 bg-paper px-3 text-[15px] placeholder:text-steel focus:border-ink focus:outline-none"
            />
          </label>

          <label className="basis-24">
            <span className="mb-2 block text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
              Seats
            </span>
            <input
              value={draft.seats}
              inputMode="numeric"
              onChange={(event) => setDraft({ ...draft, seats: event.target.value })}
              className="h-12 w-full rounded-[10px] border-2 border-steel/40 bg-paper px-3 font-mono text-[15px] focus:border-ink focus:outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={!draft.name.trim() || isBusy}
            className="h-12 rounded-[10px] bg-chana px-5 text-[15px] font-semibold text-ink transition-transform active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
          >
            Add table
          </button>
        </form>

        {tables.isPending && <p className="text-[15px] text-steel">Loading tables…</p>}
        {tables.isError && <p className="text-[15px] text-mirch">{errorMessage(tables.error)}</p>}

        {tables.isSuccess && tables.data.length === 0 && (
          <p className="text-[15px] leading-[22px] text-steel">
            No tables yet. Add the first one above.
          </p>
        )}

        <ul className="divide-y divide-steel/20">
          {(tables.data ?? []).map((table) => (
            <TableRow
              key={table.id}
              table={table}
              isBusy={isBusy}
              onRename={(name) => rename.mutate({ table, name })}
              onToggle={() => toggle.mutate({ table })}
            />
          ))}
        </ul>
      </div>

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}

function TableRow({ table, isBusy, onRename, onToggle }) {
  const [name, setName] = useState(table.name);
  const isDirty = name.trim() !== table.name && name.trim().length > 0;

  return (
    <li className={['flex flex-wrap items-center gap-3 py-3', table.isActive ? '' : 'opacity-60'].join(' ')}>
      <input
        value={name}
        maxLength={20}
        onChange={(event) => setName(event.target.value)}
        aria-label={`Name of table ${table.name}`}
        className="h-12 w-24 rounded-[10px] border-2 border-transparent bg-transparent px-2 text-[15px] leading-[22px] hover:border-steel/30 focus:border-ink focus:outline-none"
      />

      <span className="flex-1 text-[13px] leading-[18px] text-steel">
        {table.section ?? 'No section'}
        {table.seats != null && <span className="font-mono"> · {table.seats} seats</span>}
        {table.occupancy.isOccupied && (
          <span className="font-mono"> · order #{table.occupancy.orderNumber} open</span>
        )}
      </span>

      {isDirty && (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onRename(name.trim())}
          className="h-12 rounded-[10px] bg-chana px-4 text-[13px] font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          Save name
        </button>
      )}

      <button
        type="button"
        disabled={isBusy}
        onClick={onToggle}
        className={[
          'h-12 rounded-[10px] border-2 px-4 text-[13px] font-medium',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
          'disabled:opacity-50',
          table.isActive
            ? 'border-steel/40 text-steel focus-visible:outline-steel'
            : 'border-ink text-ink focus-visible:outline-ink',
        ].join(' ')}
      >
        {table.isActive ? 'Turn off' : 'Turn on'}
      </button>
    </li>
  );
}
