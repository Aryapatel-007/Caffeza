/**
 * Online takeaway, the till's inbox. P23 (M14).
 *
 * Waiting requests first, oldest first, each with the time left to answer.
 * Accept opens a sheet with the pickup time and "Send to kitchen now". Below
 * them, today's answered requests. Pausing takeaway for a rush lives here too.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { acceptOnlineOrder, declineOnlineOrder, getInbox, listOnlineOrders, pauseTakeaway, resumeTakeaway } from '../../api/online.js';
import Button from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Money from '../../components/ui/Money.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { businessDateToday, formatTimeIst } from '../../utils/formatDate.js';
import { INBOX_QUERY_KEY } from './OnlineAlerts.jsx';
import { AcceptSheet, DeclineSheet, errorText } from './OnlineSheets.jsx';
import PaymentChip from './PaymentChip.jsx';
import { ORDER_DECLINE_REASONS } from './onlineReasons.js';

const TILL_ROLES = ['OWNER', 'MANAGER', 'CASHIER'];

const STATUS_CHIP = {
  WAITING: { state: 'open', word: 'Waiting' },
  ACCEPTED: { state: 'ok', word: 'Accepted' },
  DECLINED: { state: 'alert', word: 'Declined' },
  CANCELLED: { state: 'free', word: 'Cancelled' },
  EXPIRED: { state: 'alert', word: 'Expired' },
};

function minutesLeft(answerBy) {
  return Math.max(0, Math.ceil((new Date(answerBy).getTime() - Date.now()) / 60_000));
}

export function OnlineTabs({ current, inbox }) {
  const tab = (to, label, count, key) => (
    <Link
      to={to}
      aria-current={current === key ? 'page' : undefined}
      className={[
        'type-button flex min-h-12 items-center gap-2 rounded-lg px-4',
        current === key ? 'bg-ink text-surface' : 'border border-line bg-surface text-ink hover:bg-sunken',
      ].join(' ')}
    >
      {label}
      {count > 0 && <span className="type-num-meta">{count}</span>}
    </Link>
  );
  return (
    <nav aria-label="Online" className="flex gap-2">
      {tab('/online', 'Takeaway', inbox?.waitingOrders ?? 0, 'takeaway')}
      {tab('/online/bookings', 'Bookings', inbox?.waitingReservations ?? 0, 'bookings')}
    </nav>
  );
}

function PauseControls({ pausedUntil, canPause }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);
  const change = useMutation({
    mutationFn: (body) => (body ? pauseTakeaway(body) : resumeTakeaway()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY }),
    onError: setError,
  });
  if (!canPause) return null;

  if (pausedUntil) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <StateChip state="alert" word={`Takeaway paused until ${formatTimeIst(pausedUntil)}`} />
        <Button variant="secondary" size="sm" isLoading={change.isPending} onClick={() => change.mutate(null)}>
          Take orders again
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="type-label text-muted">Busy? Pause takeaway for</span>
      {[15, 30, 60].map((minutes) => (
        <Button key={minutes} variant="secondary" size="sm" disabled={change.isPending} onClick={() => change.mutate({ minutes })}>
          {minutes} min
        </Button>
      ))}
      <Button variant="secondary" size="sm" disabled={change.isPending} onClick={() => change.mutate({ untilClose: true })}>
        Rest of today
      </Button>
      {error && <span className="type-caption text-alert">{errorText(error)}</span>}
    </div>
  );
}

function RequestCard({ request, canDecide, onAccept, onDecline, onOpenOrder }) {
  const chip = STATUS_CHIP[request.status] ?? STATUS_CHIP.WAITING;
  const waiting = request.status === 'WAITING';
  return (
    <article className={`grid gap-3 rounded-xl border bg-surface p-4 ${waiting ? 'border-open' : 'border-line'}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="type-heading">
            {request.reference} · {request.customerName}
          </p>
          <p className="type-caption text-muted">
            Pickup {formatTimeIst(request.pickupAt)}
            {request.pickupWasAsap ? ', as soon as possible' : ''} · placed {formatTimeIst(request.createdAt)}
          </p>
        </div>
        <StateChip state={chip.state} word={waiting ? `Answer in ${minutesLeft(request.answerBy)} min` : chip.word} size="sm" />
      </header>

      <ul className="grid gap-1">
        {request.lines.map((line, index) => (
          <li key={index} className="flex justify-between gap-3">
            <span className="type-body min-w-0">
              {line.quantity} × {line.itemName}
              {line.variantName ? ` (${line.variantName})` : ''}
              {line.addOns.length > 0 && <span className="type-caption text-muted"> + {line.addOns.map((addOn) => addOn.name).join(', ')}</span>}
              {line.notes && <span className="type-caption block text-muted">“{line.notes}”</span>}
            </span>
            <Money paise={line.lineTotalInPaise} tabular />
          </li>
        ))}
      </ul>
      {request.note && <p className="type-body rounded-lg bg-sunken px-3 py-2">“{request.note}”</p>}
      <PaymentChip payment={request.payment} />

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <span className="type-label">
          Estimated bill total <Money paise={request.estimate.billTotalInPaise} tabular />
        </span>
        <a href={`tel:${request.customerPhone}`} className="type-label flex min-h-12 items-center text-accent underline-offset-4 hover:underline">
          {request.customerPhone}
        </a>
      </footer>

      {waiting && canDecide && (
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onDecline}>
            Decline
          </Button>
          <Button className="flex-[2]" onClick={onAccept}>
            Accept
          </Button>
        </div>
      )}
      {request.status === 'ACCEPTED' && request.orderId && (
        <Button variant="quiet" onClick={onOpenOrder}>
          Open the order
        </Button>
      )}
      {request.status === 'DECLINED' && request.declineNote && <p className="type-caption text-muted">Note: {request.declineNote}</p>}
    </article>
  );
}

export default function OnlineInboxPage() {
  const { user, features } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canDecide = TILL_ROLES.includes(user?.role);
  const [accepting, setAccepting] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [toast, setToast] = useState(null);

  const inbox = useQuery({ queryKey: INBOX_QUERY_KEY, queryFn: getInbox, refetchInterval: 15_000 });
  const today = businessDateToday();
  const waiting = useQuery({
    queryKey: ['online', 'orders', 'WAITING', inbox.data?.latestRequestAt ?? null],
    queryFn: () => listOnlineOrders({ status: 'WAITING', limit: 100 }),
    refetchInterval: 15_000,
  });
  const answered = useQuery({
    queryKey: ['online', 'orders', 'today'],
    queryFn: () => listOnlineOrders({ date: today, limit: 100 }),
    refetchInterval: 30_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['online'] });
  };

  const accept = useMutation({
    mutationFn: ({ id, body }) => acceptOnlineOrder(id, body),
    onSuccess: (result) => {
      setAccepting(null);
      refresh();
      setToast({
        tone: result.fireError ? 'error' : 'success',
        message: result.fireError
          ? `${result.onlineOrder.reference} accepted as order ${result.order.orderNumber}, but not sent: ${result.fireError}`
          : `${result.onlineOrder.reference} accepted as order ${result.order.orderNumber}${result.kots.length ? ' and sent to the kitchen' : ''}.`,
      });
    },
    onError: (error) => {
      if (error.code === 'REQUEST_ALREADY_DECIDED') {
        setAccepting(null);
        setToast({ tone: 'error', message: errorText(error) });
        refresh();
      }
    },
  });
  const decline = useMutation({
    mutationFn: ({ id, body }) => declineOnlineOrder(id, body),
    onSuccess: (result) => {
      setDeclining(null);
      refresh();
      setToast({ tone: 'success', message: `${result.reference} declined. The guest has been told.` });
    },
  });

  const decided = (answered.data?.data ?? []).filter((request) => request.status !== 'WAITING');
  const slug = features.online?.publicSlug;

  return (
    <main className="v2 min-h-full bg-ground text-ink">
      <header className="px-4 pt-4">
        <div className="mx-auto grid max-w-3xl gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="type-title">Online orders</h1>
              <p className="type-caption text-muted">
                Takeaway from {slug ? `/r/${slug}` : 'your page'}. Nothing reaches the kitchen until you accept it.
              </p>
            </div>
            <OnlineTabs current="takeaway" inbox={inbox.data} />
          </div>
          <PauseControls pausedUntil={inbox.data?.pausedUntil} canPause={canDecide} />
          {inbox.data?.refundFailures > 0 && (
            <p className="type-label rounded-lg border border-alert bg-alert-tint px-3 py-2 text-alert">
              {inbox.data.refundFailures === 1 ? '1 refund' : `${inbox.data.refundFailures} refunds`} could not be sent to Razorpay. An owner or manager can retry from the card.
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-3xl gap-6 px-4 py-6">
        <section className="grid gap-3" aria-label="Waiting">
          <h2 className="type-heading">Waiting</h2>
          {waiting.isPending && <Spinner label="Loading online orders" />}
          {waiting.isError && <p className="type-body text-alert">{errorText(waiting.error)}</p>}
          {waiting.isSuccess && waiting.data.data.length === 0 && (
            <EmptyState title="Nothing waiting" description="A new online order chimes, is read aloud, and shows here." />
          )}
          {waiting.data?.data.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              canDecide={canDecide}
              onAccept={() => {
                accept.reset();
                setAccepting(request);
              }}
              onDecline={() => {
                decline.reset();
                setDeclining(request);
              }}
            />
          ))}
        </section>

        <section className="grid gap-3" aria-label="Answered today">
          <h2 className="type-heading">Answered today</h2>
          {answered.isSuccess && decided.length === 0 && <p className="type-body text-muted">None yet today.</p>}
          {decided.map((request) => (
            <RequestCard key={request.id} request={request} canDecide={false} onOpenOrder={() => navigate(`/orders/${request.orderId}`)} />
          ))}
        </section>
      </div>

      {accepting && (
        <AcceptSheet
          request={accepting}
          isPending={accept.isPending}
          error={accept.error}
          onClose={() => setAccepting(null)}
          onAccept={(body) => accept.mutate({ id: accepting.id, body })}
          onDecline={() => {
            setDeclining(accepting);
            setAccepting(null);
          }}
        />
      )}
      {declining && (
        <DeclineSheet
          title={`Decline ${declining.reference}`}
          reasons={ORDER_DECLINE_REASONS}
          isPending={decline.isPending}
          error={decline.error}
          onClose={() => setDeclining(null)}
          onDecline={(body) => decline.mutate({ id: declining.id, body })}
        />
      )}
      {toast && <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />}
    </main>
  );
}
