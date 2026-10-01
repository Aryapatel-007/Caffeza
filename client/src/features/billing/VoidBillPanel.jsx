import { useState } from 'react';

import { formatPaise } from '../../utils/formatMoney.js';
import { BILL_VOID_REASONS } from '../orders/cancelReasons.js';
import ReasonPicker, { isReasonComplete, reasonBody } from '../orders/ReasonPicker.jsx';
import { BILL_LABELS } from './labels.js';
import PanelShell from './PanelShell.jsx';

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
    <PanelShell title={BILL_LABELS.voidBill.en} onCancel={onCancel}>
      <div className="mb-4 rounded-[10px] border-2 border-mirch/40 bg-mirch/5 p-3">
        <p className="text-[15px] leading-[22px] text-ink">
          Bill <span className="font-mono">{bill.billNumber}</span> for{' '}
          <span className="font-mono font-semibold">{formatPaise(bill.grandTotalInPaise)}</span> will
          be voided.
        </p>
        <p className="mt-1 text-[13px] leading-[18px] text-steel">
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

      {error && <p className="mb-3 text-[13px] leading-[18px] text-mirch">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-14 flex-1 rounded-xl border-2 border-steel/40 text-[15px] font-semibold text-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
        >
          {BILL_LABELS.keepIt.en}
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => onConfirm(reasonBody(reason))}
          className="h-14 flex-[2] rounded-xl bg-mirch text-[15px] font-semibold text-paper transition-transform duration-100 active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirch disabled:opacity-50"
        >
          {isBusy ? 'Voiding…' : BILL_LABELS.voidBill.en}
        </button>
      </div>
    </PanelShell>
  );
}
