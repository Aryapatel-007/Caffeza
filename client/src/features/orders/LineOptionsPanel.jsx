import { useState } from 'react';

import { MinusIcon, PlusIcon } from '../../components/ui/icons/index.jsx';
import Money, { moneyText } from '../../components/ui/Money.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import StateChip from '../../components/ui/StateChip.jsx';

/**
 * Choosing a size, extras, a quantity and a note before a line goes on.
 *
 * A sheet, not a modal. DESIGN-SYSTEM section 9: the
 * waiter needs to keep seeing the order they are adding to while they pick.
 *
 * Nothing here sends a price. The panel shows prices so the waiter can read
 * them out, and sends back ids and a quantity. The server prices the line.
 */
/** The requests a cafe hears most, one tap each. Jain is on Cafezza's menu. */
const QUICK_NOTES = ['Less spicy', 'Extra spicy', 'No onion', 'Jain', 'Less sugar', 'No ice'];

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

  /** A one-tap request, added to the note or taken off it again. */
  const toggleQuick = (word) =>
    setNotes((current) => {
      const parts = current.split(',').map((part) => part.trim()).filter(Boolean);
      const next = parts.includes(word) ? parts.filter((part) => part !== word) : [...parts, word];
      return next.join(', ').slice(0, 200);
    });

  const chosenQuick = notes.split(',').map((part) => part.trim());

  /**
   * The note to the chef, 2 October 2026: what the guest wants done differently.
   * First on a plain dish, where it is the only thing to choose; after the sizes
   * and extras otherwise. The common requests are one tap, so most notes need no
   * keyboard; anything else is typed. It prints on the kitchen ticket.
   */
  const noteField = (
    <div className="flex flex-col gap-3">
      <label className="block">
        <span className="type-label mb-2 block">Note to chef</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          maxLength={200}
          placeholder="Anything the guest wants changed"
          className="type-body min-h-12 w-full rounded-lg border border-muted bg-surface px-3 py-2 text-ink placeholder:text-muted"
        />
      </label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick notes">
        {QUICK_NOTES.map((word) => (
          <button
            key={word}
            type="button"
            aria-pressed={chosenQuick.includes(word)}
            onClick={() => toggleQuick(word)}
            className={[
              'type-label min-h-12 rounded-full border px-4',
              chosenQuick.includes(word) ? 'border-2 border-ink bg-sunken' : 'border-line bg-surface hover:bg-sunken',
            ].join(' ')}
          >
            {word}
          </button>
        ))}
      </div>
    </div>
  );

  const pick = () =>
    onConfirm({
      menuItemId: item.id,
      ...(variantId ? { variantId } : {}),
      quantity,
      ...(addOnIds.length > 0 ? { addOnIds } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });

  const choice = (selected, out) =>
    [
      'flex items-center justify-between gap-3 rounded-lg border px-3 transition-colors',
      out ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      selected ? 'border-2 border-ink bg-sunken' : 'border-line bg-surface hover:bg-sunken',
    ].join(' ');

  return (
    <Sheet
      title={item.name}
      onClose={onCancel}
      footer={
        <div className="flex items-center gap-3">
          <QuantityStepper value={quantity} onChange={setQuantity} />
          <button
            type="button"
            // Every size out of stock means nothing here can be ordered.
            disabled={isBusy || (item.variants.length > 0 && !variantId)}
            onClick={pick}
            className="flex min-h-14 flex-1 items-center justify-between gap-2 rounded-lg bg-accent px-4 text-on-accent hover:brightness-110 disabled:opacity-60"
          >
            <span className="type-button">{isBusy ? 'Adding…' : 'Add to order'}</span>
            <Money paise={previewTotal} size="num" />
          </button>
        </div>
      }
    >
      {item.description && <p className="type-body mb-4 text-muted">{item.description}</p>}

      {item.variants.length > 0 && (
        <fieldset className="mb-6">
          <legend className="type-label mb-2 flex w-full justify-between">
            <span>Size</span>
            <span className="text-muted">Choose one</span>
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {item.variants.map((variant) => {
              // P04. An unavailable size is shown, greyed, and cannot be picked.
              const out = variant.isAvailable === false;
              return (
                <label key={variant.id} className={`${choice(variantId === variant.id, out)} min-h-20 flex-col !items-start !justify-between py-3`}>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="type-body font-semibold">{variant.name}</span>
                    <input
                      type="radio"
                      name="variant"
                      checked={variantId === variant.id}
                      disabled={out}
                      onChange={() => setVariantId(variant.id)}
                      className="size-5 accent-[var(--color-accent)]"
                    />
                  </span>
                  {out ? <StateChip state="alert" word="Out of stock" size="sm" /> : <Money paise={variant.priceInPaise} tabular size="num" />}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {item.addOns.length > 0 && (
        <fieldset className="mb-6">
          <legend className="type-label mb-2 flex w-full justify-between">
            <span>Extras</span>
            <span className="text-muted">Optional</span>
          </legend>
          <div className="flex flex-col gap-2">
            {item.addOns.map((addOn) => {
              // P04. An unavailable extra is shown, greyed, and cannot be picked.
              const out = addOn.isAvailable === false;
              return (
                <label key={addOn.id} className={`${choice(addOnIds.includes(addOn.id), out)} min-h-12`}>
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={addOnIds.includes(addOn.id)}
                      disabled={out}
                      onChange={() => toggleAddOn(addOn.id)}
                      className="size-5 accent-[var(--color-accent)]"
                    />
                    <span className="type-body">{addOn.name}</span>
                  </span>
                  {out ? (
                    <StateChip state="alert" word="Out of stock" size="sm" />
                  ) : (
                    <span className="type-num text-muted">+{moneyText(addOn.priceInPaise)}</span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {noteField}
    </Sheet>
  );
}

/** A stepper, because a number input on a tablet raises the wrong keyboard. */
export function QuantityStepper({ value, onChange, min = 1, max = 999, disabled }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-ink bg-surface">
      <StepperButton label="One fewer" icon={<MinusIcon />} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 1))} />
      <span aria-live="polite" className="type-num-tile w-10 text-center">
        {value}
      </span>
      <StepperButton label="One more" icon={<PlusIcon />} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 1))} />
    </div>
  );
}

function StepperButton({ label, icon, onClick, disabled }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-12 items-center justify-center rounded-lg hover:bg-sunken disabled:opacity-40"
    >
      {icon}
    </button>
  );
}
