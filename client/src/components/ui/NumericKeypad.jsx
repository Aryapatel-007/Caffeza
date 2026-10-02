import { useState } from 'react';

import { BackIcon } from './icons/index.jsx';

/**
 * A large on-screen numeric keypad, for every money and quantity entry on a
 * service screen. DESIGN-SYSTEM-V2 section 9: kept from version 1, restyled,
 * with the display in `num-hero` on `sunken`.
 *
 * Not a text input with a system keyboard. The operator may be standing, in a
 * hurry, and the phone keyboard's tiny number row is the wrong tool for money.
 *
 * Generic on purpose: M3 uses it for a payment and a discount, M4 for a stock
 * quantity. The caller supplies the prefix or suffix ("₹", "%", "g") and does
 * the unit conversion; this component only produces the plain string typed.
 *
 * `onChange` fires on every keystroke so a caller can show live derived text
 * underneath the display. A physical keyboard works too: digits, the point,
 * Backspace, and Enter to confirm, while the keypad has focus.
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
   * Hides the built-in Cancel/Confirm row, for a caller whose own footer
   * confirms more than this value (DiscountPanel also needs a kind and a
   * reason), reading the typed value back through `onChange`.
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

  const onKeyDown = (event) => {
    if (/^[0-9]$/.test(event.key)) press(event.key);
    else if (event.key === '.') press('.');
    else if (event.key === 'Backspace') backspace();
    else if (event.key === 'Enter' && canConfirm && !hideActions) onConfirm?.(value);
    else return;
    event.preventDefault();
  };

  const displayValue = value === '' ? '0' + (allowDecimal ? '.00' : '') : value;

  const keyBase =
    'flex min-h-16 items-center justify-center rounded-lg border border-line bg-surface ' +
    'type-num-tile text-ink transition-colors hover:bg-sunken active:bg-sunken ' +
    'disabled:opacity-40';

  return (
    <div className="flex w-full flex-col gap-4" onKeyDown={onKeyDown}>
      {title && <p className="type-label text-muted">{title}</p>}

      <div className="flex items-baseline justify-center gap-1 rounded-lg bg-sunken px-4 py-4">
        {prefix && <span className="type-num-tile text-muted">{prefix}</span>}
        <span className="type-num-hero text-ink" aria-live="polite">
          {displayValue}
        </span>
        {suffix && <span className="type-num-tile text-muted">{suffix}</span>}
      </div>

      {helperText && <p className="type-caption text-center text-muted">{helperText}</p>}
      {error && <p className="type-caption text-center text-alert">{error}</p>}

      <div className="grid grid-cols-3 gap-2">
        {DIGITS.map((digit) => (
          <button key={digit} type="button" className={keyBase} onClick={() => press(digit)} disabled={busy || disabled}>
            {digit}
          </button>
        ))}

        <button type="button" className={keyBase} onClick={backspace} disabled={busy || disabled || value === ''}>
          <BackIcon />
          <span className="sr-only">Backspace</span>
        </button>

        <button type="button" className={keyBase} onClick={() => press('0')} disabled={busy || disabled}>
          0
        </button>

        {allowDecimal ? (
          <button type="button" className={keyBase} onClick={() => press('.')} disabled={busy || disabled || value.includes('.')}>
            .
          </button>
        ) : (
          <button type="button" className={keyBase} onClick={clear} disabled={busy || disabled || value === ''}>
            <span className="type-label">Clear</span>
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
              className="type-button min-h-14 flex-1 rounded-lg border border-ink bg-surface text-ink hover:bg-sunken disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => canConfirm && onConfirm(value)}
            disabled={!canConfirm}
            className="type-button min-h-14 flex-[2] rounded-lg bg-accent text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      )}
    </div>
  );
}
