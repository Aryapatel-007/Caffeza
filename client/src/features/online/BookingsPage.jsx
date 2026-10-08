/**
 * The booking book. P23 (M14).
 *
 * One business day at a time, by time. Requests from the page wait at the top
 * of their slot with Confirm and Decline; confirmed bookings get a table, are
 * seated (which opens the table's order), or are marked as a no-show. A
 * booking taken over the phone is typed in with New booking.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { listTables } from '../../api/orders.js';
import {
  cancelReservation,
  confirmReservation,
  createPhoneReservation,
  declineReservation,
  getInbox,
  listReservations,
  noShowReservation,
  seatReservation,
} from '../../api/online.js';
import Button from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { businessDateAfter, businessDateToday, formatBusinessDate, formatDayIst, formatTimeIst } from '../../utils/formatDate.js';
import { CancelBookingSheet, ConfirmSheet, PhoneBookingSheet, SeatSheet } from './BookingSheets.jsx';
import { INBOX_QUERY_KEY } from './OnlineAlerts.jsx';
import { OnlineTabs } from './OnlineInboxPage.jsx';
import { DeclineSheet, errorText } from './OnlineSheets.jsx';
import { BOOKING_DECLINE_REASONS } from './onlineReasons.js';

const TILL_ROLES = ['OWNER', 'MANAGER', 'CASHIER'];
const NO_SHOW_AFTER_MS = 15 * 60_000;

const STATUS_CHIP = {
  REQUESTED: { state: 'open', word: 'Waiting' },
  CONFIRMED: { state: 'served', word: 'Confirmed' },
  SEATED: { state: 'ok', word: 'Seated' },
  DECLINED: { state: 'alert', word: 'Declined' },
  CANCELLED: { state: 'free', word: 'Cancelled' },
  EXPIRED: { state: 'alert', word: 'Expired' },
  NO_SHOW: { state: 'alert', word: 'No-show' },
};

function BookingCard({ booking, canDecide, onAction }) {
  const chip = STATUS_CHIP[booking.status] ?? STATUS_CHIP.REQUESTED;
  const noShowAllowed = Date.now() >= new Date(booking.at).getTime() + NO_SHOW_AFTER_MS;
  const button = (label, action, variant = 'secondary') => (
    <Button key={action} variant={variant} size="sm" onClick={() => onAction(action, booking)}>
      {label}
    </Button>
  );

  return (
    <article className={`grid gap-2 rounded-xl border bg-surface p-4 ${booking.status === 'REQUESTED' ? 'border-open' : 'border-line'}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="type-heading">
            <span className="type-num">{formatTimeIst(booking.at)}</span> · {booking.guestName}, {booking.partySize}
          </p>
          <p className="type-caption text-muted">
            {booking.reference} · {booking.source === 'PHONE' ? 'by phone' : 'from the page'}
            {booking.tableName ? ` · ${booking.tableName}` : ''}
          </p>
        </div>
        <StateChip state={chip.state} word={chip.word} size="sm" />
      </header>
      {booking.note && <p className="type-body rounded-lg bg-sunken px-3 py-2">“{booking.note}”</p>}
      <a href={`tel:${booking.guestPhone}`} className="type-label flex min-h-12 w-fit items-center text-accent underline-offset-4 hover:underline">
        {booking.guestPhone}
      </a>
      <div className="flex flex-wrap gap-2">
        {booking.status === 'REQUESTED' && canDecide && [button('Decline', 'decline'), button('Confirm', 'confirm', 'primary')]}
        {booking.status === 'CONFIRMED' && [
          button('Seat', 'seat', 'primary'),
          canDecide && button(booking.tableId ? 'Change table' : 'Give a table', 'confirm'),
          canDecide && noShowAllowed && button('No-show', 'noShow'),
          canDecide && button('Cancel', 'cancel', 'quiet'),
        ]}
        {booking.status === 'SEATED' && booking.orderId && button('Open the order', 'openOrder', 'quiet')}
      </div>
    </article>
  );
}

export default function BookingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canDecide = TILL_ROLES.includes(user?.role);
  const today = businessDateToday();
  const [date, setDate] = useState(today);
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);

  const inbox = useQuery({ queryKey: INBOX_QUERY_KEY, queryFn: getInbox, refetchInterval: 15_000 });
  const bookings = useQuery({
    queryKey: ['online', 'bookings', date, inbox.data?.latestRequestAt ?? null],
    queryFn: () => listReservations({ date }),
    refetchInterval: 30_000,
  });
  const tables = useQuery({ queryKey: ['tables', 'for-bookings'], queryFn: () => listTables(), enabled: Boolean(sheet) });

  const act = useMutation({
    mutationFn: ({ kind, booking, body }) => {
      if (kind === 'confirm') return confirmReservation(booking.id, body);
      if (kind === 'decline') return declineReservation(booking.id, body);
      if (kind === 'seat') return seatReservation(booking.id, body);
      if (kind === 'cancel') return cancelReservation(booking.id, body);
      if (kind === 'noShow') return noShowReservation(booking.id);
      return createPhoneReservation(body);
    },
    onSuccess: (result, { kind }) => {
      setSheet(null);
      queryClient.invalidateQueries({ queryKey: ['online'] });
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      if (kind === 'seat') {
        navigate(`/orders/${result.order.id}`);
        return;
      }
      const words = { confirm: 'confirmed', decline: 'declined', cancel: 'cancelled', noShow: 'marked as a no-show', create: 'saved' };
      setToast({ tone: 'success', message: `${result.reference} ${words[kind]}.` });
    },
    onError: (error) => {
      if (!sheet) setToast({ tone: 'error', message: errorText(error) });
    },
  });

  const onAction = (kind, booking) => {
    act.reset();
    if (kind === 'openOrder') return navigate(`/orders/${booking.orderId}`);
    if (kind === 'noShow') return act.mutate({ kind, booking });
    return setSheet({ kind, booking });
  };
  const send = (body) => act.mutate({ kind: sheet.kind, booking: sheet.booking, body });
  const common = { onClose: () => setSheet(null), isPending: act.isPending, error: act.error };
  const days = Array.from({ length: 7 }, (_, index) => businessDateAfter(today, index));

  return (
    <main className="v2 min-h-full bg-ground text-ink">
      <header className="px-4 pt-4">
        <div className="mx-auto grid max-w-3xl gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="type-title">Bookings</h1>
              <p className="type-caption text-muted">{formatBusinessDate(date)}</p>
            </div>
            <OnlineTabs current="bookings" inbox={inbox.data} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {days.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setDate(day)}
                aria-pressed={date === day}
                className={[
                  'type-label min-h-12 rounded-lg px-3',
                  date === day ? 'bg-ink text-surface' : 'border border-line bg-surface hover:bg-sunken',
                ].join(' ')}
              >
                {day === today ? 'Today' : formatDayIst(`${day}T12:00:00+05:30`)}
              </button>
            ))}
            {canDecide && (
              <Button className="ml-auto" onClick={() => onAction('create', null)}>
                New booking
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-3xl gap-3 px-4 py-6">
        {bookings.isPending && <Spinner label="Loading bookings" />}
        {bookings.isError && <p className="type-body text-alert">{errorText(bookings.error)}</p>}
        {bookings.isSuccess && bookings.data.length === 0 && (
          <EmptyState title="No bookings this day" description="Bookings from your page, and ones you type in from a phone call, show here." />
        )}
        {bookings.data?.map((booking) => (
          <BookingCard key={booking.id} booking={booking} canDecide={canDecide} onAction={onAction} />
        ))}
      </div>

      {sheet?.kind === 'confirm' && <ConfirmSheet booking={sheet.booking} tables={tables.data ?? []} onConfirm={send} {...common} />}
      {sheet?.kind === 'seat' && <SeatSheet booking={sheet.booking} tables={tables.data ?? []} onSeat={send} {...common} />}
      {sheet?.kind === 'cancel' && <CancelBookingSheet booking={sheet.booking} onCancelBooking={send} {...common} />}
      {sheet?.kind === 'decline' && (
        <DeclineSheet title={`Decline ${sheet.booking.reference}`} reasons={BOOKING_DECLINE_REASONS} onDecline={send} {...common} />
      )}
      {sheet?.kind === 'create' && (
        <PhoneBookingSheet tables={tables.data ?? []} defaultAt={`${date}T20:00:00+05:30`} onCreate={send} {...common} />
      )}
      {toast && <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />}
    </main>
  );
}
