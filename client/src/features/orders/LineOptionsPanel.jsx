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
        className="flex w-full max-w-md flex-col border-l border-black/5 bg-paper shadow-[-8px_0_24px_rgba(28,27,25,0.18)]"
      >
        <header className="border-b border-black/5 px-4 py-3">
          <h2 className="text-[20px] font-semibold leading-7">{item.name}</h2>
          {item.description && (
            <p className="mt-0.5 text-[13px] leading-[18px] text-steel">{item.description}</p>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {item.variants.length > 0 && (
            <fieldset className="mb-6">
              <legend className="mb-2 text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
                Size
              </legend>
              <div className="space-y-2">
                {item.variants.map((variant) => {
                  // P04. An unavailable size is shown, greyed, and cannot be picked.
                  const out = variant.isAvailable === false;
                  return (
                    <label
                      key={variant.id}
                      className={[
                        'flex min-h-[48px] items-center justify-between gap-3 rounded-xl border-2 px-3',
                        out ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                        variantId === variant.id ? 'border-ink' : 'border-steel/40',
                      ].join(' ')}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="variant"
                          checked={variantId === variant.id}
                          disabled={out}
                          onChange={() => setVariantId(variant.id)}
                          className="size-4 accent-[var(--color-ink)]"
                        />
                        <span className="text-[15px] leading-[22px]">{variant.name}</span>
                      </span>
                      <span className="font-mono text-[15px] font-medium leading-5">
                        {out ? (
                          <span className="font-sans text-[13px] text-mirch">Out of stock</span>
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
            <fieldset className="mb-6">
              <legend className="mb-2 text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
                Extras
              </legend>
              <div className="space-y-2">
                {item.addOns.map((addOn) => {
                  // P04. An unavailable extra is shown, greyed, and cannot be picked.
                  const out = addOn.isAvailable === false;
                  return (
                    <label
                      key={addOn.id}
                      className={[
                        'flex min-h-[48px] items-center justify-between gap-3 rounded-xl border-2 px-3',
                        out ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                        addOnIds.includes(addOn.id) ? 'border-ink' : 'border-steel/40',
                      ].join(' ')}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={addOnIds.includes(addOn.id)}
                          disabled={out}
                          onChange={() => toggleAddOn(addOn.id)}
                          className="size-4 accent-[var(--color-ink)]"
                        />
                        <span className="text-[15px] leading-[22px]">{addOn.name}</span>
                      </span>
                      <span className="font-mono text-[15px] font-medium leading-5">
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

          <div className="mb-6">
            <span className="mb-2 block text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
              Quantity
            </span>
            <QuantityStepper value={quantity} onChange={setQuantity} />
          </div>

          <label className="block">
            <span className="mb-2 block text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
              Note for the kitchen
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              maxLength={200}
              placeholder="less spicy, no onion"
              className="w-full rounded-xl border-2 border-steel/40 bg-paper px-3 py-2 text-[15px] leading-[22px] placeholder:text-steel focus:border-ink focus:outline-none"
            />
          </label>
        </div>

        <footer className="border-t border-black/5 px-4 py-3">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[13px] leading-[18px] text-steel">Line total</span>
            <span className="font-mono text-[18px] font-semibold leading-6">
              {formatPaise(previewTotal)}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-12 flex-1 rounded-xl border-2 border-steel/40 text-[15px] font-semibold text-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
            >
              Cancel
            </button>
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
              className="h-12 flex-[2] rounded-xl bg-chana text-[15px] font-semibold text-ink transition-transform active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
            >
              {isBusy ? 'Adding…' : 'Add to order'}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

/** A stepper, because a number input on a tablet raises the wrong keyboard. */
export function QuantityStepper({ value, onChange, min = 1, max = 999, disabled }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border-2 border-steel/40">
      <StepperButton
        label="One fewer"
        symbol="−"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      />
      <span
        aria-live="polite"
        className="w-12 text-center font-mono text-[18px] font-semibold leading-6"
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
      className="flex size-12 items-center justify-center text-[20px] leading-none transition-transform active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
    >
      {symbol}
    </button>
  );
}
