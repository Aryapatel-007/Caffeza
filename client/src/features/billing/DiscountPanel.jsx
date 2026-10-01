import { useState } from 'react';

import NumericKeypad from '../../components/ui/NumericKeypad.jsx';
import { formatPaise, parseRupeesToPaise } from '../../utils/formatMoney.js';
import ReasonPicker, { isReasonComplete, reasonBody } from '../orders/ReasonPicker.jsx';
import { DISCOUNT_REASONS, PLATFORM_DISCOUNT_REASONS } from './discountReasons.js';
import { BILL_LABELS } from './labels.js';
import PanelShell from './PanelShell.jsx';

/**
 * Applying a bill-level discount.
 *
 * The server decides who may (billPermissionService.js); hiding this panel is
 * a convenience, not the control.
 *
 * A flat-versus-percent toggle, then the keypad in whichever unit was picked,
 * then a reason. P08: the reason is one of the fixed discount reasons, with an
 * optional note that is required for Other, the same picker cancels use. For a
 * platform reason a small choice asks who paid for it. A cashier, when the
 * owner allows it, is shown the platform reasons only.
 */
export default function DiscountPanel({ subtotalInPaise, platformOnly = false, isBusy, error, onCancel, onConfirm }) {
  const [kind, setKind] = useState('FLAT');
  const [reason, setReason] = useState({ reasonCode: null, note: '' });
  const [fundedBy, setFundedBy] = useState('RESTAURANT');
  const [pendingValue, setPendingValue] = useState(null);

  const reasons = platformOnly ? PLATFORM_DISCOUNT_REASONS : DISCOUNT_REASONS;
  const isPlatformReason = PLATFORM_DISCOUNT_REASONS.some((entry) => entry.code === reason.reasonCode);
  const ready = pendingValue !== null && isReasonComplete(reason);

  const submit = () => {
    if (!ready) return;
    const common = { ...reasonBody(reason), fundedBy: isPlatformReason ? fundedBy : 'RESTAURANT' };

    if (kind === 'FLAT') {
      onConfirm({ kind: 'FLAT', valueInPaise: pendingValue, ...common });
    } else {
      // rateBps: 10% typed as "10" becomes 1000 basis points.
      onConfirm({ kind: 'PERCENT', rateBps: Math.round(pendingValue * 100), ...common });
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
              'min-h-[48px] rounded-xl border-2 text-[15px] font-semibold',
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

      <ReasonPicker reasons={reasons} value={reason} onChange={setReason} />

      {isPlatformReason && (
        <fieldset className="mb-6">
          <legend className="mb-2 text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
            Paid for by
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'RESTAURANT', label: 'Restaurant' },
              { value: 'PLATFORM', label: 'Platform' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={fundedBy === option.value}
                onClick={() => setFundedBy(option.value)}
                className={[
                  'min-h-[48px] rounded-xl border-2 text-[15px] font-semibold',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                  fundedBy === option.value ? 'border-ink bg-chana/20' : 'border-steel/40 text-steel',
                ].join(' ')}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

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
          disabled={!ready || isBusy}
          className="h-14 flex-[2] rounded-xl bg-chana text-[15px] font-semibold text-ink transition-transform duration-100 active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          {isBusy ? 'Applying…' : BILL_LABELS.applyDiscount.en}
        </button>
      </div>
    </PanelShell>
  );
}
