import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import { createIngredient } from '../../api/inventory.js';
import { purchaseToBaseInteger } from '../../utils/units.js';
import Sheet from '../../components/ui/Sheet.jsx';
import { errorMessage } from './errorCopy.js';

const BASE_UNIT_OPTIONS = [
  { value: 'G', label: 'Grams (g)' },
  { value: 'ML', label: 'Millilitres (ml)' },
  { value: 'PIECE', label: 'Piece' },
];

/**
 * Setting up a new ingredient. Back-office, infrequent work -- unlike the
 * daily adjustment screen, this is a plain form rather than a keypad flow,
 * matching how M1's item editor is a form and its availability toggle is not.
 */
export default function NewIngredientPanel({ onCancel, onCreated }) {
  const [name, setName] = useState('');
  const [baseUnit, setBaseUnit] = useState('G');
  const [purchaseUnitName, setPurchaseUnitName] = useState('kg');
  const [unitsPerBase, setUnitsPerBase] = useState('1000');
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  const [openingQty, setOpeningQty] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const mutation = useMutation({
    mutationFn: (body) => createIngredient(body),
    onSuccess: onCreated,
    onError: (error) => setFieldErrors({ _general: errorMessage(error), ...(error.fields ?? {}) }),
  });

  const submit = (event) => {
    event.preventDefault();
    setFieldErrors({});

    const perBase = Number(unitsPerBase);
    const body = {
      name: name.trim(),
      baseUnit,
      purchaseUnitName: purchaseUnitName.trim() || null,
      unitsPerBase: Number.isFinite(perBase) && perBase >= 1 ? Math.round(perBase) : 1,
    };

    if (lowStockThreshold.trim()) {
      const threshold = purchaseUnitName.trim()
        ? purchaseToBaseInteger(lowStockThreshold, body.unitsPerBase)
        : Math.round(Number(lowStockThreshold));
      if (threshold !== null) body.lowStockThresholdInBase = threshold;
    }

    if (openingQty.trim()) {
      const opening = purchaseUnitName.trim()
        ? purchaseToBaseInteger(openingQty, body.unitsPerBase)
        : Math.round(Number(openingQty));
      if (opening !== null && opening > 0) body.openingQtyInBase = opening;
    }

    mutation.mutate(body);
  };

  return (
    <Sheet title="New ingredient" onCancel={onCancel}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />

        <Select
          label="Base unit"
          options={BASE_UNIT_OPTIONS}
          value={baseUnit}
          onChange={(e) => setBaseUnit(e.target.value)}
        />

        <Input
          label="Purchase unit (optional)"
          hint='How it is bought, e.g. "kg", "litre", "packet". Leave blank if bought in the base unit.'
          value={purchaseUnitName}
          onChange={(e) => setPurchaseUnitName(e.target.value)}
        />

        {purchaseUnitName.trim() && (
          <Input
            label={`${purchaseUnitName.trim()}s per base unit`}
            hint="1 kg of paneer (base G) is 1000."
            type="number"
            min="1"
            step="1"
            value={unitsPerBase}
            onChange={(e) => setUnitsPerBase(e.target.value)}
          />
        )}

        <Input
          label={`Low stock threshold (${purchaseUnitName.trim() || 'base unit'})`}
          hint="Optional. Below this, the stock list flags it."
          value={lowStockThreshold}
          onChange={(e) => setLowStockThreshold(e.target.value)}
        />

        <Input
          label={`Opening quantity (${purchaseUnitName.trim() || 'base unit'})`}
          hint="Optional. Recorded as a RECEIVED movement, the same as any later delivery."
          value={openingQty}
          onChange={(e) => setOpeningQty(e.target.value)}
        />

        {fieldErrors._general && <p className="text-[13px] text-mirch">{fieldErrors._general}</p>}

        <div className="mt-2 flex gap-2">
          <Button type="button" variant="secondary" fullWidth onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" fullWidth isLoading={mutation.isPending} disabled={!name.trim()}>
            Save ingredient
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
