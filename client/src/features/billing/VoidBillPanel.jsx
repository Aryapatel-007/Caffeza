import { useState } from 'react';

import { BILL_VOID_REASONS } from '../orders/cancelReasons.js';
import ReasonPicker, { isReasonComplete, reasonBody } from '../../components/ui/ReasonPicker.jsx';
import { LABELS } from '../i18n/labels.js';
import Sheet from '../../components/ui/Sheet.jsx';
import Money from '../../components/ui/Money.jsx';

/**
 * Voiding a bill. OWNER and MANAGER only, enforced on the server.
 *
 * The confirmation states the consequence, not the question: "this bill will
 * be voided, the number stays used, this much comes off today's total" —
 * spelled out with the real amount, not "Are you sure?". A cashier who reads
 * this and still means to void it has the information the sentence needed to
 * carry; one who does not can back out having actually learned what happens.
 */
export default function VoidBillPanel({ bill, isBusy, error, onCancel, onConfirm }) {
  const [reason, setReason] = useState({ reasonCode: null, note: '' });
  const canConfirm = isReasonComplete(reason) && !isBusy;

  return (
    <Sheet title={LABELS.voidBill} onCancel={onCancel}>
      <div className="mb-4 rounded-lg border border-line border-l-[3px] border-l-alert bg-surface p-3">
        <p className="type-body text-ink">
          Bill <span className="font-mono">{bill.billNumber}</span> for{' '}
          <span className="font-mono font-semibold"><Money paise={bill.grandTotalInPaise} /></span> will
          be voided.
        </p>
        <p className="mt-1 type-caption text-muted">
          The number stays used and is never reissued. This amount will no longer count toward
          today&rsquo;s sales.
          {bill.amountPaidInPaise > 0 && ' Money was already collected against this bill.'}
        </p>
      </div>

      <ReasonPicker
        reasons={BILL_VOID_REASONS}
        value={reason}
        onChange={setReason}
        noteMaxLength={500}
      />

      {error && <p className="mb-3 type-caption text-alert">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-14 flex-1 rounded-lg border border-ink bg-surface type-button text-ink hover:bg-sunken"
        >
          {LABELS.keepIt}
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => onConfirm(reasonBody(reason))}
          className="min-h-14 flex-[2] rounded-lg bg-alert type-button text-on-accent disabled:opacity-50"
        >
          {isBusy ? 'Voiding…' : LABELS.voidBill}
        </button>
      </div>
    </Sheet>
  );
}
