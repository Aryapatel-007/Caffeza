import { useState } from 'react';

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
 * without guests when it is on. Asking here, on the tap that
 * seats the table, is the one moment the waiter is looking at the guests.
 *
 * A bottom sheet on a phone, a card in the corner on a wider screen, so the
 * floor stays in view behind it.
 */
export default function SeatTablePanel({ table, isBusy, allowSkip = false, onCancel, onConfirm }) {
  const [guestCount, setGuestCount] = useState(null);
  const [isMore, setIsMore] = useState(false);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center lg:items-end lg:justify-end lg:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 bg-ink/30 lg:bg-ink/10"
      />

      <section
        role="dialog"
        aria-label={`Seat guests at ${table.name}`}
        className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-[0_8px_32px_rgba(28,27,25,0.16)] lg:w-[440px] lg:rounded-3xl"
      >
        <header className="flex items-start justify-between gap-3 bg-ink px-5 pb-4 pt-5 text-white">
          <div>
            <span className="rounded-full bg-chana-soft px-2 py-0.5 font-mono text-[11px] font-bold text-ink">
              SEATING GUESTS
            </span>
            <h2 className="mt-1.5 text-[20px] font-semibold leading-7">
              {table.name}
              {table.section && <span className="text-white/70"> · {table.section}</span>}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {table.seats != null && (
              <span className="font-mono text-[12px] text-white/70">{table.seats} seats</span>
            )}
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              className="flex size-10 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex flex-col gap-5 p-5">
          <div>
            <h3 className="text-[16px] font-semibold leading-6">How many guests?</h3>
            <p className="text-[12px] leading-4 text-steel">Counted as covers on the bill.</p>
          </div>

          <div className="grid grid-cols-4 gap-3">
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
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-steel">Guests</span>
              <QuantityStepper
                value={guestCount}
                min={8}
                max={MAX_GUESTS}
                onChange={setGuestCount}
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <button
              type="button"
              disabled={guestCount === null || isBusy}
              onClick={() => onConfirm(guestCount)}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-chana text-[15px] font-semibold text-ink shadow-card transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
            >
              {isBusy
                ? 'Opening…'
                : guestCount === null
                  ? 'Choose the number of guests'
                  : `Start order (${guestCount} ${guestCount === 1 ? 'guest' : 'guests'}) →`}
            </button>
            {/* P19. Only when the restaurant does not require covers; the server decides. */}
            {allowSkip && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onConfirm(undefined)}
                className="h-11 w-full rounded-full bg-linen-2 text-[13px] font-medium hover:bg-linen-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
              >
                Skip, open without a guest count
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="h-11 w-full text-[13px] font-medium text-steel hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
            >
              Dismiss
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CountButton({ label, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={[
        'flex h-14 items-center justify-center rounded-2xl font-mono text-[18px] font-bold transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        isActive ? 'bg-chana text-ink shadow-card' : 'bg-linen-2 text-ink hover:bg-linen-3',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
