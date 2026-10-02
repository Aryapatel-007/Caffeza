import { useState } from 'react';

import NumericKeypad from '../../components/ui/NumericKeypad.jsx';
import { parseRupeesToPaise } from '../../utils/formatMoney.js';
import ReasonPicker, { isReasonComplete, reasonBody } from '../../components/ui/ReasonPicker.jsx';
import { DISCOUNT_REASONS, PLATFORM_DISCOUNT_REASONS } from './discountReasons.js';
import { LABELS } from '../i18n/labels.js';
import Sheet from '../../components/ui/Sheet.jsx';
import Money, { moneyText } from '../../components/ui/Money.jsx';

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
    <Sheet
      wide
      title={LABELS.applyDiscount}
      subtitle={`${billNumber ? `Bill ${billNumber} · ` : ''}Item total ${moneyText(subtotalInPaise)}`}
      onCancel={onCancel}
      footer={
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={submit}
            disabled={!ready || isBusy}
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg bg-accent px-4 text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            <span className="type-button">{isBusy ? 'Applying…' : LABELS.applyDiscount}</span>
            {previewInPaise !== null && <span className="type-num">− {moneyText(previewInPaise)}</span>}
          </button>
          <button type="button" onClick={onCancel} className="type-label min-h-12 w-full rounded-lg text-ink hover:bg-sunken">
            Discard and return to the bill
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
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
                  'type-label min-h-12 rounded-lg transition-colors',
                  kind === option.value ? 'border-2 border-ink bg-sunken text-ink' : 'border border-line bg-surface text-muted hover:text-ink',
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
                    'flex min-h-14 flex-col items-center justify-center rounded-lg',
                    active ? 'border-2 border-ink bg-sunken text-ink' : 'border border-line bg-surface text-ink hover:bg-sunken',
                  ].join(' ')}
                >
                  <span className="type-num">{percent}%</span>
                  <Money paise={Math.round((subtotalInPaise * percent) / 100)} size="meta" className="text-muted" />
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
            <legend className="mb-2 type-label text-muted">
              Paid for by
            </legend>
            <div className="inline-flex gap-2">
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
                    'type-label min-h-12 rounded-lg px-5',
                    fundedBy === option.value ? 'border-2 border-ink bg-sunken text-ink' : 'border border-line bg-surface text-muted',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <section className="rounded-[10px] bg-sunken p-4">
          <p className="type-label">Preview</p>
          <dl className="mt-2 flex flex-col gap-1">
            <div className="flex justify-between">
              <dt className="type-body text-muted">Item total</dt>
              <dd className="type-num"><Money paise={subtotalInPaise} /></dd>
            </div>
            <div className="flex justify-between">
              <dt className="type-body text-muted">Discount</dt>
              <dd className="type-num">{previewInPaise === null ? '—' : `− ${moneyText(previewInPaise)}`}</dd>
            </div>
          </dl>
          <p className="mt-3 type-caption text-muted">
            GST and the new bill total are worked out when the discount is applied.
          </p>
        </section>

        {error && <p className="type-caption text-alert">{error}</p>}

      </div>
    </Sheet>
  );
}
