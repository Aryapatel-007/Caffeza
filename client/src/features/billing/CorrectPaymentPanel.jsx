import { useState } from 'react';

import { formatPaise } from '../../utils/formatMoney.js';
import { BILL_LABELS } from './labels.js';
import MethodButtons from './MethodButtons.jsx';
import PanelShell from './PanelShell.jsx';
import { paymentMethodName } from './paymentMethodsForBill.js';

/**
 * Changing how one payment was made. P08. OWNER and MANAGER.
 *
 * Only the method moves; the amount is fixed and shown, not editable. A reason
 * is required because this is the way money moves between cash and UPI after
 * the fact, and it lands on the audit trail.
 */
export default function CorrectPaymentPanel({ payment, methods, isBusy, error, onCancel, onConfirm }) {
  const [method, setMethod] = useState(null);
  const [reason, setReason] = useState('');
  const choices = methods.filter((candidate) => candidate.code !== payment.method);
  const ready = method !== null && reason.trim().length > 0;

  return (
    <PanelShell title="Change payment method" onCancel={onCancel}>
      <p className="mb-4 text-[13px] leading-[18px] text-steel">
        {paymentMethodName(payment)}{' '}
        <span className="font-mono text-ink">{formatPaise(payment.amountInPaise)}</span>. The amount
        stays the same.
      </p>

      <div className="mb-4">
        <MethodButtons methods={choices} selected={method?.code} onPick={setMethod} />
      </div>

      <label className="mb-4 block">
        <span className="mb-1 block text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
          Reason, required
        </span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={200}
          placeholder="Guest paid by UPI, not cash"
          className="w-full rounded-xl border-2 border-steel/40 bg-paper px-3 py-2 text-[15px] leading-[22px] placeholder:text-steel focus:border-ink focus:outline-none"
        />
      </label>

      {error && <p className="mb-3 text-[13px] leading-[18px] text-mirch">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-14 flex-1 rounded-xl border-2 border-steel/40 text-[15px] font-semibold text-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
        >
          {BILL_LABELS.cancel.en}
        </button>
        <button
          type="button"
          disabled={!ready || isBusy}
          onClick={() => onConfirm({ method: method.code, reason: reason.trim() })}
          className="h-14 flex-[2] rounded-xl bg-chana text-[15px] font-semibold text-ink transition-transform duration-100 active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          {isBusy ? 'Saving…' : method ? `Change to ${method.name}` : 'Choose a method'}
        </button>
      </div>
    </PanelShell>
  );
}
