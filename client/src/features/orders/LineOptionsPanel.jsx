import { useState } from 'react';

import { formatPaise } from '../../utils/formatMoney.js';

/**
 * Choosing a size, extras, a quantity and a note before a line goes on.
 *
 * A slide-over from the right, not a modal. DESIGN-SYSTEM.md section 6: the
 * waiter needs to keep seeing the order they are adding to while they pick.
 *
 * Nothing here sends a price. The panel shows prices so the waiter can read
 * them out, and sends back ids and a quantity. The server prices the line.
 */
export default function LineOptionsPanel({ item, onCancel, onConfirm, isBusy }) {
  // P04. Start on the first size that can actually be ordered.
  const [variantId, setVariantId] = useState(
    item.variants.find((variant) => variant.isAvailable !== false)?.id ?? null,
  );
  const [addOnIds, setAddOnIds] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  const chosenVariant = item.variants.find((variant) => variant.id === variantId);
  const unitPrice = chosenVariant ? chosenVariant.priceInPaise : item.priceInPaise;

  const addOnTotal = item.addOns
    .filter((addOn) => addOnIds.includes(addOn.id))
    .reduce((total, addOn) => total + addOn.priceInPaise, 0);

  /**
   * Shown so the waiter can read a total to the customer. It is not sent
   * anywhere and it is not a bill: the server computes the real line total from
   * the snapshot it writes, and M3 owns tax.
   */
  const previewTotal = (unitPrice + addOnTotal) * quantity;

  const toggleAddOn = (id) =>
    setAddOnIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <div className="fixed inset-0 z-30 flex">
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="flex-1 bg-ink/30"
      />

      <aside
        role="dialog"
        aria-label={`Add ${item.name}`}
        className="flex w-full max-w-md flex-col bg-white shadow-[-8px_0_30px_rgba(28,27,25,0.18)]"
      >
        <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div>
            <h2 className="text-[24px] font-semibold leading-8 tracking-[-0.015em]">{item.name}</h2>
            {item.description && (
              <p className="mt-1 text-[14px] leading-5 text-steel">{item.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex size-12 flex-none items-center justify-center rounded-full bg-linen-2 text-steel hover:bg-linen-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {item.variants.length > 0 && (
            <fieldset className="mb-6 border-t border-black/5 pt-3">
              <legend className="sr-only">Size</legend>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-wide">Choose size</span>
                <span className="text-[11px] font-semibold text-steel">Required · choose 1</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {item.variants.map((variant) => {
                  // P04. An unavailable size is shown, greyed, and cannot be picked.
                  const out = variant.isAvailable === false;
                  return (
                    <label
                      key={variant.id}
                      className={[
                        'flex min-h-[96px] flex-col justify-between rounded-xl border-2 p-3.5 transition-colors',
                        out ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                        variantId === variant.id
                          ? 'border-chana bg-chana-soft'
                          : 'border-transparent bg-linen hover:bg-linen-2',
                      ].join(' ')}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold">{variant.name}</span>
                        <input
                          type="radio"
                          name="variant"
                          checked={variantId === variant.id}
                          disabled={out}
                          onChange={() => setVariantId(variant.id)}
                          className="size-4 accent-[var(--color-chana)]"
                        />
                      </span>
                      <span className="mt-2 font-mono text-[16px] font-bold leading-[22px]">
                        {out ? (
                          <span className="font-sans text-[13px] font-medium text-mirch">Out of stock</span>
                        ) : (
                          formatPaise(variant.priceInPaise)
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {item.addOns.length > 0 && (
            <fieldset className="mb-6 border-t border-black/5 pt-3">
              <legend className="sr-only">Extras</legend>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-wide">Extras</span>
                <span className="text-[11px] font-semibold text-steel">Optional</span>
              </div>
              <div className="space-y-2">
                {item.addOns.map((addOn) => {
                  // P04. An unavailable extra is shown, greyed, and cannot be picked.
                  const out = addOn.isAvailable === false;
                  return (
                    <label
                      key={addOn.id}
                      className={[
                        'flex min-h-[52px] items-center justify-between gap-3 rounded-xl border-2 px-3 transition-colors',
                        out ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                        addOnIds.includes(addOn.id)
                          ? 'border-chana bg-chana-soft'
                          : 'border-transparent bg-linen hover:bg-linen-2',
                      ].join(' ')}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={addOnIds.includes(addOn.id)}
                          disabled={out}
                          onChange={() => toggleAddOn(addOn.id)}
                          className="size-5 accent-[var(--color-chana)]"
                        />
                        <span className="text-[14px] leading-5">{addOn.name}</span>
                      </span>
                      <span className="font-mono text-[14px] leading-5 text-steel">
                        {out ? (
                          <span className="font-sans text-[13px] text-mirch">Out of stock</span>
                        ) : (
                          `+${formatPaise(addOn.priceInPaise)}`
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <label className="block border-t border-black/5 pt-3">
            <span className="mb-2 block text-[12px] font-semibold uppercase tracking-wide">
              Note for the kitchen
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              maxLength={200}
              placeholder="less spicy, no onion"
              className="w-full rounded-xl bg-linen px-4 py-3 text-[14px] leading-5 placeholder:text-steel focus:bg-white focus:outline-none focus:ring-2 focus:ring-chana"
            />
          </label>
        </div>

        <footer className="flex items-center gap-3 border-t border-black/5 px-4 py-3">
          <QuantityStepper value={quantity} onChange={setQuantity} />
          <button
            type="button"
            // Every size out of stock means nothing here can be ordered.
            disabled={isBusy || (item.variants.length > 0 && !variantId)}
            onClick={() =>
              onConfirm({
                menuItemId: item.id,
                ...(variantId ? { variantId } : {}),
                quantity,
                ...(addOnIds.length > 0 ? { addOnIds } : {}),
                ...(notes.trim() ? { notes: notes.trim() } : {}),
              })
            }
            className="flex h-14 flex-1 items-center justify-between rounded-full bg-chana px-5 text-[15px] font-semibold text-ink shadow-card transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
          >
            <span>{isBusy ? 'Adding…' : 'Add to order'}</span>
            <span className="font-mono font-bold">{formatPaise(previewTotal)} →</span>
          </button>
        </footer>
      </aside>
    </div>
  );
}

/** A stepper, because a number input on a tablet raises the wrong keyboard. */
export function QuantityStepper({ value, onChange, min = 1, max = 999, disabled }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-linen p-1">
      <StepperButton
        label="One fewer"
        symbol="−"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      />
      <span
        aria-live="polite"
        className="w-10 text-center font-mono text-[18px] font-semibold leading-6"
      >
        {value}
      </span>
      <StepperButton
        label="One more"
        symbol="+"
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      />
    </div>
  );
}

function StepperButton({ label, symbol, onClick, disabled }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-10 items-center justify-center rounded-full bg-white text-[20px] leading-none shadow-card transition-transform active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
    >
      {symbol}
    </button>
  );
}
