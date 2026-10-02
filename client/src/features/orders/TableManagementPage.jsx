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
    <main className="v2 text-ink min-h-full bg-ground">
      <header className="px-4 pt-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <h1 className="type-title">Tables</h1>
          <span className="flex items-center gap-2">
          {/* P19. The floor plan editor. */}
          <Link
            to="/tables/arrange"
            className="type-label flex min-h-12 items-center rounded-lg border border-ink bg-surface text-ink hover:bg-sunken px-4"
          >
            Arrange tables
          </Link>
          <Link
            to="/floor"
            className="flex min-h-12 items-center rounded-lg px-3 type-caption text-muted hover:bg-sunken"
          >
            Floor
          </Link>
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <form
          className="mb-8 flex flex-wrap items-end gap-3 border-b border-line pb-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.name.trim()) add.mutate();
          }}
        >
          <label className="flex-1 basis-32">
            <span className="mb-2 block type-label text-muted">
              Name
            </span>
            <input
              value={draft.name}
              maxLength={20}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="T1"
              className="min-h-12 w-full rounded-lg border border-muted bg-surface px-3 type-body placeholder:text-muted"
            />
          </label>

          <label className="flex-1 basis-40">
            <span className="mb-2 block type-label text-muted">
              Section
            </span>
            <input
              value={draft.section}
              maxLength={40}
              onChange={(event) => setDraft({ ...draft, section: event.target.value })}
              placeholder="Ground Floor"
              className="min-h-12 w-full rounded-lg border border-muted bg-surface px-3 type-body placeholder:text-muted"
            />
          </label>

          <label className="basis-24">
            <span className="mb-2 block type-label text-muted">
              Seats
            </span>
            <input
              value={draft.seats}
              inputMode="numeric"
              onChange={(event) => setDraft({ ...draft, seats: event.target.value })}
              className="min-h-12 w-full rounded-lg border border-muted bg-surface px-3 type-num"
            />
          </label>

          <button
            type="submit"
            disabled={!draft.name.trim() || isBusy}
            className="min-h-12 rounded-lg bg-accent px-5 type-button text-on-accent disabled:opacity-50"
          >
            Add table
          </button>
        </form>

        {tables.isPending && <p className="type-body text-muted">Loading tables…</p>}
        {tables.isError && <p className="type-body text-alert">{errorMessage(tables.error)}</p>}

        {tables.isSuccess && tables.data.length === 0 && (
          <p className="type-body text-muted">
            No tables yet. Add the first one above.
          </p>
        )}

        <ul className="divide-y divide-line">
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
        className="min-h-12 w-24 rounded-lg border-2 border-transparent bg-transparent px-2 type-body hover:border-muted"
      />

      <span className="flex-1 type-caption text-muted">
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
          className="type-label min-h-12 rounded-lg border border-ink bg-surface text-ink hover:bg-sunken px-4 disabled:opacity-50"
        >
          Save name
        </button>
      )}

      <button
        type="button"
        disabled={isBusy}
        onClick={onToggle}
        className={[
          'min-h-12 rounded-lg border-2 px-4 type-caption',
          'focus-visible:outline-2 focus-visible:outline-offset-2',
          'disabled:opacity-50',
          table.isActive
            ? 'border-muted text-muted focus-visible:outline-accent'
            : 'border-ink text-ink focus-visible:outline-accent',
        ].join(' ')}
      >
        {table.isActive ? 'Turn off' : 'Turn on'}
      </button>
    </li>
  );
}
