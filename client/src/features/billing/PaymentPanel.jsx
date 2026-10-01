import { useState } from 'react';

import NumericKeypad from '../../components/ui/NumericKeypad.jsx';
import { formatPaise, paiseToInput, parseRupeesToPaise } from '../../utils/formatMoney.js';
import { BILL_LABELS } from './labels.js';
import MethodButtons from './MethodButtons.jsx';
import PanelShell from './PanelShell.jsx';

/**
 * Recording a payment.
 *
 * Two steps in one slide-over, the same shell CancelPanel uses: pick a method,
 * then confirm an amount. The amount starts prefilled with the full
 * outstanding balance, because a cashier collecting one payment for the whole
 * bill — the common case — should be able to tap the method and confirm
 * without typing a single digit. A split payment is still one tap away: clear
 * the keypad and type the partial amount.
 *
 * P08: the method tiles are the restaurant's configured methods this bill may
 * use, passed in by the bill screen. A Swiggy delivery bill shows only Swiggy.
 */
export default function PaymentPanel({ methods, outstandingInPaise, isBusy, error, onCancel, onConfirm }) {
  const [method, setMethod] = useState(null);
  const [reference, setReference] = useState('');

  if (!method) {
    return (
      <PanelShell title="Record a payment" onCancel={onCancel}>
        <p className="mb-4 text-[13px] leading-[18px] text-steel">
          Outstanding: <span className="font-mono text-ink">{formatPaise(outstandingInPaise)}</span>
        </p>
        <MethodButtons methods={methods} onPick={setMethod} />
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Record a payment" onCancel={onCancel}>
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMethod(null)}
          className="flex h-10 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
        >
          <span aria-hidden="true">←</span> Change method
        </button>
        <span className="text-[13px] font-semibold text-ink">{method.name}</span>
      </div>

      {method.code !== 'CASH' && (
        <label className="mb-4 block">
          <span className="mb-1 block text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
            Reference (optional)
          </span>
          <input
            type="text"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            maxLength={100}
            placeholder={
              method.code === 'UPI' ? 'UPI reference' : method.kind === 'PLATFORM' ? 'Order or booking number' : 'Last 4 digits'
            }
            className="w-full rounded-xl border-2 border-steel/40 bg-paper px-3 py-2 text-[15px] leading-[22px] placeholder:text-steel focus:border-ink focus:outline-none"
          />
        </label>
      )}

      <NumericKeypad
        title={BILL_LABELS.amountReceived.en}
        prefix="₹"
        allowDecimal
        initialValue={paiseToInput(outstandingInPaise)}
        confirmLabel={BILL_LABELS.recordPayment.en}
        cancelLabel={BILL_LABELS.cancel.en}
        busy={isBusy}
        error={error}
        onCancel={() => setMethod(null)}
        onConfirm={(raw) => {
          const amountInPaise = parseRupeesToPaise(raw);
          if (amountInPaise === null || amountInPaise <= 0) return;
          onConfirm({ method: method.code, amountInPaise, reference: reference.trim() || null });
        }}
      />
    </PanelShell>
  );
}
