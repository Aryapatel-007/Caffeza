/**
 * The guest's view of what they asked for. P23.
 *
 * Polls every 15 seconds while the cafe has not answered, then stops. Reads
 * with the status token this browser was given when it placed the request;
 * without it, the page says to call the cafe.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { cancelBooking, cancelOrder, getBookingStatus, getOrderStatus } from '../../api/publicSite.js';
import Button from '../../components/ui/Button.jsx';
import Money from '../../components/ui/Money.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import { formatDayIst, formatTimeIst } from '../../utils/formatDate.js';
import { SiteHeader } from './PublicSite.jsx';
import { tokenFor } from './guestTokens.js';

const UNDECIDED = ['WAITING', 'REQUESTED'];

const WORDS = {
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

function useStatus(kind, slug, id) {
  const token = tokenFor(id);
  const read = kind === 'order' ? getOrderStatus : getBookingStatus;
  return {
    token,
    query: useQuery({
      queryKey: ['public', kind, id],
      queryFn: () => read(slug, id, token),
      enabled: Boolean(token),
      refetchInterval: (query) => (UNDECIDED.includes(query.state.data?.status) ? 15_000 : false),
    }),
  };
}

function Frame({ site, slug, children }) {
  return (
    <>
      <SiteHeader site={site} slug={slug} back />
      <main className="mx-auto grid max-w-xl gap-4 px-4 py-6">{children}</main>
    </>
  );
}

function CallLine({ site, text }) {
  return (
    <p className="type-body">
      {text}
      {site.contactPhone && (
        <>
          {' '}
          <a href={`tel:${site.contactPhone}`} className="text-accent underline">
            {site.contactPhone}
          </a>
        </>
      )}
    </p>
  );
}

function useCancel(kind, slug, id, token) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => (kind === 'order' ? cancelOrder : cancelBooking)(slug, id, token),
    onSuccess: (data) => queryClient.setQueryData(['public', kind, id], data),
  });
}

export function OrderStatus({ site, slug }) {
  const { id } = useParams();
  const { token, query } = useStatus('order', slug, id);
  const cancel = useCancel('order', slug, id, token);
  if (!token) return <Frame site={site} slug={slug}><CallLine site={site} text="This browser cannot show that order. Please call the cafe." /></Frame>;
  if (query.isPending) return <Frame site={site} slug={slug}><Spinner label="Loading your order" /></Frame>;
  if (query.isError) return <Frame site={site} slug={slug}><CallLine site={site} text={query.error.message} /></Frame>;

  const order = query.data;
  const words = WORDS[order.status] ?? WORDS.WAITING;
  return (
    <Frame site={site} slug={slug}>
      <h1 className="type-title">Order {order.reference}</h1>
      <StateChip state={words.state} word={words.word} size="lg" />
      {order.status === 'WAITING' && <p className="type-body">The cafe answers within a few minutes. Keep this page open.</p>}
      {order.status === 'ACCEPTED' && <p className="type-body">Ready at {formatTimeIst(order.pickupAt)}. Pay at the counter when you collect.</p>}
      {order.status === 'DECLINED' && <CallLine site={site} text={`${order.declineReason}. Questions? Call`} />}
      {order.status === 'EXPIRED' && <CallLine site={site} text="The cafe did not answer in time. Please call" />}
      <ul className="grid gap-1 rounded-xl border border-line bg-surface p-4">
        {order.lines.map((line, index) => (
          <li key={index} className="flex justify-between gap-3">
            <span className="type-body">
              {line.quantity} × {line.itemName}
              {line.variantName ? ` (${line.variantName})` : ''}
            </span>
            <Money paise={line.lineTotalInPaise} tabular />
          </li>
        ))}
        <li className="type-heading mt-2 flex justify-between gap-3 border-t border-line pt-2">
          <span>Estimated bill total</span>
          <Money paise={order.estimate.billTotalInPaise} tabular />
        </li>
      </ul>
      {order.status === 'WAITING' && (
        <Button variant="secondary" isLoading={cancel.isPending} onClick={() => cancel.mutate()}>
          Cancel order
        </Button>
      )}
      {cancel.isError && <p className="type-body text-alert">{cancel.error.message}</p>}
    </Frame>
  );
}

export function BookingStatus({ site, slug }) {
  const { id } = useParams();
  const { token, query } = useStatus('booking', slug, id);
  const cancel = useCancel('booking', slug, id, token);
  if (!token) return <Frame site={site} slug={slug}><CallLine site={site} text="This browser cannot show that booking. Please call the cafe." /></Frame>;
  if (query.isPending) return <Frame site={site} slug={slug}><Spinner label="Loading your booking" /></Frame>;
  if (query.isError) return <Frame site={site} slug={slug}><CallLine site={site} text={query.error.message} /></Frame>;

  const booking = query.data;
  const words = WORDS[booking.status] ?? WORDS.REQUESTED;
  const canCancel = ['REQUESTED', 'CONFIRMED'].includes(booking.status) && new Date(booking.at) > new Date();
  return (
    <Frame site={site} slug={slug}>
      <h1 className="type-title">Booking {booking.reference}</h1>
      <StateChip state={words.state} word={words.word} size="lg" />
      <p className="type-heading">
        {booking.partySize} {booking.partySize === 1 ? 'person' : 'people'}, {formatDayIst(booking.at)} at {formatTimeIst(booking.at)}
      </p>
      {booking.status === 'REQUESTED' && <p className="type-body">The cafe will confirm soon. Keep this page open, or come back to it.</p>}
      {booking.status === 'CONFIRMED' && <p className="type-body">See you then, {booking.guestName}.</p>}
      {booking.status === 'DECLINED' && <CallLine site={site} text={`${booking.declineReason}. Questions? Call`} />}
      {booking.status === 'EXPIRED' && <CallLine site={site} text="The cafe did not answer in time. Please call" />}
      {canCancel && (
        <Button variant="secondary" isLoading={cancel.isPending} onClick={() => cancel.mutate()}>
          Cancel booking
        </Button>
      )}
      {cancel.isError && <p className="type-body text-alert">{cancel.error.message}</p>}
    </Frame>
  );
}
