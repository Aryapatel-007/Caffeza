/**
 * Booking a table from the restaurant's page. P23, redesigned in P24.
 *
 * A strip of date cards, people as chips, then the times the server offers,
 * grouped by part of the day, then who. When the cafe takes a deposit, the
 * guest pays it on Razorpay's page and comes back to the status page. The cafe
 * confirms every booking, and the page says so plainly.
 * P38: tear-off calendar dates, an occasion written into the note, and the
 * booking as a chit. Without a deposit nothing is paid online.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getSlots, requestBooking } from '../../api/publicSite.js';
import Money, { moneyText } from '../../components/ui/Money.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { MinusIcon, PeopleIcon, PlusIcon } from '../../components/ui/icons/index.jsx';
import { businessDateAfter, businessDateToday, formatDayParts, formatTimeIst, istHour } from '../../utils/formatDate.js';
import { GuestDetails, Honeypot } from './GuestDetails.jsx';
import { ActionBar, BarButton, ChoiceChip, DISPLAY, EYEBROW, Flourish, Stamp, Steps, Ticket, TopBar } from './publicUi.jsx';
import { newIdempotencyKey, rememberToken } from './guestTokens.js';

const PARTS_OF_DAY = [
  { label: 'Lunch', from: 0, to: 15 },
  { label: 'Afternoon', from: 15, to: 18 },
  { label: 'Evening', from: 18, to: 20 },
  { label: 'Dinner', from: 20, to: 24 },
];

const QUICK_PARTY = [1, 2, 3, 4, 5, 6, 7, 8];
const OCCASIONS = ['Birthday', 'Anniversary', 'Family dinner', 'Friends'];

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
  const [occasion, setOccasion] = useState(null);
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
        // P38. The occasion travels in the note, which the cafe reads on the booking.
        note: [occasion, details.note.trim()].filter(Boolean).join('. ').slice(0, 200) || undefined,
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
        <div className="chit-shadow grid gap-1 rounded-xl border-2 border-masala bg-stall px-5 py-5 text-on-stall">
          <Flourish className="text-saffron">Table booking</Flourish>
          <h1 className={`${DISPLAY} text-4xl uppercase leading-none`}>Book a table</h1>
          <p className="type-body opacity-90">Pick a day, how many of you, and a time. {site.restaurantName} confirms every booking.</p>
        </div>

        <section className="grid gap-3" aria-label="People">
          <h2 className={`${DISPLAY} text-2xl`}>How many people?</h2>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {QUICK_PARTY.filter((size) => size <= maxPartySize).map((size) => (
              <ChoiceChip key={size} selected={partySize === size} onClick={() => choose(() => setPartySize(size))} className="type-num">
                {size}
              </ChoiceChip>
            ))}
          </div>
          {maxPartySize > 8 && (
            <div className="flex w-fit items-center gap-1 rounded-lg border-2 border-masala/25 bg-chit px-1">
              <button type="button" aria-label="One fewer" onClick={() => choose(() => setPartySize((n) => Math.max(1, n - 1)))} className="flex size-12 items-center justify-center">
                <MinusIcon size={18} />
              </button>
              <span className="type-num w-8 text-center">{partySize > 8 ? partySize : '9+'}</span>
              <button type="button" aria-label="One more" onClick={() => choose(() => setPartySize((n) => Math.min(maxPartySize, Math.max(9, n + 1))))} className="flex size-12 items-center justify-center">
                <PlusIcon size={18} />
              </button>
            </div>
          )}
          <p className="type-caption text-masala-soft">
            More than {maxPartySize}?{' '}
            {site.contactPhone ? (
              <a href={`tel:${site.contactPhone}`} className="text-stall underline underline-offset-2">
                Call {site.contactPhone}
              </a>
            ) : (
              'Please call the cafe.'
            )}
          </p>
        </section>

        <section className="grid gap-3" aria-label="Day">
          <h2 className={`${DISPLAY} text-2xl`}>Which day?</h2>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
            {days.map((day) => {
              const parts = formatDayParts(`${day}T12:00:00+05:30`);
              const chosen = date === day;
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => choose(() => setDate(day))}
                  className={[
                    'flex w-[4.5rem] flex-none flex-col overflow-hidden rounded-lg border-2 text-center',
                    chosen ? 'chit-shadow border-masala bg-saffron' : 'border-masala/25 bg-chit hover:border-masala',
                  ].join(' ')}
                >
                  <span className={`${EYEBROW} py-1 text-[0.65rem] ${chosen ? 'bg-stall text-on-stall' : 'bg-saffron-tint text-masala'}`}>
                    {day === today ? 'Today' : parts.weekday}
                  </span>
                  <span className={`${DISPLAY} pt-1 text-3xl leading-none`}>{parts.day}</span>
                  <span className="type-caption pb-1.5 text-masala-soft">{parts.month}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-3" aria-label="Time">
          <h2 className={`${DISPLAY} text-2xl`}>What time?</h2>
          {slots.isPending && <Spinner label="Finding times" size="sm" />}
          {slots.isError && <p className="type-body text-alert">{slots.error.message}</p>}
          {slots.isSuccess && groups.length === 0 && <p className="type-body text-masala-soft">No times left on this day. Try another day.</p>}
          {groups.map((part) => (
            <div key={part.label} className="grid gap-2 rounded-xl border-2 border-masala/15 bg-chit p-3">
              <p className={`${EYEBROW} text-stall`}>{part.label}</p>
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
                <div className="grid gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className={`${EYEBROW} text-stall`}>Your table</p>
                    <span className={`${EYEBROW} rounded-full border-2 border-masala/30 px-2 py-0.5 text-masala-soft`}>{site.restaurantName}</span>
                  </div>
                  <div className="flex items-stretch gap-3">
                    <div className="flex w-20 flex-none flex-col overflow-hidden rounded-lg border-2 border-masala text-center">
                      <span className={`${EYEBROW} bg-stall py-1 text-[0.65rem] text-on-stall`}>{formatDayParts(at).weekday}</span>
                      <span className={`${DISPLAY} bg-chit pt-1 text-4xl leading-none`}>{formatDayParts(at).day}</span>
                      <span className="type-caption bg-chit pb-1.5 text-masala-soft">{formatDayParts(at).month}</span>
                    </div>
                    <div className="grid min-w-0 flex-1 content-center gap-1">
                      <p className={`${DISPLAY} text-4xl leading-none`}>{formatTimeIst(at)}</p>
                      <p className="flex items-center gap-2 font-anek text-lg font-[650]">
                        <PeopleIcon size={20} />
                        {partySize} {partySize === 1 ? 'person' : 'people'}
                      </p>
                    </div>
                  </div>
                </div>
              }
            >
              {deposit > 0 ? (
                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3 rounded-lg border-2 border-masala bg-saffron px-4 py-3 text-masala">
                    <span>
                      <span className={`${EYEBROW} block`}>Booking advance</span>
                      <span className="type-caption block">
                        <Money paise={depositPerPersonInPaise} /> a person × {partySize}
                      </span>
                    </span>
                    <Money paise={deposit} size="tile" tabular className="font-[750]" />
                  </div>
                  <ul className="grid gap-2">
                    <li className="type-body flex gap-2">
                      <span aria-hidden="true" className="text-leaf">✔</span>
                      <span>Paid online now, to {site.restaurantName}: UPI, cards or netbanking.</span>
                    </li>
                    <li className="type-body flex gap-2">
                      <span aria-hidden="true" className="text-leaf">✔</span>
                      <span>Taken off your bill on the day.</span>
                    </li>
                    <li className="type-body flex gap-2">
                      <span aria-hidden="true" className="text-leaf">✔</span>
                      <span>Refunded in full if the cafe cannot confirm, or if you cancel at least {cutoffWords(depositRefundCutoffMinutes)} before.</span>
                    </li>
                    <li className="type-body flex gap-2 text-stall">
                      <span aria-hidden="true">!</span>
                      <span>Kept if you cancel later or do not come.</span>
                    </li>
                  </ul>
                </div>
              ) : (
                <div className="grid gap-2">
                  <Stamp tone="leaf">No advance payment</Stamp>
                  <p className="type-body mt-1 text-masala-soft">
                    Nothing is paid online. The cafe confirms your booking, and this page shows the answer. Your table is ready when you
                    arrive.
                  </p>
                </div>
              )}
            </Ticket>

            <section className="grid gap-3" aria-label="Occasion">
              <h2 className={`${DISPLAY} text-2xl`}>Celebrating something?</h2>
              <div className="flex flex-wrap gap-2">
                {OCCASIONS.map((word) => (
                  <ChoiceChip key={word} selected={occasion === word} onClick={() => setOccasion((current) => (current === word ? null : word))} className="type-label">
                    {word}
                  </ChoiceChip>
                ))}
              </div>
            </section>

            <section className="grid gap-3 rounded-xl border-2 border-masala/20 bg-chit p-4 sm:p-5">
              <h2 className={`${DISPLAY} text-2xl`}>Your details</h2>
              <GuestDetails site={site} details={details} onChange={setDetails} notePlaceholder="A high chair, a quiet corner" />
              <Honeypot value={details.website} onChange={(website) => setDetails((current) => ({ ...current, website }))} />
            </section>
          </>
        )}
        {book.isError && <p className="type-body text-alert">{book.error.message}</p>}
      </main>

      {at && (
        <ActionBar>
          <span className="font-anek font-[700]">
            {partySize} {partySize === 1 ? 'person' : 'people'} · {formatTimeIst(at)}
          </span>
          <BarButton disabled={!valid} busy={book.isPending} onClick={() => book.mutate()}>
            {deposit > 0 ? `Pay ${moneyText(deposit)} deposit` : 'Request booking'}
          </BarButton>
        </ActionBar>
      )}
    </>
  );
}
