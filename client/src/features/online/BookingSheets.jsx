/**
 * The sheets the booking book opens: confirm on a table, seat, cancel, and a
 * new phone booking. P23. Every rule is the server's; a clash or an occupied
 * table comes back as its own sentence.
 */
import { useState } from 'react';

import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Sheet, { SheetActions } from '../../components/ui/Sheet.jsx';
import { fromDatetimeLocalIst, toDatetimeLocalIst } from '../../utils/formatDate.js';
import { errorText } from './OnlineSheets.jsx';

const NO_TABLE = '';

const tableOptions = (tables, { allowNone }) => [
  ...(allowNone ? [{ value: NO_TABLE, label: 'No table yet' }] : [{ value: NO_TABLE, label: 'Choose a table' }]),
  ...tables.map((table) => ({
    value: table.id,
    label: `${table.name}${table.seats ? `, ${table.seats} seats` : ''}${table.occupancy?.isOccupied ? ', in use now' : ''}`,
  })),
];

export function ConfirmSheet({ booking, tables, onConfirm, onClose, isPending, error }) {
  const [tableId, setTableId] = useState(booking.tableId ?? NO_TABLE);
  const isChange = booking.status === 'CONFIRMED';
  return (
    <Sheet
      title={isChange ? `Table for ${booking.reference}` : `Confirm ${booking.reference}`}
      subtitle={`${booking.guestName} · ${booking.partySize} people`}
      onClose={onClose}
      footer={
        <SheetActions
          onCancel={onClose}
          confirmLabel={isChange ? 'Save' : 'Confirm'}
          disabled={isPending || (isChange && !tableId)}
          onConfirm={() => onConfirm(tableId ? { tableId } : {})}
        />
      }
    >
      <Select label="Table" value={tableId} onChange={(event) => setTableId(event.target.value)} options={tableOptions(tables, { allowNone: !isChange })} />
      {error && <p className="type-body mt-3 text-alert">{errorText(error)}</p>}
    </Sheet>
  );
}

export function SeatSheet({ booking, tables, onSeat, onClose, isPending, error }) {
  const [tableId, setTableId] = useState(booking.tableId ?? NO_TABLE);
  const [guests, setGuests] = useState(String(booking.partySize));
  const guestCount = Number.parseInt(guests, 10);
  const valid = tableId && Number.isInteger(guestCount) && guestCount >= 1 && guestCount <= 100;
  return (
    <Sheet
      title={`Seat ${booking.reference}`}
      subtitle={`${booking.guestName} · booked for ${booking.partySize}`}
      onClose={onClose}
      footer={<SheetActions onCancel={onClose} confirmLabel="Seat and open the table" disabled={!valid || isPending} onConfirm={() => onSeat({ tableId, guestCount })} />}
    >
      <div className="grid gap-4">
        <Select label="Table" value={tableId} onChange={(event) => setTableId(event.target.value)} options={tableOptions(tables, { allowNone: false })} />
        <Input label="Guests" inputMode="numeric" value={guests} onChange={(event) => setGuests(event.target.value.replace(/\D/g, ''))} />
        {error && <p className="type-body text-alert">{errorText(error)}</p>}
      </div>
    </Sheet>
  );
}

export function CancelBookingSheet({ booking, onCancelBooking, onClose, isPending, error }) {
  const [note, setNote] = useState('');
  return (
    <Sheet
      title={`Cancel ${booking.reference}`}
      subtitle={`${booking.guestName} · ${booking.partySize} people`}
      onClose={onClose}
      footer={<SheetActions onCancel={onClose} cancelLabel="Keep it" confirmLabel="Cancel booking" danger disabled={!note.trim() || isPending} onConfirm={() => onCancelBooking({ note: note.trim() })} />}
    >
      <Input label="Why" hint="For example: the guest phoned to cancel." maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} />
      {error && <p className="type-body mt-3 text-alert">{errorText(error)}</p>}
    </Sheet>
  );
}

/** A booking taken over the phone. Confirmed when it is saved. */
export function PhoneBookingSheet({ tables, defaultAt, onCreate, onClose, isPending, error }) {
  const [draft, setDraft] = useState({ guestName: '', guestPhone: '', partySize: '2', at: toDatetimeLocalIst(defaultAt), tableId: NO_TABLE, note: '' });
  const set = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));
  const partySize = Number.parseInt(draft.partySize, 10);
  const at = fromDatetimeLocalIst(draft.at);
  const valid = draft.guestName.trim() && /^[6-9]\d{9}$/.test(draft.guestPhone) && partySize >= 1 && partySize <= 50 && at;

  const submit = () =>
    onCreate({
      guestName: draft.guestName.trim(),
      guestPhone: draft.guestPhone,
      partySize,
      at,
      ...(draft.tableId ? { tableId: draft.tableId } : {}),
      ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
    });

  return (
    <Sheet
      title="New booking"
      subtitle="Taken over the phone. Saved as confirmed."
      onClose={onClose}
      footer={<SheetActions onCancel={onClose} confirmLabel="Save booking" disabled={!valid || isPending} onConfirm={submit} />}
    >
      <div className="grid gap-4">
        <Input label="Name" maxLength={60} value={draft.guestName} onChange={set('guestName')} />
        <Input label="Phone" inputMode="tel" maxLength={10} value={draft.guestPhone} onChange={(event) => setDraft((current) => ({ ...current, guestPhone: event.target.value.replace(/\D/g, '') }))} />
        <Input label="People" inputMode="numeric" value={draft.partySize} onChange={set('partySize')} />
        <Input label="Date and time" type="datetime-local" value={draft.at} onChange={set('at')} />
        <Select label="Table" value={draft.tableId} onChange={set('tableId')} options={tableOptions(tables, { allowNone: true })} />
        <Input label="Note, optional" maxLength={200} value={draft.note} onChange={set('note')} />
        {error && <p className="type-body text-alert">{errorText(error)}</p>}
      </div>
    </Sheet>
  );
}
