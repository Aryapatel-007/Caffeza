import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Sheet, { SheetActions } from '../../components/ui/Sheet.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { createTable, deleteTable, listTables, setTableActive, updateTable } from '../../api/orders.js';
import { errorMessage } from './errorCopy.js';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

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
 *
 * Each row can be edited (name, section and seats, in a sheet), turned off or
 * on, and deleted. Delete removes only a table no order has ever been on; the
 * server refuses a used one and says to turn it off instead, so old bills keep
 * their table (API-CONTRACT 11.6).
 */
export default function TableManagementPage() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState(null);
  const [draft, setDraft] = useState({ name: '', section: '', seats: '' });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

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

  const save = useMutation({
    mutationFn: ({ table, body }) => updateTable(table.id, body),
    onSuccess: () => {
      setEditing(null);
      setToast({ tone: 'success', message: 'Table saved.' });
      refresh();
    },
    onError: (error) => setToast({ tone: 'error', message: errorMessage(error) }),
  });

  const remove = useMutation({
    mutationFn: ({ table }) => deleteTable(table.id),
    onSuccess: () => {
      setDeleting(null);
      setToast({ tone: 'success', message: 'Table deleted.' });
      refresh();
    },
    // A used table is refused, with the server's sentence saying to turn it off.
    onError: (error) => {
      setDeleting(null);
      setToast({ tone: 'error', message: errorMessage(error) });
    },
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

  const isBusy = add.isPending || save.isPending || remove.isPending || toggle.isPending;

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
            className="min-h-12 rounded-lg bg-accent px-4 type-button text-on-accent disabled:opacity-50"
          >
            Add table
          </button>
        </form>

        {tables.isPending && <Spinner label="Loading tables" />}
        {tables.isError && <p className="type-body text-alert">{errorMessage(tables.error)}</p>}

        {tables.isSuccess && tables.data.length === 0 && (
          <EmptyState title="No tables yet" description="Add the first one above." />
        )}

        <ul className="divide-y divide-line">
          {(tables.data ?? []).map((table) => (
            <TableRow
              key={table.id}
              table={table}
              isBusy={isBusy}
              onEdit={() => setEditing(table)}
              onDelete={() => setDeleting(table)}
              onToggle={() => toggle.mutate({ table })}
            />
          ))}
        </ul>
      </div>

      {editing && (
        <EditTableSheet
          table={editing}
          isBusy={save.isPending}
          onCancel={() => setEditing(null)}
          onSave={(body) => save.mutate({ table: editing, body })}
        />
      )}

      {deleting && (
        <Sheet
          title={`Delete ${deleting.name}?`}
          onClose={() => setDeleting(null)}
          footer={
            <SheetActions
              onCancel={() => setDeleting(null)}
              confirmLabel="Delete table"
              danger
              disabled={remove.isPending}
              onConfirm={() => remove.mutate({ table: deleting })}
            />
          }
        >
          <p className="type-body">
            {deleting.name} is removed from the floor and from this list, with its place on the floor plan.
          </p>
          <p className="type-body mt-3 text-muted">
            Only a table that has never had an order can be deleted. If {deleting.name} has, it is kept and you will be
            asked to turn it off instead, so its old bills keep their table.
          </p>
        </Sheet>
      )}

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}

/** Name, section and seats together, through PATCH /tables/:tableId. */
function EditTableSheet({ table, isBusy, onCancel, onSave }) {
  const [name, setName] = useState(table.name);
  const [section, setSection] = useState(table.section ?? '');
  const [seats, setSeats] = useState(table.seats == null ? '' : String(table.seats));

  const seatsValue = seats.trim() === '' ? null : Number(seats);
  const seatsOk = seatsValue === null || (Number.isInteger(seatsValue) && seatsValue > 0);

  const body = {};
  if (name.trim() !== table.name) body.name = name.trim();
  if ((section.trim() || null) !== (table.section ?? null)) body.section = section.trim() || null;
  if (seatsValue !== (table.seats ?? null)) body.seats = seatsValue;
  const canSave = name.trim().length > 0 && seatsOk && Object.keys(body).length > 0 && !isBusy;

  return (
    <Sheet
      title={`Edit ${table.name}`}
      onClose={onCancel}
      footer={<SheetActions onCancel={onCancel} confirmLabel="Save table" disabled={!canSave} onConfirm={() => onSave(body)} />}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) onSave(body);
        }}
      >
        <Input label="Name" value={name} maxLength={20} onChange={(event) => setName(event.target.value)} />
        <Input
          label="Section"
          value={section}
          maxLength={40}
          hint="Leave empty for no section."
          onChange={(event) => setSection(event.target.value)}
        />
        <Input
          label="Seats"
          value={seats}
          inputMode="numeric"
          error={seatsOk ? undefined : 'Seats must be a whole number above zero.'}
          onChange={(event) => setSeats(event.target.value)}
        />
      </form>
    </Sheet>
  );
}

function TableRow({ table, isBusy, onEdit, onDelete, onToggle }) {
  return (
    <li className={['flex flex-wrap items-center gap-3 py-3', table.isActive ? '' : 'opacity-60'].join(' ')}>
      <span className="type-body w-24 font-semibold">{table.name}</span>

      <span className="flex-1 type-caption text-muted">
        {table.section ?? 'No section'}
        {table.seats != null && <span className="font-mono"> · {table.seats} seats</span>}
        {!table.isActive && <span> · Turned off</span>}
        {table.occupancy.isOccupied && (
          <span className="font-mono"> · order #{table.occupancy.orderNumber} open</span>
        )}
      </span>

      <Button variant="secondary" size="sm" disabled={isBusy} onClick={onEdit}>
        Edit
      </Button>

      <Button variant="secondary" size="sm" disabled={isBusy} onClick={onToggle}>
        {table.isActive ? 'Turn off' : 'Turn on'}
      </Button>

      <Button variant="quiet" size="sm" disabled={isBusy || table.occupancy.isOccupied} onClick={onDelete} className="text-alert">
        Delete
      </Button>
    </li>
  );
}
