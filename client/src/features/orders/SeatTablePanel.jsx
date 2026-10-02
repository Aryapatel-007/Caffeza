import { useState } from 'react';

import Sheet from '../../components/ui/Sheet.jsx';
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
export default function SeatTablePanel({ table, isBusy, allowSkip = false, onCancel, onConfirm }) {
  const [guestCount, setGuestCount] = useState(null);
  const [isMore, setIsMore] = useState(false);

  return (
    <Sheet
      title={`Seat guests at ${table.name}`}
      subtitle={[table.section, table.seats != null && `${table.seats} seats`].filter(Boolean).join(' · ') || null}
      onClose={onCancel}
      footer={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={guestCount === null || isBusy}
            onClick={() => onConfirm(guestCount)}
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
              disabled={isBusy}
              onClick={() => onConfirm(undefined)}
              className="type-label min-h-12 w-full rounded-lg text-ink hover:bg-sunken disabled:opacity-50"
            >
              Skip, open without a guest count
            </button>
          )}
        </div>
      }
    >
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
