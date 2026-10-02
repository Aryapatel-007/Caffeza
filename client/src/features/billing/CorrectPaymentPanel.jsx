import { useState } from 'react';

import { LABELS } from '../i18n/labels.js';
import MethodButtons from './MethodButtons.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { paymentMethodName } from './paymentMethodsForBill.js';
import Money from '../../components/ui/Money.jsx';

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
    <Sheet title="Change payment method" onCancel={onCancel}>
      <p className="mb-4 type-caption text-muted">
        {paymentMethodName(payment)}{' '}
        <span className="font-mono text-ink"><Money paise={payment.amountInPaise} /></span>. The amount
        stays the same.
      </p>

      <div className="mb-4">
        <MethodButtons methods={choices} selected={method?.code} onPick={setMethod} />
      </div>

      <label className="mb-4 block">
        <span className="mb-1 block type-label text-muted">
          Reason, required
        </span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={200}
          placeholder="Guest paid by UPI, not cash"
          className="w-full rounded-lg min-h-12 border border-muted bg-surface px-3 py-2 type-body placeholder:text-muted"
        />
      </label>

      {error && <p className="mb-3 type-caption text-alert">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-14 flex-1 rounded-lg border border-ink bg-surface type-button text-ink hover:bg-sunken"
        >
          {LABELS.cancel}
        </button>
        <button
          type="button"
          disabled={!ready || isBusy}
          onClick={() => onConfirm({ method: method.code, reason: reason.trim() })}
          className="min-h-14 flex-[2] rounded-lg bg-accent type-button text-on-accent disabled:opacity-50"
        >
          {isBusy ? 'Saving…' : method ? `Change to ${method.name}` : 'Choose a method'}
        </button>
      </div>
    </Sheet>
  );
}
