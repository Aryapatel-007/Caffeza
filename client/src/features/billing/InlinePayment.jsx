import { useState } from 'react';

import Money, { moneyText } from '../../components/ui/Money.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import CashCounter from '../cash/CashCounter.jsx';
import { countedTotal, suggestChange, toCashCount } from '../cash/cashCount.js';
import NumericKeypad from '../../components/ui/NumericKeypad.jsx';
import { paiseToInput, parseRupeesToPaise } from '../../utils/formatMoney.js';
import Bilingual from '../i18n/Bilingual.jsx';
import { LABELS } from '../i18n/labels.js';
import MethodButtons from './MethodButtons.jsx';

/**
 * Taking a payment on the bill screen itself, beside the bill, instead of in a
 * slide-over. The cashier sees the bill while choosing a method and typing an
 * amount. The amount starts as everything still owed, so the common case is
 * one tap on a method and one on Record payment. Methods are the restaurant's
 * configured ones this bill may use, passed in; the server still decides.
 */
export default function InlinePayment({ methods, outstandingInPaise, isBusy, error, onConfirm }) {
  // Until one is picked, the first allowed method is selected. Derived, because
  // the methods may still be loading when this mounts.
  const [picked, setMethod] = useState(null);
  const method = methods.find((candidate) => candidate.code === picked?.code) ?? methods[0] ?? null;
  const [reference, setReference] = useState('');
  // P25 Part F. On cash, the notes handed over: the change is worked out as they are counted.
  const { features } = useAuth();
  const denominations = features?.cash?.denominations ?? [];
  const [counts, setCounts] = useState({});
  const [counting, setCounting] = useState(false);
  const [typed, setTyped] = useState(null);
  const amountInPaise = typed === null ? outstandingInPaise : parseRupeesToPaise(typed);
  const isCash = method?.code === 'CASH';
  const tenderedInPaise = countedTotal(counts, denominations);
  const changeInPaise = tenderedInPaise - (amountInPaise ?? 0);
  const change = changeInPaise > 0 ? suggestChange(changeInPaise, denominations) : null;

  return (
    <section aria-label="Take payment" className="flex flex-col gap-4">
      <div className="rounded-[10px] border border-line bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="type-heading">Payment method</h2>
          <span className="type-label text-muted">
            {LABELS.outstanding} <Money paise={outstandingInPaise} size="num" className="text-ink" />
          </span>
        </div>
        <MethodButtons methods={methods} selected={method?.code} onPick={setMethod} />
      </div>

      {method && (
        <div className="rounded-[10px] border border-line bg-surface p-4">
          {method.code !== 'CASH' && (
            <label className="mb-4 block">
              <span className="mb-1 block type-label text-muted">
                Reference (optional)
              </span>
              <input
                type="text"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={100}
                placeholder={
                  method.code === 'UPI'
                    ? 'UPI reference'
                    : method.kind === 'PLATFORM'
                      ? 'Order or booking number'
                      : 'Last 4 digits'
                }
                className="min-h-12 w-full rounded-lg border border-muted bg-surface px-4 type-body placeholder:text-muted"
              />
            </label>
          )}

          <NumericKeypad
            key={`${method.code}-${outstandingInPaise}`}
            title={`${LABELS.amountReceived} · ${method.name}`}
            prefix="₹"
            allowDecimal
            initialValue={paiseToInput(outstandingInPaise)}
            onChange={setTyped}
            confirmLabel={<Bilingual k="recordPayment" align="center" />}
            cancelLabel="Reset"
            busy={isBusy}
            error={error}
            onCancel={() => {
              setReference('');
              setCounts({});
            }}
            onConfirm={(raw) => {
              const amount = parseRupeesToPaise(raw);
              if (amount === null || amount <= 0) return;
              const counted = isCash && counting && tenderedInPaise > 0;
              // Counted short of the amount: say so rather than record a payment the notes do not cover.
              if (counted && tenderedInPaise < amount) return;
              onConfirm({
                method: method.code,
                amountInPaise: amount,
                reference: reference.trim() || null,
                ...(counted
                  ? { tender: { cashCount: toCashCount(counts, denominations), tenderedInPaise, changeInPaise: tenderedInPaise - amount } }
                  : {}),
              });
            }}
          />

          {isCash && denominations.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
              <button
                type="button"
                aria-expanded={counting}
                onClick={() => setCounting((value) => !value)}
                className="min-h-12 self-start rounded-lg px-3 type-label text-accent underline-offset-4 hover:underline"
              >
                {counting ? 'Hide the note counter' : 'Count the notes handed over'}
              </button>
              {counting && (
                <>
                  <CashCounter title="Handed over" denominations={denominations} counts={counts} onChange={setCounts} />
                  {tenderedInPaise > 0 && (
                    <p className="type-heading" aria-live="polite">
                      {changeInPaise >= 0
                        ? `Received ${moneyText(tenderedInPaise)}. Change ${moneyText(changeInPaise)}.`
                        : `Received ${moneyText(tenderedInPaise)}. Short by ${moneyText(-changeInPaise)}.`}
                    </p>
                  )}
                  {change && change.give.length > 0 && (
                    <p className="type-body text-muted">
                      Give back{' '}
                      {change.give
                        .map((entry) => `${entry.count} × ${moneyText(entry.valueInPaise)} ${entry.kind === 'COIN' ? 'coin' : 'note'}`)
                        .join(', ')}
                      {change.remainderInPaise > 0 ? `, and ${moneyText(change.remainderInPaise)} more` : ''}.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
