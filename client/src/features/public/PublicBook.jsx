/**
 * Booking a table from the restaurant's page. P23.
 *
 * Day, party size, then a time the server offers, then who. The cafe confirms
 * every booking; the page says so plainly, so nobody arrives believing they
 * hold a table nobody agreed to.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getSlots, requestBooking } from '../../api/publicSite.js';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { MinusIcon, PlusIcon } from '../../components/ui/icons/index.jsx';
import { businessDateAfter, businessDateToday, formatDayIst, formatTimeIst } from '../../utils/formatDate.js';
import { GuestDetails, Honeypot } from './GuestDetails.jsx';
import { SiteHeader } from './PublicSite.jsx';
import { newIdempotencyKey, rememberToken } from './guestTokens.js';

const chip = (selected) =>
  ['type-label min-h-12 flex-none rounded-lg px-3', selected ? 'bg-ink text-surface' : 'border border-line bg-surface hover:bg-sunken'].join(' ');

export default function PublicBook({ site, slug }) {
  const navigate = useNavigate();
  const today = businessDateToday();
  const days = Array.from({ length: site.reservations.daysAhead + 1 }, (_, index) => businessDateAfter(today, index));
  const [date, setDate] = useState(today);
  const [partySize, setPartySize] = useState(2);
  const [at, setAt] = useState(null);
  const [details, setDetails] = useState({ name: '', phone: '', note: '', consent: false, website: '' });
  const [idempotencyKey] = useState(newIdempotencyKey);

  const slots = useQuery({
    queryKey: ['public', 'slots', slug, date, partySize],
    queryFn: () => getSlots(slug, date, partySize),
  });

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
      navigate(`/r/${slug}/book/${placed.id}`, { replace: true });
    },
  });

  const valid = at && details.name.trim() && /^[6-9]\d{9}$/.test(details.phone);
  const changeParty = (by) => {
    setPartySize((current) => Math.min(site.reservations.maxPartySize, Math.max(1, current + by)));
    setAt(null);
  };

  return (
    <>
      <SiteHeader site={site} slug={slug} back />
      <main className="mx-auto grid max-w-xl gap-5 px-4 pb-28 pt-4">
        <h1 className="type-title">Book a table</h1>

        <section className="grid gap-2" aria-label="Day">
          <h2 className="type-heading">Day</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((day) => (
              <button key={day} type="button" aria-pressed={date === day} onClick={() => { setDate(day); setAt(null); }} className={chip(date === day)}>
                {day === today ? 'Today' : formatDayIst(`${day}T12:00:00+05:30`)}
              </button>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-between gap-3" aria-label="Party size">
          <h2 className="type-heading">People</h2>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="One fewer" onClick={() => changeParty(-1)} className="flex size-12 items-center justify-center rounded-lg border border-line bg-surface">
              <MinusIcon />
            </button>
            <span className="type-num w-10 text-center">{partySize}</span>
            <button type="button" aria-label="One more" onClick={() => changeParty(1)} className="flex size-12 items-center justify-center rounded-lg border border-line bg-surface">
              <PlusIcon />
            </button>
          </div>
        </section>
        {partySize === site.reservations.maxPartySize && (
          <p className="type-caption text-muted">For more than {site.reservations.maxPartySize} people, please call the cafe.</p>
        )}

        <section className="grid gap-2" aria-label="Time">
          <h2 className="type-heading">Time</h2>
          {slots.isPending && <Spinner label="Finding times" size="sm" />}
          {slots.isError && <p className="type-body text-alert">{slots.error.message}</p>}
          {slots.isSuccess && slots.data.slots.length === 0 && <p className="type-body text-muted">No times left on this day. Try another day.</p>}
          <div className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-4">
            {slots.data?.slots.map((slot) => (
              <button key={slot} type="button" aria-pressed={at === slot} onClick={() => setAt(slot)} className={chip(at === slot)}>
                {formatTimeIst(slot)}
              </button>
            ))}
          </div>
        </section>

        {at && (
          <>
            <GuestDetails site={site} details={details} onChange={setDetails} notePlaceholder="A birthday, a high chair, a quiet corner" />
            <Honeypot value={details.website} onChange={(website) => setDetails((current) => ({ ...current, website }))} />
            <p className="type-caption text-muted">The cafe confirms every booking. You will see the answer on the next page.</p>
          </>
        )}
        {book.isError && <p className="type-body text-alert">{book.error.message}</p>}
      </main>

      {at && (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface px-4 py-3">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <span className="type-label">
              {partySize} {partySize === 1 ? 'person' : 'people'}, {formatTimeIst(at)}
            </span>
            <Button disabled={!valid} isLoading={book.isPending} onClick={() => book.mutate()}>
              Request booking
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
