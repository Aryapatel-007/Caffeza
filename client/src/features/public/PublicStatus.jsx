/**
 * The guest's view of what they asked for. P23, redesigned in P24.
 *
 * A ticket with the reference large, a timeline of what happened and what is
 * next, and the money: paid, refunded or kept. A guest coming back from
 * Razorpay arrives here with Razorpay's own query on the address; it is sent
 * to the server once, which checks it with Razorpay, and then cleared.
 * Polls every 15 seconds while anything is still to happen.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import {
  cancelBooking,
  cancelOrder,
  getBookingStatus,
  getOrderStatus,
  sendBookingPaymentReturn,
  sendOrderPaymentReturn,
} from '../../api/publicSite.js';
import Button from '../../components/ui/Button.jsx';
import Money from '../../components/ui/Money.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import { formatDayIst, formatTimeIst } from '../../utils/formatDate.js';
import { DISPLAY, Ticket, Timeline, timeOrNull, TopBar } from './publicUi.jsx';
import { tokenFor } from './guestTokens.js';

const STILL_MOVING = ['AWAITING_PAYMENT', 'WAITING', 'REQUESTED', 'ACCEPTED', 'CONFIRMED'];
const RETURN_KEYS = ['razorpay_payment_id', 'razorpay_payment_link_id', 'razorpay_payment_link_reference_id', 'razorpay_payment_link_status', 'razorpay_signature'];

const WORDS = {
  AWAITING_PAYMENT: { state: 'open', word: 'Waiting for payment' },
  PAYMENT_EXPIRED: { state: 'free', word: 'Payment not completed' },
  PAYMENT_FAILED: { state: 'alert', word: 'Payment could not start' },
  WAITING: { state: 'open', word: 'Waiting for the cafe to confirm' },
  REQUESTED: { state: 'open', word: 'Waiting for the cafe to confirm' },
  ACCEPTED: { state: 'ok', word: 'Confirmed' },
  CONFIRMED: { state: 'ok', word: 'Confirmed' },
  SEATED: { state: 'ok', word: 'Welcome' },
  DECLINED: { state: 'alert', word: 'Declined' },
  EXPIRED: { state: 'alert', word: 'No reply in time' },
  CANCELLED: { state: 'free', word: 'Cancelled' },
  NO_SHOW: { state: 'free', word: 'Missed' },
};

/** Sends Razorpay's return query to the server once, then takes it off the address. */
function usePaymentReturn(kind, slug, id, token) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sent = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (sent.current || !token || !params.get('razorpay_payment_link_id')) return;
    sent.current = true;
    const body = Object.fromEntries(RETURN_KEYS.map((key) => [key, params.get(key) ?? '']));
    const send = kind === 'order' ? sendOrderPaymentReturn : sendBookingPaymentReturn;
    send(slug, id, token, body)
      .then((data) => queryClient.setQueryData(['public', kind, id], data))
      .catch(() => queryClient.invalidateQueries({ queryKey: ['public', kind, id] }))
      .finally(() => navigate(location.pathname, { replace: true }));
  }, [kind, slug, id, token, location, navigate, queryClient]);
}

function useStatus(kind, slug, id) {
  const token = tokenFor(id);
  usePaymentReturn(kind, slug, id, token);
  const read = kind === 'order' ? getOrderStatus : getBookingStatus;
  const query = useQuery({
    queryKey: ['public', kind, id],
    queryFn: () => read(slug, id, token),
    enabled: Boolean(token),
    refetchInterval: (state) => (STILL_MOVING.includes(state.state.data?.status) ? 15_000 : false),
  });
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => (kind === 'order' ? cancelOrder : cancelBooking)(slug, id, token),
    onSuccess: (data) => queryClient.setQueryData(['public', kind, id], data),
  });
  return { token, query, cancel };
}

function Frame({ site, slug, children }) {
  return (
    <>
      <TopBar site={site} slug={slug} back={`/r/${slug}`} />
      <main className="mx-auto grid max-w-3xl gap-5 px-4 pb-16 pt-5">{children}</main>
    </>
  );
}

function CallLine({ site, text }) {
  return (
    <p className="type-body">
      {text}{' '}
      {site.contactPhone && (
        <a href={`tel:${site.contactPhone}`} className="text-accent underline">
          {site.contactPhone}
        </a>
      )}
    </p>
  );
}

