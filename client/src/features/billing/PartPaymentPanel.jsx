import { useState } from 'react';

import Button from '../../components/ui/Button.jsx';
import Money from '../../components/ui/Money.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { parseRupeesToPaise, paiseToInput } from '../../utils/formatMoney.js';
import Bilingual from '../i18n/Bilingual.jsx';
import { METHOD_KEYS } from '../i18n/labels.js';

/** P43. Used only before /auth/me carries the restaurant's own list (P47), as on the main panel. */
const FALLBACK_OTHER_MODES = ['Swiggy Dineout', 'Zomato Dineout', 'EazyDiner', 'Cheque', 'Bank transfer', 'Coupon'];

/**
 * Part payment (2026-11-03): one bill paid with several methods at once. Every
 * method this bill may use is a row; the cashier types how much came by each
 * (₹400 cash, ₹600 UPI) and records them together. Each row becomes one
 * ordinary payment, the same POST /bills/:id/payments the main panel sends,
 * so the server checks every part exactly as it checks a single payment.
 *
 * A card-machine method is left out: it needs the machine, one amount at a
 * time, so it stays on the main panel.
 */
export function partsFrom(methods, amounts, references) {
  return methods
    .map((method) => ({ method, amountInPaise: parseRupeesToPaise(amounts[method.code] ?? '') }))
    .filter((part) => part.amountInPaise !== null && part.amountInPaise > 0)
    .map(({ method, amountInPaise }) => ({
      method: method.code,
      methodName: method.name,
      amountInPaise,
      reference: (references[method.code] ?? '').trim() || null,
    }));
}

export default function PartPaymentPanel({ methods, outstandingInPaise, isBusy, error, onCancel, onConfirm }) {
  const { features } = useAuth();
  const otherModes = features?.payments?.otherModes ?? FALLBACK_OTHER_MODES;
  const usable = methods.filter((method) => !method.terminalProvider);
  const [amounts, setAmounts] = useState({});
  const [references, setReferences] = useState({});

  const parts = partsFrom(usable, amounts, references);
  const enteredInPaise = parts.reduce((sum, part) => sum + part.amountInPaise, 0);
  const leftInPaise = outstandingInPaise - enteredInPaise;
  const badAmount = usable.some((method) => (amounts[method.code] ?? '').trim() !== '' && parseRupeesToPaise(amounts[method.code]) === null);
  const otherWithoutMode = parts.some((part) => part.method === 'OTHER' && !part.reference);
  const canRecord = parts.length > 0 && leftInPaise >= 0 && !badAmount && !otherWithoutMode && !isBusy;

  const setAmount = (code, value) => setAmounts((current) => ({ ...current, [code]: value }));
  /** Puts whatever is not yet entered on this row. */
  const fillRest = (code) => {
    const own = parseRupeesToPaise(amounts[code] ?? '') ?? 0;
    const rest = leftInPaise + own;
    if (rest > 0) setAmount(code, paiseToInput(rest));
  };

  return (
    <section aria-label="Part payment" className="flex flex-col gap-4">
      <div className="rounded-[10px] border-2 border-ink bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="type-heading">Part payment</h2>
          <span className="type-label text-muted">
            To collect <Money paise={outstandingInPaise} size="num" className="text-ink" />
          </span>
        </div>
        <p className="type-caption mb-3 text-muted">Type how much the guest paid by each method. Leave the others empty.</p>

        <ul className="flex flex-col gap-3">
          {usable.map((method) => {
            const value = amounts[method.code] ?? '';
            const isOther = method.code === 'OTHER';
            const hasAmount = (parseRupeesToPaise(value) ?? 0) > 0;
            return (
              <li key={method.code} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-24 flex-1">
                    <Bilingual k={METHOD_KEYS[method.code] ?? method.code} en={method.name} size="md" />
                  </div>
                  <label className="flex min-h-12 items-center gap-1 rounded-lg border border-muted bg-surface px-3">
                    <span className="type-body text-muted">₹</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Amount by ${method.name}`}
                      value={value}
                      onChange={(event) => setAmount(method.code, event.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="0"
                      className="type-num w-28 bg-transparent text-right outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => fillRest(method.code)}
                    disabled={leftInPaise + (parseRupeesToPaise(value) ?? 0) <= 0}
                    className="type-label min-h-12 rounded-lg px-3 text-accent underline-offset-4 hover:underline disabled:opacity-40"
                  >
                    Rest
                  </button>
                </div>
                {isOther && hasAmount && (
                  <div className="mt-2">
                    <div className="mb-2 flex flex-wrap gap-2">
                      {otherModes.map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={references.OTHER === mode}
                          onClick={() => setReferences((current) => ({ ...current, OTHER: mode }))}
                          className={[
                            'type-label min-h-12 rounded-lg border px-3',
                            references.OTHER === mode ? 'border-2 border-ink bg-sunken' : 'border-line bg-surface hover:bg-sunken',
                          ].join(' ')}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      aria-label="Mode of payment"
                      maxLength={100}
                      value={references.OTHER ?? ''}
                      onChange={(event) => setReferences((current) => ({ ...current, OTHER: event.target.value }))}
                      placeholder="Mode of payment, for example Cheque"
                      className="min-h-12 w-full rounded-lg border border-muted bg-surface px-4 type-body placeholder:text-muted"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {usable.length < methods.length && (
          <p className="type-caption mt-2 text-muted">Card machine payments are taken one at a time on the main panel.</p>
        )}

        <div
          aria-live="polite"
          className={['mt-4 rounded-lg border-l-[3px] bg-sunken p-3', leftInPaise < 0 ? 'border-l-alert' : leftInPaise === 0 ? 'border-l-ok' : 'border-l-accent'].join(' ')}
        >
          <p className="type-body flex flex-wrap justify-between gap-2">
            <span>Entered</span>
            <Money paise={enteredInPaise} />
          </p>
          {leftInPaise > 0 && (
            <p className="type-body flex flex-wrap justify-between gap-2">
              <span>Still to collect</span>
              <Money paise={leftInPaise} />
            </p>
          )}
          {leftInPaise === 0 && <p className="type-body text-ok">Matches the bill. It will be paid in full.</p>}
          {leftInPaise < 0 && (
            <p className="type-body text-alert">
              <Money paise={-leftInPaise} /> more than the bill. Lower an amount.
            </p>
          )}
          {badAmount && <p className="type-body text-alert">An amount is not a number of rupees.</p>}
          {otherWithoutMode && <p className="type-body text-alert">Pick or type the mode of payment for Other.</p>}
        </div>

        {error && <p className="type-body mt-3 text-alert">{error}</p>}

        <div className="mt-4 flex flex-col gap-2">
          <Button size="lg" fullWidth disabled={!canRecord} isLoading={isBusy} onClick={() => onConfirm(parts)}>
            {parts.length > 1 ? `Record ${parts.length} payments` : 'Record payment'}
          </Button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="type-label min-h-12 w-full rounded-lg text-accent underline-offset-4 hover:underline disabled:opacity-50"
          >
            Back to one method
          </button>
        </div>
      </div>
    </section>
  );
}
