import { useState } from 'react';

import Bilingual from '../i18n/Bilingual.jsx';
import { LABELS } from '../i18n/labels.js';

/**
 * A numeric PIN entry, for the clock screen and nowhere else.
 *
 * The only text input a staff member reaches on this product. Big digits, whole
 * buttons as targets, a green tick to send and a steel clear. No free text, no
 * keyboard. 4 to 6 digits, matching the server.
 */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const MIN = 4;
const MAX = 6;

export default function PinPad({ personName, onSubmit, onBack, busy = false, errorLabel = null }) {
  const [pin, setPin] = useState('');

  const press = (digit) => {
    if (busy || pin.length >= MAX) return;
    setPin((current) => current + digit);
  };
  const clear = () => setPin('');
  const submit = () => {
    if (pin.length < MIN || busy) return;
    onSubmit(pin);
    setPin('');
  };

  const keyBase =
    'flex min-h-[72px] items-center justify-center rounded-lg border border-line bg-surface font-mono text-2xl font-medium text-ink ' +
    ' ' +
    ' disabled:opacity-40';

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-12 rounded-lg border border-muted px-4 "
        >
          <Bilingual k="back" size="sm" />
        </button>
        <span className="type-body font-semibold font-semibold text-ink">{personName}</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Bilingual k="clockEnterPin" size="md" align="center" />
        <div
          aria-live="polite"
          className="flex min-h-12 items-center gap-3 font-mono text-3xl text-ink"
        >
          {Array.from({ length: MAX }).map((_, index) => (
            <span
              key={index}
              className={`inline-block h-3 w-3 rounded-full ${
 index < pin.length ? 'bg-ink' : 'bg-line'
 }`}
            />
          ))}
        </div>
        {errorLabel && (
          <p className="flex justify-center text-alert">
            <Bilingual k={errorLabel} align="center" />
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((digit) => (
          <button
            key={digit}
            type="button"
            className={keyBase}
            onClick={() => press(digit)}
            disabled={busy}
          >
            {digit}
          </button>
        ))}

        <button type="button" className={keyBase} onClick={clear} disabled={busy || pin.length === 0}>
          <span aria-hidden="true">⌫</span>
          <span className="sr-only">{LABELS.clear}</span>
        </button>

        <button key="0" type="button" className={keyBase} onClick={() => press('0')} disabled={busy}>
          0
        </button>

        <button
          type="button"
          onClick={submit}
          disabled={pin.length < MIN || busy}
          className={
            'flex min-h-[72px] items-center justify-center rounded-lg bg-accent text-3xl text-on-accent ' +
            ' ' +
            ' disabled:opacity-40'
          }
        >
          <span aria-hidden="true">✓</span>
          <span className="sr-only">Enter PIN</span>
        </button>
      </div>
    </div>
  );
}
