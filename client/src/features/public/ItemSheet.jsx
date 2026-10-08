/**
 * Choosing a size and extras for one dish, on the public page. P23. Prices
 * shown are the menu's; the server prices the line again when it quotes.
 */
import { useState } from 'react';

import DishPhoto from '../../components/ui/DishPhoto.jsx';
import Money from '../../components/ui/Money.jsx';
import Sheet, { SheetActions } from '../../components/ui/Sheet.jsx';

export default function ItemSheet({ item, onAdd, onClose }) {
  const [variantId, setVariantId] = useState(item.variants[0]?.id ?? null);
  const [addOnIds, setAddOnIds] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  const variant = item.variants.find((entry) => entry.id === variantId) ?? null;
  const chosenAddOns = item.addOns.filter((addOn) => addOnIds.includes(addOn.id));
  const unit = (variant?.priceInPaise ?? item.priceInPaise) + chosenAddOns.reduce((sum, addOn) => sum + addOn.priceInPaise, 0);
  const toggle = (id) => setAddOnIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  const add = () =>
    onAdd({
      menuItemId: item.id,
      itemName: item.name,
      variantId,
      variantName: variant?.name ?? null,
      addOnIds,
      addOnNames: chosenAddOns.map((addOn) => addOn.name),
      unitPriceInPaise: unit,
      quantity,
      notes: notes.trim() || null,
    });

  return (
    <Sheet
      title={item.name}
      subtitle={item.description ?? null}
      onClose={onClose}
      footer={
        <SheetActions onCancel={onClose} onConfirm={add}>
          Add to order · <Money paise={unit * quantity} tabular />
        </SheetActions>
      }
    >
      <div className="grid gap-5">
        {item.photoUrl && <DishPhoto src={item.photoUrl} name={item.name} className="-mx-4 -mt-4 aspect-[16/10] w-[calc(100%+2rem)] sm:-mx-6 sm:w-[calc(100%+3rem)]" />}
        {item.variants.length > 0 && (
          <fieldset className="grid gap-2">
            <legend className="type-heading mb-1">Size</legend>
            {item.variants.map((entry) => (
              <label key={entry.id} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-line px-3">
                <span className="flex items-center gap-3">
                  <input type="radio" name="size" checked={variantId === entry.id} onChange={() => setVariantId(entry.id)} className="size-5 accent-[var(--color-accent)]" />
                  <span className="type-body">{entry.name}</span>
                </span>
                <Money paise={entry.priceInPaise} tabular />
              </label>
            ))}
          </fieldset>
        )}
        {item.addOns.length > 0 && (
          <fieldset className="grid gap-2">
            <legend className="type-heading mb-1">Extras</legend>
            {item.addOns.map((addOn) => (
              <label key={addOn.id} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-line px-3">
                <span className="flex items-center gap-3">
                  <input type="checkbox" checked={addOnIds.includes(addOn.id)} onChange={() => toggle(addOn.id)} className="size-5 accent-[var(--color-accent)]" />
                  <span className="type-body">{addOn.name}</span>
                </span>
                <span className="type-label">
                  + <Money paise={addOn.priceInPaise} tabular />
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <label className="grid gap-1">
          <span className="type-label">Quantity</span>
          <select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="type-body min-h-12 rounded-lg border border-line bg-surface px-3">
            {Array.from({ length: 20 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="type-label">Note, optional</span>
          <input maxLength={200} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Less sugar, no onion" className="type-body min-h-12 rounded-lg border border-line bg-surface px-3" />
        </label>
      </div>
    </Sheet>
  );
}
