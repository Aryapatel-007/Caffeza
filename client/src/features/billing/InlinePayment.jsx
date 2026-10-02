import { useState } from 'react';

import Money from '../../components/ui/Money.jsx';
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
            confirmLabel={<Bilingual k="recordPayment" align="center" />}
            cancelLabel="Reset"
            busy={isBusy}
            error={error}
            onCancel={() => setReference('')}
            onConfirm={(raw) => {
              const amountInPaise = parseRupeesToPaise(raw);
              if (amountInPaise === null || amountInPaise <= 0) return;
              onConfirm({ method: method.code, amountInPaise, reference: reference.trim() || null });
            }}
          />
        </div>
      )}
    </section>
  );
}
