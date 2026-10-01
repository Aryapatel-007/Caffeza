import { useState } from 'react';

/**
 * A large on-screen numeric keypad, for every money and quantity entry on a
 * service screen.
 *
 * Not a text input with a system keyboard. The operator here may be standing,
 * in a hurry, and the system keyboard's tiny number row is the wrong tool for
 * a cashier entering a payment or a storekeeper entering a stock count.
 *
 * Generic on purpose: M3 uses it for a payment amount and a discount, M4 uses
 * it for a stock quantity. The caller supplies the prefix or suffix ("₹", "%",
 * "g") and does the unit conversion; this component only ever produces the
 * plain string the person typed, entered digit by digit, in Plex Mono.
 *
 * `onChange` fires on every keystroke so a caller can show live, derived text
 * underneath the display — M4's "2 kg = 2000 g" working, for one.
 */
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export default function NumericKeypad({
  title,
  prefix = '',
  suffix = '',
  allowDecimal = true,
  maxIntegerDigits = 8,
  initialValue = '',
  helperText = null,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onChange,
  onConfirm,
  onCancel,
  busy = false,
  disabled = false,
  error = null,
  /**
   * Hides the built-in Cancel/Confirm row. For a caller embedding the keypad
   * inside its own panel that needs one shared confirm button covering more
   * than just this value — DiscountPanel also needs a kind toggle and a
   * reason before anything can be submitted, so it supplies its own footer
   * and reads the typed value back through `onChange`.
   */
  hideActions = false,
}) {
  const [value, setValue] = useState(initialValue);

  const update = (next) => {
    setValue(next);
    onChange?.(next);
  };

  const press = (digit) => {
    if (busy || disabled) return;

    if (digit === '.') {
      if (!allowDecimal || value.includes('.')) return;
      update(value === '' ? '0.' : `${value}.`);
      return;
    }

    const [whole, fraction] = value.split('.');
    if (fraction !== undefined && fraction.length >= 2) return;
    if (fraction === undefined && whole && whole.replace('-', '').length >= maxIntegerDigits) return;

    update(value === '0' ? digit : value + digit);
  };

  const backspace = () => {
    if (busy || disabled) return;
    update(value.slice(0, -1));
  };

  const clear = () => {
    if (busy || disabled) return;
    update('');
  };

  const canConfirm = value !== '' && value !== '.' && !busy && !disabled;

  const displayValue = value === '' ? '0' + (allowDecimal ? '.00' : '') : value;

  const keyBase =
    'flex min-h-[64px] items-center justify-center rounded-xl border border-black/5 shadow-card bg-white ' +
    'font-mono text-2xl font-medium text-ink transition-transform duration-100 active:translate-y-0.5 ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ' +
    'disabled:opacity-40';

  return (
    <div className="flex w-full flex-col gap-4">
      {title && (
        <p className="text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
          {title}
        </p>
      )}

      {/*
        The value being typed. This is what "numbers carry the meaning" means
        in practice: it is the largest, plainest thing in this component.
      */}
      <div className="flex items-baseline justify-center gap-1 rounded-xl border border-black/5 shadow-card bg-white px-4 py-5">
        {prefix && <span className="font-mono text-2xl text-steel">{prefix}</span>}
        <span className="font-mono text-[40px] font-semibold leading-none text-ink" aria-live="polite">
          {displayValue}
        </span>
        {suffix && <span className="font-mono text-2xl text-steel">{suffix}</span>}
      </div>

      {helperText && (
        <p className="text-center text-[13px] leading-[18px] text-steel">{helperText}</p>
      )}
      {error && <p className="text-center text-[13px] leading-[18px] text-mirch">{error}</p>}

      <div className="grid grid-cols-3 gap-3">
        {DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            className={keyBase}
            onClick={() => press(digit)}
            disabled={busy || disabled}
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          className={keyBase}
          onClick={backspace}
          disabled={busy || disabled || value === ''}
        >
          <span aria-hidden="true">⌫</span>
          <span className="sr-only">Backspace</span>
        </button>

        <button type="button" className={keyBase} onClick={() => press('0')} disabled={busy || disabled}>
          0
        </button>

        {allowDecimal ? (
          <button
            type="button"
            className={keyBase}
            onClick={() => press('.')}
            disabled={busy || disabled || value.includes('.')}
          >
            .
          </button>
        ) : (
          <button
            type="button"
            className={keyBase}
            onClick={clear}
            disabled={busy || disabled || value === ''}
          >
            <span className="text-sm font-semibold">Clear</span>
          </button>
        )}
      </div>

      {!hideActions && (
        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="h-14 flex-1 rounded-xl border-2 border-steel/40 text-[15px] font-semibold text-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => canConfirm && onConfirm(value)}
            disabled={!canConfirm}
            className="h-14 flex-[2] rounded-xl bg-chana text-[15px] font-semibold text-ink transition-transform duration-100 active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      )}
    </div>
  );
}
