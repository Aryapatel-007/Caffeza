import { useState } from 'react';

import Bilingual from './Bilingual.jsx';
import { CLOCK_LABELS } from './labels.js';

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
    'flex min-h-[72px] items-center justify-center rounded-xl border border-black/5 shadow-card bg-white font-mono text-2xl font-medium text-ink ' +
    'active:translate-y-0.5 transition-transform duration-100 ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40';

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[48px] rounded-lg border border-steel/60 px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <Bilingual label={CLOCK_LABELS.back} size="sm" />
        </button>
        <span className="text-[15px] font-semibold text-ink">{personName}</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Bilingual label={CLOCK_LABELS.enterPin} size="md" align="center" />
        <div
          aria-live="polite"
          className="flex h-12 items-center gap-3 font-mono text-3xl tracking-[0.3em] text-ink"
        >
          {Array.from({ length: MAX }).map((_, index) => (
            <span
              key={index}
              className={`inline-block h-3 w-3 rounded-full ${
                index < pin.length ? 'bg-ink' : 'bg-steel/30'
              }`}
            />
          ))}
        </div>
        {errorLabel && (
          <p lang="hi" className="text-center text-[15px] font-medium text-mirch">
            {errorLabel.en}
            <span className="block text-[13px] font-normal text-mirch/80">{errorLabel.hi}</span>
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
          <span className="sr-only">{CLOCK_LABELS.clear.en}</span>
        </button>

        <button key="0" type="button" className={keyBase} onClick={() => press('0')} disabled={busy}>
          0
        </button>

        <button
          type="button"
          onClick={submit}
          disabled={pin.length < MIN || busy}
          className={
            'flex min-h-[72px] items-center justify-center rounded-xl border border-black/5 shadow-card bg-chana text-3xl text-ink ' +
            'active:translate-y-0.5 transition-transform duration-100 ' +
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40'
          }
        >
          <span aria-hidden="true">✓</span>
          <span className="sr-only">Enter PIN</span>
        </button>
      </div>
    </div>
  );
}
