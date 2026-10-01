import { useState } from 'react';

import NumericKeypad from '../../components/ui/NumericKeypad.jsx';
import { formatPaise, paiseToInput, parseRupeesToPaise } from '../../utils/formatMoney.js';
import { BILL_LABELS } from './labels.js';
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
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold leading-6">Select payment method</h2>
          <span className="text-[12px] text-steel">
            Outstanding{' '}
            <span className="font-mono font-semibold text-ink">{formatPaise(outstandingInPaise)}</span>
          </span>
        </div>
        <MethodButtons methods={methods} selected={method?.code} onPick={setMethod} />
      </div>

      {method && (
        <div className="rounded-2xl bg-white p-4 shadow-card">
          {method.code !== 'CASH' && (
            <label className="mb-4 block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-steel">
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
                className="h-12 w-full rounded-xl bg-linen px-4 text-[15px] placeholder:text-steel focus:bg-white focus:outline-none focus:ring-2 focus:ring-chana"
              />
            </label>
          )}

          <NumericKeypad
            key={`${method.code}-${outstandingInPaise}`}
            title={`${BILL_LABELS.amountReceived.en} · ${method.name}`}
            prefix="₹"
            allowDecimal
            initialValue={paiseToInput(outstandingInPaise)}
            confirmLabel={`${BILL_LABELS.recordPayment.en}`}
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