/** The money, in words a guest reads once and understands. */
function PaymentBox({ payment, refundableUntil }) {
  if (!payment) return null;
  const refunded = payment.refundedInPaise > 0;
  if (payment.status === 'CREATED') {
    return (
      <div className="grid gap-3 rounded-2xl border border-open bg-open-tint p-4 text-open">
        <p className="type-label">
          Waiting for your payment of <Money paise={payment.amountInPaise} />. The link stays open until {formatTimeIst(payment.expiresAt)}.
        </p>
        {payment.payUrl && (
          <Button size="lg" onClick={() => window.location.assign(payment.payUrl)}>
            Finish paying
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-1 rounded-2xl border border-line bg-surface p-4">
      {['PAID', 'PARTLY_REFUNDED', 'REFUNDED', 'REFUND_FAILED', 'FORFEITED'].includes(payment.status) && (
        <p className="type-body flex justify-between gap-3">
          <span>Paid online{payment.paidAt ? ` at ${formatTimeIst(payment.paidAt)}` : ''}</span>
          <Money paise={payment.amountInPaise} tabular />
        </p>
      )}
      {refunded && (
        <p className="type-body flex justify-between gap-3 text-ok">
          <span>Refunded to you</span>
          <Money paise={payment.refundedInPaise} tabular />
        </p>
      )}
      {refunded && <p className="type-caption text-muted">Refunds reach your account in 5 to 7 working days, by the way you paid.</p>}
      {payment.status === 'REFUND_FAILED' && <p className="type-caption text-alert">Your refund is being sorted out by the cafe. Please call them if you have questions.</p>}
      {payment.status === 'FORFEITED' && <p className="type-caption text-muted">The deposit was kept, as the booking was cancelled late or missed.</p>}
      {payment.status === 'PAID' && refundableUntil && (
        <p className="type-caption text-muted">Cancel before {formatDayIst(refundableUntil)}, {formatTimeIst(refundableUntil)} for a full refund.</p>
      )}
      {payment.status === 'EXPIRED' && <p className="type-caption text-muted">The payment was not completed, so nothing was charged.</p>}
    </div>
  );
}

const step = (label, state, detail = null) => ({ label, state, detail });

function orderTimeline(order) {
  const paidOnline = Boolean(order.payment);
  const s = order.status;
  const stopped = ['DECLINED', 'EXPIRED', 'CANCELLED', 'PAYMENT_EXPIRED', 'PAYMENT_FAILED'].includes(s);
  const paid = order.payment && order.payment.status !== 'CREATED' && order.payment.status !== 'EXPIRED' && order.payment.status !== 'FAILED';
  const items = [step('Placed', 'done')];
  if (paidOnline) items.push(step('Paid', paid ? 'done' : stopped ? 'stopped' : 'now', paid ? timeOrNull(order.payment.paidAt) : null));
  if (s === 'ACCEPTED') items.push(step('Confirmed by the cafe', 'done'), step(`Ready at ${formatTimeIst(order.pickupAt)}`, 'now', 'Collect at the counter'));
  else if (stopped && paid) items.push(step(WORDS[s].word, 'stopped', order.declineReason));
  else if (stopped) items.push(step(WORDS[s].word, 'stopped'));
  else items.push(step('Confirmed by the cafe', paid || !paidOnline ? 'now' : 'later'), step('Ready to collect', 'later'));
  return items;
}

function bookingTimeline(booking) {
  const s = booking.status;
  const paid = booking.payment && !['CREATED', 'EXPIRED', 'FAILED'].includes(booking.payment.status);
  const stopped = ['DECLINED', 'EXPIRED', 'CANCELLED', 'PAYMENT_EXPIRED', 'PAYMENT_FAILED', 'NO_SHOW'].includes(s);
  const items = [step('Requested', 'done')];
  if (booking.payment) items.push(step('Deposit paid', paid ? 'done' : stopped ? 'stopped' : 'now', paid ? timeOrNull(booking.payment.paidAt) : null));
  if (stopped) items.push(step(WORDS[s].word, 'stopped', booking.declineReason));
  else if (s === 'SEATED') items.push(step('Confirmed', 'done'), step('Seated', 'done'));
  else items.push(step('Confirmed by the cafe', s === 'CONFIRMED' ? 'done' : 'now'), step(`See you at ${formatTimeIst(booking.at)}`, s === 'CONFIRMED' ? 'now' : 'later'));
  return items;
}

export function OrderStatus({ site, slug }) {
  const { id } = useParams();
  const { token, query, cancel } = useStatus('order', slug, id);
  if (!token) return <Frame site={site} slug={slug}><CallLine site={site} text="This browser cannot show that order. Please call the cafe:" /></Frame>;
  if (query.isPending) return <Frame site={site} slug={slug}><Spinner label="Loading your order" /></Frame>;
  if (query.isError) return <Frame site={site} slug={slug}><CallLine site={site} text={`${query.error.message} Call the cafe:`} /></Frame>;

  const order = query.data;
  const words = WORDS[order.status] ?? WORDS.WAITING;
  const canCancel = ['WAITING', 'AWAITING_PAYMENT'].includes(order.status);
  return (
    <Frame site={site} slug={slug}>
      <Ticket
        tone={order.status === 'ACCEPTED' ? 'accent' : 'surface'}
        head={
          <>
            <p className="type-label opacity-75">Takeaway order</p>
            <p className={`${DISPLAY} text-6xl leading-none`}>{order.reference}</p>
            <div className="mt-3">
              <StateChip state={words.state} word={words.word} size="md" />
            </div>
            {order.status === 'ACCEPTED' && <p className="type-heading mt-3">Ready at {formatTimeIst(order.pickupAt)}</p>}
          </>
        }
      >
        <ul className="grid gap-1">
          {order.lines.map((line, index) => (
            <li key={index} className="type-body flex justify-between gap-3">
              <span>
                {line.quantity} × {line.itemName}
                {line.variantName ? ` (${line.variantName})` : ''}
              </span>
              <Money paise={line.lineTotalInPaise} tabular />
            </li>
          ))}
        </ul>
        <p className="type-heading mt-3 flex justify-between gap-3">
          <span>Estimated bill total</span>
          <Money paise={order.estimate.billTotalInPaise} tabular />
        </p>
      </Ticket>

      <Timeline items={orderTimeline(order)} />
      <PaymentBox payment={order.payment} />
      {order.status === 'WAITING' && <p className="type-body text-muted">The cafe answers within a few minutes. Keep this page open; it updates by itself.</p>}
      {order.status === 'DECLINED' && <CallLine site={site} text={`${order.declineReason}. Questions? Call`} />}
      {order.status === 'EXPIRED' && <CallLine site={site} text="The cafe did not answer in time. Please call" />}
      {canCancel && (
        <Button variant="secondary" isLoading={cancel.isPending} onClick={() => cancel.mutate()}>
          Cancel order{order.payment?.status === 'PAID' ? ' and get a full refund' : ''}
        </Button>
      )}
      {cancel.isError && <p className="type-body text-alert">{cancel.error.message}</p>}
    </Frame>
  );
}

export function BookingStatus({ site, slug }) {
  const { id } = useParams();
  const { token, query, cancel } = useStatus('booking', slug, id);
  if (!token) return <Frame site={site} slug={slug}><CallLine site={site} text="This browser cannot show that booking. Please call the cafe:" /></Frame>;
  if (query.isPending) return <Frame site={site} slug={slug}><Spinner label="Loading your booking" /></Frame>;
  if (query.isError) return <Frame site={site} slug={slug}><CallLine site={site} text={`${query.error.message} Call the cafe:`} /></Frame>;

  const booking = query.data;
  const words = WORDS[booking.status] ?? WORDS.REQUESTED;
  const canCancel = ['REQUESTED', 'CONFIRMED', 'AWAITING_PAYMENT'].includes(booking.status) && new Date(booking.at) > new Date();
  const lateCancel = booking.payment?.status === 'PAID' && booking.refundableUntil && new Date() > new Date(booking.refundableUntil);
  return (
    <Frame site={site} slug={slug}>
      <Ticket
        tone={booking.status === 'CONFIRMED' ? 'accent' : 'surface'}
        head={
          <>
            <p className="type-label opacity-75">Table booking</p>
            <p className={`${DISPLAY} text-6xl leading-none`}>{booking.reference}</p>
            <div className="mt-3">
              <StateChip state={words.state} word={words.word} size="md" />
            </div>
          </>
        }
      >
        <p className={`${DISPLAY} text-3xl leading-tight`}>
          {formatDayIst(booking.at)}, {formatTimeIst(booking.at)}
        </p>
        <p className="type-body mt-1">
          {booking.partySize} {booking.partySize === 1 ? 'person' : 'people'} · {booking.guestName}
        </p>
      </Ticket>

      <Timeline items={bookingTimeline(booking)} />
      <PaymentBox payment={booking.payment} refundableUntil={booking.refundableUntil} />
      {booking.status === 'DECLINED' && <CallLine site={site} text={`${booking.declineReason}. Questions? Call`} />}
      {booking.status === 'EXPIRED' && <CallLine site={site} text="The cafe did not answer in time. Please call" />}
      {canCancel && (
        <Button variant="secondary" isLoading={cancel.isPending} onClick={() => cancel.mutate()}>
          {lateCancel ? 'Cancel booking (the deposit is kept)' : booking.payment?.status === 'PAID' ? 'Cancel booking and get a full refund' : 'Cancel booking'}
        </Button>
      )}
      {cancel.isError && <p className="type-body text-alert">{cancel.error.message}</p>}
    </Frame>
  );
}
