import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import NumericKeypad from '../../components/ui/NumericKeypad.jsx';
import PanelShell from '../billing/PanelShell.jsx';
import { adjustStock } from '../../api/inventory.js';
import { baseToPurchaseDisplay, BASE_UNIT_SHORT_LABELS, purchaseToBaseInteger } from '../../utils/units.js';
import { errorMessage } from './errorCopy.js';

/**
 * The manual adjustment. One tap on an ingredient in StockListPage leads
 * straight here.
 *
 * A fixed set of reason tiles rather than a free-text field, per
 * docs/DESIGN-SYSTEM.md section 10: a storekeeper's reason for touching stock
 * is one of a small predictable set, unlike a manager's reasoning for a
 * discount, which is why this screen is allowed to skip the text field
 * `DiscountPanel.jsx` and `VoidBillPanel.jsx` both require.
 *
 * The quantity keypad runs in the ingredient's own PURCHASE unit -- what a
 * storekeeper actually has in hand, a kilogram bag or a litre bottle -- with
 * the base-unit conversion shown live underneath as they type. The API always
 * takes the base-unit integer; `utils/units.js` is the one place that
 * converts, mirroring the server.
 */
const REASONS = [
  { type: 'RECEIVED', label: 'Received', icon: '↓', hint: 'Stock arrived' },
  { type: 'WASTAGE', label: 'Wastage', icon: '✕', hint: 'Spoiled or expired' },
  { type: 'SPILLAGE', label: 'Spillage', icon: '≈', hint: 'Dropped or spilled' },
  { type: 'RETURN', label: 'Return', icon: '↩', hint: 'Sent back to a supplier' },
  { type: 'RECOUNT', label: 'Recount', icon: '=', hint: 'A physical count disagreed' },
];

const REASON_TEXT = {
  RECEIVED: 'Stock received',
  WASTAGE: 'Wastage',
  SPILLAGE: 'Spillage',
  RETURN: 'Returned',
  RECOUNT: 'Physical recount',
};

export default function AdjustStockPanel({ ingredient, onCancel, onAdjusted }) {
  const [type, setType] = useState(null);
  const [recountDirection, setRecountDirection] = useState(null); // 'MORE' | 'LESS'
  const [error, setError] = useState(null);

  const unitsPerBase = ingredient.unitsPerBase ?? 1;
  const hasPurchaseUnit = Boolean(ingredient.purchaseUnitName);
  const unitLabel = hasPurchaseUnit
    ? ingredient.purchaseUnitName
    : BASE_UNIT_SHORT_LABELS[ingredient.baseUnit];

  const mutation = useMutation({
    mutationFn: (body) => adjustStock(ingredient.id, body),
    onSuccess: onAdjusted,
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const submit = (magnitudeText) => {
    const magnitudeInBase = hasPurchaseUnit
      ? purchaseToBaseInteger(magnitudeText, unitsPerBase)
      : Math.round(Number(magnitudeText));

    if (magnitudeInBase === null || !Number.isFinite(magnitudeInBase) || magnitudeInBase <= 0) {
      setError('Enter a quantity greater than zero.');
      return;
    }

    const signed = type === 'RECOUNT' && recountDirection === 'LESS' ? -magnitudeInBase : magnitudeInBase;

    mutation.mutate({ type, qtyInBase: signed, reason: REASON_TEXT[type] });
  };

  // Step 1: pick a reason.
  if (!type) {
    return (
      <PanelShell title={ingredient.name} onCancel={onCancel}>
        <p className="mb-4 text-[13px] leading-[18px] text-steel">
          Currently{' '}
          <span className="font-mono text-ink">
            {hasPurchaseUnit
              ? `${baseToPurchaseDisplay(ingredient.currentQtyInBase, unitsPerBase)} ${ingredient.purchaseUnitName}`
              : `${ingredient.currentQtyInBase} ${unitLabel}`}
          </span>
        </p>
        <div className="grid grid-cols-1 gap-2">
          {REASONS.map((reason) => (
            <button
              key={reason.type}
              type="button"
              onClick={() => setType(reason.type)}
              className="flex min-h-[56px] items-center gap-3 rounded-xl border border-black/5 shadow-card bg-white px-4 text-left transition-transform duration-100 active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span aria-hidden="true" className="font-mono text-xl">
                {reason.icon}
              </span>
              <span>
                <span className="block text-[15px] font-semibold leading-5">{reason.label}</span>
                <span className="block text-[12px] leading-4 text-steel">{reason.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </PanelShell>
    );
  }

  // RECOUNT needs a direction before a magnitude means anything.
  if (type === 'RECOUNT' && !recountDirection) {
    return (
      <PanelShell title="Recount" onCancel={() => setType(null)}>
        <p className="mb-4 text-[15px] leading-[22px]">
          Compared to what the system shows, the count found:
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setRecountDirection('MORE')}
            className="flex min-h-[72px] flex-col items-center justify-center rounded-xl border border-black/5 shadow-card bg-white text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span aria-hidden="true" className="font-mono text-2xl">
              +
            </span>
            More
          </button>
          <button
            type="button"
            onClick={() => setRecountDirection('LESS')}
            className="flex min-h-[72px] flex-col items-center justify-center rounded-xl border border-black/5 shadow-card bg-white text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span aria-hidden="true" className="font-mono text-2xl">
              −
            </span>
            Less
          </button>
        </div>
      </PanelShell>
    );
  }

  // Step 2: the quantity, in the ingredient's own purchase unit.
  return (
    <PanelShell title={REASONS.find((r) => r.type === type).label} onCancel={() => setType(null)}>
      <QuantityStep
        unitLabel={unitLabel}
        unitsPerBase={unitsPerBase}
        hasPurchaseUnit={hasPurchaseUnit}
        baseUnit={ingredient.baseUnit}
        isBusy={mutation.isPending}
        error={error}
        onCancel={() => (type === 'RECOUNT' ? setRecountDirection(null) : setType(null))}
        onConfirm={submit}
      />
    </PanelShell>
  );
}

/** Split out so its own `useState` for the live conversion text is legal. */
function QuantityStep({ unitLabel, unitsPerBase, hasPurchaseUnit, baseUnit, isBusy, error, onCancel, onConfirm }) {
  const [helper, setHelper] = useState('');

  return (
    <NumericKeypad
      title={`Quantity (${unitLabel})`}
      suffix={unitLabel}
      allowDecimal={hasPurchaseUnit}
      helperText={
        hasPurchaseUnit && helper
          ? `= ${purchaseToBaseInteger(helper, unitsPerBase) ?? '…'} ${BASE_UNIT_SHORT_LABELS[baseUnit]}`
          : null
      }
      onChange={setHelper}
      confirmLabel="Save"
      cancelLabel="Back"
      busy={isBusy}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
