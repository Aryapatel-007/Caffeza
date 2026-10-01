import { useState } from 'react';

import NumericKeypad from '../../components/ui/NumericKeypad.jsx';
import { formatPaise, parseRupeesToPaise } from '../../utils/formatMoney.js';
import ReasonPicker, { isReasonComplete, reasonBody } from '../orders/ReasonPicker.jsx';
import { DISCOUNT_REASONS, PLATFORM_DISCOUNT_REASONS } from './discountReasons.js';
import { BILL_LABELS } from './labels.js';
import PanelShell from './PanelShell.jsx';

const PERCENT_PRESETS = [5, 10, 20, 50];

/**
 * Applying a bill-level discount.
 *
 * The server decides who may (billPermissionService.js); hiding this panel is
 * a convenience, not the control.
 *
 * Percent or flat, a few percent presets, the keypad, then a reason. P08: the
 * reason is one of the fixed discount reasons, with an optional note that is
 * required for Other. For a platform reason a small choice asks who paid for
 * it. A cashier, when the owner allows it, is shown the platform reasons only.
 *
 * The discount shown here is a preview for the cashier to read out. Nothing
 * here works out GST or a new bill total: the server does that, in tax.js,
 * when the discount is applied, and the bill screen shows the result.
 */
export default function DiscountPanel({
  billNumber,
  subtotalInPaise,
  platformOnly = false,
  isBusy,
  error,
  onCancel,
  onConfirm,
}) {
  const [kind, setKind] = useState('PERCENT');
  const [preset, setPreset] = useState(null);
  const [keypadKey, setKeypadKey] = useState(0);
  const [reason, setReason] = useState({ reasonCode: null, note: '' });
  const [fundedBy, setFundedBy] = useState('RESTAURANT');
  const [pendingValue, setPendingValue] = useState(null);

  const reasons = platformOnly ? PLATFORM_DISCOUNT_REASONS : DISCOUNT_REASONS;
  const isPlatformReason = PLATFORM_DISCOUNT_REASONS.some((entry) => entry.code === reason.reasonCode);
  const percentTooHigh = kind === 'PERCENT' && pendingValue !== null && pendingValue > 100;
  const ready = pendingValue !== null && !percentTooHigh && isReasonComplete(reason);

  // Display only, rounded half away from zero like the server. The server's figure is the real one.
  const previewInPaise =
    pendingValue === null
      ? null
      : kind === 'FLAT'
        ? pendingValue
        : Math.round((subtotalInPaise * Math.min(pendingValue, 100)) / 100);

  const chooseKind = (next) => {
    setKind(next);
    setPreset(null);
    setPendingValue(null);
    setKeypadKey((current) => current + 1);
  };

  const choosePreset = (percent) => {
    setKind('PERCENT');
    setPreset(percent);
    setPendingValue(percent);
    setKeypadKey((current) => current + 1);
  };

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
    <PanelShell
      wide
      title={BILL_LABELS.applyDiscount.en}
      subtitle={`${billNumber ? `Bill ${billNumber} · ` : ''}Item total ${formatPaise(subtotalInPaise)}`}
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-4 rounded-2xl bg-linen p-4">
          <div className="grid grid-cols-2 rounded-full bg-linen-3 p-1">
            {[
              { value: 'PERCENT', label: 'Percent off (%)' },
              { value: 'FLAT', label: 'Amount off (₹)' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={kind === option.value}
                onClick={() => chooseKind(option.value)}
                className={[
                  'h-10 rounded-full text-[14px] font-semibold transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                  kind === option.value ? 'bg-white text-ink shadow-card' : 'text-steel hover:text-ink',
                ].join(' ')}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {PERCENT_PRESETS.map((percent) => {
              const active = kind === 'PERCENT' && preset === percent && pendingValue === percent;
              return (
                <button
                  key={percent}
                  type="button"
                  aria-pressed={active}
                  onClick={() => choosePreset(percent)}
                  className={[
                    'flex h-14 flex-col items-center justify-center rounded-xl font-mono shadow-card transition-transform active:scale-95',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                    active ? 'bg-ink text-white' : 'bg-white text-ink hover:bg-linen-2',
                  ].join(' ')}
                >
                  <span className="text-[14px] font-bold">{percent}%</span>
                  <span className={['text-[10px]', active ? 'text-white/70' : 'text-steel'].join(' ')}>
                    {formatPaise(Math.round((subtotalInPaise * percent) / 100))}
                  </span>
                </button>
              );
            })}
          </div>

          <NumericKeypad
            key={`${kind}-${keypadKey}`}
            title={kind === 'FLAT' ? 'Amount off' : 'Percent off'}
            prefix={kind === 'FLAT' ? '₹' : undefined}
            suffix={kind === 'PERCENT' ? '%' : undefined}
            allowDecimal={kind === 'FLAT'}
            maxIntegerDigits={kind === 'FLAT' ? 6 : 3}
            initialValue={preset !== null && kind === 'PERCENT' ? String(preset) : ''}
            helperText={percentTooHigh ? 'A discount cannot be more than 100%.' : null}
            onChange={(raw) => {
              const numeric = kind === 'FLAT' ? parseRupeesToPaise(raw) : Number(raw);
              setPendingValue(Number.isFinite(numeric) && numeric > 0 ? numeric : null);
              if (kind === 'PERCENT' && Number(raw) !== preset) setPreset(null);
            }}
            hideActions
          />
        </section>

        <ReasonPicker reasons={reasons} value={reason} onChange={setReason} />

        {isPlatformReason && (
          <fieldset>
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-steel">
              Paid for by
            </legend>
            <div className="inline-flex rounded-full bg-linen-2 p-1">
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
                    'h-10 rounded-full px-5 text-[13px] font-semibold',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                    fundedBy === option.value ? 'bg-chana text-ink shadow-card' : 'text-steel',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <section className="rounded-2xl bg-linen p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-steel">Preview</span>
            {previewInPaise !== null && (
              <span className="rounded-full bg-patta-tint px-2.5 py-0.5 text-[12px] font-semibold">
                Guest saves {formatPaise(previewInPaise)}
              </span>
            )}
          </div>
          <dl className="mt-3 space-y-1.5 font-mono text-[13px]">
            <div className="flex justify-between">
              <dt className="text-steel">Item total</dt>
              <dd>{formatPaise(subtotalInPaise)}</dd>
            </div>
            <div className="flex justify-between text-patta">
              <dt>Discount</dt>
              <dd>{previewInPaise === null ? '—' : `− ${formatPaise(previewInPaise)}`}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[12px] leading-4 text-steel">
            GST and the new bill total are worked out when the discount is applied.
          </p>
        </section>

        {error && <p className="text-[13px] leading-[18px] text-mirch">{error}</p>}

        <div className="sticky bottom-0 -mx-5 flex flex-col gap-1 bg-white px-5 pb-1 pt-3 shadow-[0_-4px_20px_rgba(28,27,25,0.06)] sm:-mx-8 sm:px-8">
          <button
            type="button"
            onClick={submit}
            disabled={!ready || isBusy}
            className="flex h-14 w-full items-center justify-between rounded-full bg-chana px-6 text-[15px] font-bold text-ink shadow-card transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
          >
            <span>{isBusy ? 'Applying…' : BILL_LABELS.applyDiscount.en}</span>
            {previewInPaise !== null && (
              <span className="font-mono">− {formatPaise(previewInPaise)} →</span>
            )}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-11 w-full rounded-full text-[13px] font-medium text-steel hover:bg-linen focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            Discard and return to the bill
          </button>
        </div>
      </div>
    </PanelShell>
  );
}
