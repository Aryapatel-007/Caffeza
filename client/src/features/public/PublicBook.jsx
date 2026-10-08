/**
 * Booking a table from the restaurant's page. P23, redesigned in P24.
 *
 * A strip of date cards, people as chips, then the times the server offers,
 * grouped by part of the day, then who. When the cafe takes a deposit, the
 * guest pays it on Razorpay's page and comes back to the status page. The cafe
 * confirms every booking, and the page says so plainly.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getSlots, requestBooking } from '../../api/publicSite.js';
import Button from '../../components/ui/Button.jsx';
import Money, { moneyText } from '../../components/ui/Money.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { MinusIcon, PlusIcon } from '../../components/ui/icons/index.jsx';
import { businessDateAfter, businessDateToday, formatDayIst, formatDayParts, formatTimeIst, istHour } from '../../utils/formatDate.js';
import { GuestDetails, Honeypot } from './GuestDetails.jsx';
import { ActionBar, ChoiceChip, DISPLAY, Steps, Ticket, TopBar } from './publicUi.jsx';
import { newIdempotencyKey, rememberToken } from './guestTokens.js';

const PARTS_OF_DAY = [
  { label: 'Lunch', from: 0, to: 15 },
  { label: 'Afternoon', from: 15, to: 18 },
  { label: 'Evening', from: 18, to: 20 },
  { label: 'Dinner', from: 20, to: 24 },
];

const QUICK_PARTY = [1, 2, 3, 4, 5, 6, 7, 8];

function cutoffWords(minutes) {
  if (minutes % 60 === 0) return minutes === 60 ? '1 hour' : `${minutes / 60} hours`;
  return `${minutes} minutes`;
}

export default function PublicBook({ site, slug }) {
  const navigate = useNavigate();
  const today = businessDateToday();
  const { maxPartySize, daysAhead, depositPerPersonInPaise, depositRefundCutoffMinutes } = site.reservations;
  const days = Array.from({ length: daysAhead + 1 }, (_, index) => businessDateAfter(today, index));
  const [date, setDate] = useState(today);
  const [partySize, setPartySize] = useState(2);
  const [at, setAt] = useState(null);
  const [details, setDetails] = useState({ name: '', phone: '', note: '', consent: false, website: '' });
  const [idempotencyKey] = useState(newIdempotencyKey);
  const deposit = depositPerPersonInPaise * partySize;

  const slots = useQuery({ queryKey: ['public', 'slots', slug, date, partySize], queryFn: () => getSlots(slug, date, partySize) });

  const book = useMutation({
    mutationFn: () =>
      requestBooking(slug, {
        idempotencyKey,
        guestName: details.name.trim(),
        guestPhone: details.phone,
        partySize,
        at,
        note: details.note.trim() || undefined,
        marketingConsent: details.consent,
        website: details.website,
      }),
    onSuccess: (placed) => {
      rememberToken(placed.id, placed.statusToken);
      if (placed.payment?.payUrl) window.location.assign(placed.payment.payUrl);
      else navigate(`/r/${slug}/book/${placed.id}`, { replace: true });
    },
  });

  const valid = at && details.name.trim() && /^[6-9]\d{9}$/.test(details.phone);
  const choose = (change) => {
    change();
    setAt(null);
  };
  const groups = PARTS_OF_DAY.map((part) => ({
    ...part,
    slots: (slots.data?.slots ?? []).filter((slot) => istHour(slot) >= part.from && istHour(slot) < part.to),
  })).filter((part) => part.slots.length > 0);
  const step = !at ? 0 : 1;

  return (
    <>
      <TopBar site={site} slug={slug} back={`/r/${slug}`} />
      <main className="mx-auto grid max-w-3xl gap-7 px-4 pb-36 pt-4">
        <Steps steps={['When', 'Details', deposit > 0 ? 'Deposit' : 'Done']} current={step} />
        <h1 className={`${DISPLAY} text-4xl leading-none`}>Book a table</h1>

        <section className="grid gap-3" aria-label="Day">
          <h2 className="type-heading">Day</h2>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {days.map((day) => {
              const parts = formatDayParts(`${day}T12:00:00+05:30`);
              return (
                <ChoiceChip key={day} selected={date === day} onClick={() => choose(() => setDate(day))} className="flex w-16 flex-col items-center py-2">
                  <span className="type-caption opacity-75">{day === today ? 'Today' : parts.weekday}</span>
                  <span className={`${DISPLAY} text-2xl leading-none`}>{parts.day}</span>
                  <span className="type-caption opacity-75">{parts.month}</span>
                </ChoiceChip>
              );
            })}
          </div>
        </section>

        <section className="grid gap-3" aria-label="People">
          <h2 className="type-heading">People</h2>
          <div className="flex flex-wrap gap-2">
            {QUICK_PARTY.filter((size) => size <= maxPartySize).map((size) => (
              <ChoiceChip key={size} selected={partySize === size} onClick={() => choose(() => setPartySize(size))} className="type-num w-12">
                {size}
              </ChoiceChip>
            ))}
            {maxPartySize > 8 && (
              <div className="flex items-center gap-1 rounded-xl border border-line bg-surface px-1">
                <button type="button" aria-label="One fewer" onClick={() => choose(() => setPartySize((n) => Math.max(1, n - 1)))} className="flex size-12 items-center justify-center">
                  <MinusIcon size={18} />
                </button>
                <span className="type-num w-8 text-center">{partySize > 8 ? partySize : '9+'}</span>
                <button type="button" aria-label="One more" onClick={() => choose(() => setPartySize((n) => Math.min(maxPartySize, Math.max(9, n + 1))))} className="flex size-12 items-center justify-center">
                  <PlusIcon size={18} />
                </button>
              </div>
            )}
          </div>
          <p className="type-caption text-muted">For more than {maxPartySize} people, please call the cafe.</p>
        </section>

        <section className="grid gap-3" aria-label="Time">
          <h2 className="type-heading">Time</h2>
          {slots.isPending && <Spinner label="Finding times" size="sm" />}
          {slots.isError && <p className="type-body text-alert">{slots.error.message}</p>}
          {slots.isSuccess && groups.length === 0 && <p className="type-body text-muted">No times left on this day. Try another day.</p>}
          {groups.map((part) => (
            <div key={part.label} className="grid gap-2">
              <p className="type-label text-muted">{part.label}</p>
              <div className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-4 sm:grid-cols-6">
                {part.slots.map((slot) => (
                  <ChoiceChip key={slot} selected={at === slot} onClick={() => setAt(slot)} className="type-label">
                    {formatTimeIst(slot)}
                  </ChoiceChip>
                ))}
              </div>
            </div>
          ))}
        </section>

        {at && (
          <>
            <Ticket
              head={
                <>
                  <p className="type-label text-muted">Your table</p>
                  <p className={`${DISPLAY} mt-1 text-3xl leading-tight`}>
                    {formatDayIst(at)}, {formatTimeIst(at)}
                  </p>
                  <p className="type-body mt-1">
                    {partySize} {partySize === 1 ? 'person' : 'people'} at {site.restaurantName}
                  </p>
                </>
              }
            >
              {deposit > 0 ? (
                <div className="grid gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="type-heading">Deposit</span>
                    <Money paise={deposit} size="tile" tabular />
                  </div>
                  <p className="type-caption text-muted">
                    <Money paise={depositPerPersonInPaise} /> a person, taken off your bill on the day. Refunded in full if the cafe
                    cannot confirm, or if you cancel at least {cutoffWords(depositRefundCutoffMinutes)} before. Kept if you cancel later
                    or do not come.
                  </p>
                </div>
              ) : (
                <p className="type-body text-muted">No deposit. The cafe confirms every booking, and you will see the answer on the next page.</p>
              )}
            </Ticket>

            <section className="grid gap-3">
              <h2 className={`${DISPLAY} text-2xl`}>Your details</h2>
              <GuestDetails site={site} details={details} onChange={setDetails} notePlaceholder="A birthday, a high chair, a quiet corner" />
              <Honeypot value={details.website} onChange={(website) => setDetails((current) => ({ ...current, website }))} />
            </section>
          </>
        )}
        {book.isError && <p className="type-body text-alert">{book.error.message}</p>}
      </main>

      {at && (
        <ActionBar>
          <span className="type-label">
            {partySize} {partySize === 1 ? 'person' : 'people'}, {formatTimeIst(at)}
          </span>
          <Button size="lg" disabled={!valid} isLoading={book.isPending} onClick={() => book.mutate()}>
            {deposit > 0 ? `Pay ${moneyText(deposit)} deposit` : 'Request booking'}
          </Button>
        </ActionBar>
      )}
    </>
  );
}
