import { useState } from 'react';

import Input from '../../components/ui/Input.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';
import { QuantityStepper } from './LineOptionsPanel.jsx';

/** The server's own ceiling, MAX_GUEST_COUNT in server/models/Order.js. */
const MAX_GUESTS = 100;
const QUICK_COUNTS = [1, 2, 3, 4, 5, 6, 7];

/**
 * How many guests, before a dine-in order opens.
 *
 * The count becomes `orders.guestCount`, which is frozen onto the bill as its
 * covers, and average per cover divides by it. P19: "Skip" appears only when
 * `settings.floor.requireGuestCount` is off; the server refuses a dine-in order
 * without guests when it is on. Asking here, on the tap that seats the table,
 * is the one moment the waiter is looking at the guests.
 */
export default function SeatTablePanel({ table, isBusy, allowSkip = false, onCancel, onConfirm, reservation = null, onSeatReservation }) {
  const [guestCount, setGuestCount] = useState(null);
  const [isMore, setIsMore] = useState(false);
  // P27. The guest's details, all optional, for the customer list.
  const [guestName, setGuestName] = useState('');
  const [mobile, setMobile] = useState('');
  const [agreed, setAgreed] = useState(false);
  const digits = mobile.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  const mobileOk = digits.length === 10 && /^[6-9]/.test(digits);
  const mobileWrong = mobile.trim() !== '' && !mobileOk;
  const guest = {
    ...(guestName.trim() ? { customerName: guestName.trim() } : {}),
    ...(mobileOk ? { customerPhone: digits } : {}),
    ...(mobileOk && agreed ? { offersConsent: true } : {}),
  };

  return (
    <Sheet
      title={`Seat guests at ${table.name}`}
      subtitle={[table.section, table.seats != null && `${table.seats} seats`].filter(Boolean).join(' · ') || null}
      onClose={onCancel}
      footer={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={guestCount === null || isBusy || mobileWrong}
            onClick={() => onConfirm(guestCount, guest)}
            className="type-button flex min-h-14 w-full items-center justify-center rounded-lg bg-accent text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {isBusy
              ? 'Opening…'
              : guestCount === null
                ? 'Choose the number of guests'
                : `Start order, ${guestCount} ${guestCount === 1 ? 'guest': 'guests'}`}
          </button>
          {/* P19. Only when the restaurant does not require covers; the server decides. */}
          {allowSkip && (
            <button
              type="button"
              disabled={isBusy || mobileWrong}
              onClick={() => onConfirm(undefined, guest)}
              className="type-label min-h-12 w-full rounded-lg text-ink hover:bg-sunken disabled:opacity-50"
            >
              Skip, open without a guest count
            </button>
          )}
        </div>
      }
    >
      {/* P23. The booking this table is held for comes first. */}
      {reservation && (
        <div className="mb-6 grid gap-2 rounded-lg border border-open bg-open-tint p-3 text-open">
          <p className="type-label">
            Reserved for {reservation.guestName}, {reservation.partySize} at {formatTimeIst(reservation.at)} ({reservation.reference})
          </p>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onSeatReservation(reservation)}
            className="type-button min-h-12 rounded-lg bg-accent px-4 text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            Seat {reservation.reference}, {reservation.partySize} {reservation.partySize === 1 ? 'guest' : 'guests'}
          </button>
          <p className="type-caption">Or seat other guests below.</p>
        </div>
      )}

      <h3 className="type-heading">How many guests?</h3>
      <p className="type-caption text-muted">Counted as covers on the bill.</p>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {QUICK_COUNTS.map((count) => (
          <CountButton
            key={count}
            label={String(count)}
            isActive={!isMore && guestCount === count}
            onClick={() => {
              setIsMore(false);
              setGuestCount(count);
            }}
          />
        ))}
        <CountButton
          label="More"
          isActive={isMore}
          onClick={() => {
            setIsMore(true);
            setGuestCount((current) => Math.max(8, current ?? 8));
          }}
        />
      </div>

      {isMore && (
        <div className="mt-4 flex items-center justify-between">
          <span className="type-label text-muted">Guests</span>
          <QuantityStepper value={guestCount} min={8} max={MAX_GUESTS} onChange={setGuestCount} />
        </div>
      )}

      <h3 className="type-heading mt-6">Guest details</h3>
      <p className="type-caption text-muted">Optional. Builds your customer list, and brings back their visits next time.</p>
      <div className="mt-3 grid gap-3">
        <Input label="Guest name" autoComplete="off" maxLength={100} value={guestName} onChange={(event) => setGuestName(event.target.value)} />
        <Input
          label="Mobile number"
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
          value={mobile}
          error={mobileWrong ? 'A 10-digit Indian mobile number.' : undefined}
          onChange={(event) => {
            setMobile(event.target.value);
            if (!event.target.value.trim()) setAgreed(false);
          }}
        />
        <label className={['flex items-start gap-3', mobileOk ? '' : 'opacity-50'].join(' ')}>
          <input
            type="checkbox"
            checked={agreed}
            disabled={!mobileOk}
            onChange={(event) => setAgreed(event.target.checked)}
            className="mt-1 h-5 w-5 rounded border border-line focus:ring-2 focus:ring-accent"
          />
          <span>
            <span className="type-body block">The guest agrees to offers and news by SMS or WhatsApp</span>
            <span className="type-caption block text-muted">Tick only if the guest says yes.</span>
          </span>
        </label>
      </div>
    </Sheet>
  );
}

function CountButton({ label, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={[
        'flex min-h-14 items-center justify-center rounded-lg border transition-colors',
        label === 'More' ? 'type-button' : 'type-num-tile',
        isActive ? 'border-2 border-ink bg-sunken' : 'border-line bg-surface hover:bg-sunken',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
