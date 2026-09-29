import { useState } from 'react';

import NumericKeypad from '../../components/ui/NumericKeypad.jsx';
import { formatPaise, parseRupeesToPaise } from '../../utils/formatMoney.js';
import { BILL_LABELS } from './labels.js';
import PanelShell from './PanelShell.jsx';

/**
 * Applying a bill-level discount.
 *
 * OWNER and MANAGER only, enforced by the server (billPermissionService.js);
 * hiding this panel from a cashier is a convenience, not the control.
 *
 * A flat-versus-percent toggle, then the keypad in whichever unit was picked,
 * then a reason. Every discount requires a reason on the server, and it is a
 * free-text field here rather than a fixed tile: a manager's reasoning is real
 * prose, not one of a handful of predictable categories the way M4's wastage
 * reasons are, and the CancelPanel precedent already asks for one the same way.
 */
export default function DiscountPanel({ subtotalInPaise, isBusy, error, onCancel, onConfirm }) {
  const [kind, setKind] = useState('FLAT');
  const [reason, setReason] = useState('');
  const [pendingValue, setPendingValue] = useState(null);

  const submit = () => {
    if (pendingValue === null || reason.trim().length === 0) return;

    if (kind === 'FLAT') {
      onConfirm({ kind: 'FLAT', valueInPaise: pendingValue, reason: reason.trim() });
    } else {
      // rateBps: 10% typed as "10" becomes 1000 basis points.
      onConfirm({ kind: 'PERCENT', rateBps: Math.round(pendingValue * 100), reason: reason.trim() });
    }
  };

  return (
    <PanelShell title={BILL_LABELS.applyDiscount.en} onCancel={onCancel}>
      <p className="mb-4 text-[13px] leading-[18px] text-steel">
        Subtotal: <span className="font-mono text-ink">{formatPaise(subtotalInPaise)}</span>
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {[
          { value: 'FLAT', label: 'Amount off' },
          { value: 'PERCENT', label: 'Percent off' },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setKind(option.value);
              setPendingValue(null);
            }}
            className={[
              'min-h-[48px] rounded-[10px] border-2 text-[15px] font-semibold',
              kind === option.value ? 'border-ink bg-chana/20' : 'border-steel/40 text-steel',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <NumericKeypad
          key={kind}
          title={kind === 'FLAT' ? 'Amount off' : 'Percent off'}
          prefix={kind === 'FLAT' ? '₹' : undefined}
          suffix={kind === 'PERCENT' ? '%' : undefined}
          allowDecimal={kind === 'FLAT'}
          maxIntegerDigits={kind === 'FLAT' ? 6 : 3}
          onChange={(raw) => {
            const numeric = kind === 'FLAT' ? parseRupeesToPaise(raw) : Number(raw);
            setPendingValue(Number.isFinite(numeric) && numeric > 0 ? numeric : null);
          }}
          hideActions
        />
      </div>

      <label className="mb-4 block">
        <span className="mb-1 block text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
          {BILL_LABELS.reason.en}
        </span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={200}
          placeholder="Regular customer"
          className="w-full rounded-[10px] border-2 border-steel/40 bg-paper px-3 py-2 text-[15px] leading-[22px] placeholder:text-steel focus:border-ink focus:outline-none"
        />
      </label>

      {error && <p className="mb-3 text-[13px] leading-[18px] text-mirch">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-14 flex-1 rounded-xl border-2 border-steel/40 text-[15px] font-semibold text-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
        >
          {BILL_LABELS.cancel.en}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pendingValue === null || reason.trim().length === 0 || isBusy}
          className="h-14 flex-[2] rounded-xl bg-chana text-[15px] font-semibold text-ink transition-transform duration-100 active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          {isBusy ? 'Applying…' : BILL_LABELS.applyDiscount.en}
        </button>
      </div>
    </PanelShell>
  );
}
