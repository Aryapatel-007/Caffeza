import { useState } from 'react';

import { formatPaise } from '../../utils/formatMoney.js';
import { NO_CHARGE_REASONS } from './noChargeReasons.js';
import ReasonPicker, { isReasonComplete, reasonBody } from './ReasonPicker.jsx';

/**
 * Giving an order No Charge. P08. OWNER and MANAGER.
 *
 * Shows what is being given away at menu price, before GST, the number the No
 * Charge report will print, then the fixed reasons. The order closes with no
 * bill and no invoice number, and the table frees. The server checks the four
 * rules; the panel says the one a waiter most often trips over, unsent items,
 * before anyone taps confirm.
 */
export default function NoChargePanel({ order, isBusy, onCancel, onConfirm }) {
  const [reason, setReason] = useState({ reasonCode: null, note: '' });
  const unsent = order.lines.filter((line) => line.status === 'PENDING').length;
  const canConfirm = unsent === 0 && isReasonComplete(reason) && !isBusy;

  return (
    <div className="fixed inset-0 z-30 flex">
      <button type="button" aria-label="Close" onClick={onCancel} className="flex-1 bg-ink/30" />

      <aside
        role="dialog"
        aria-label="No Charge"
        className="flex w-full max-w-md flex-col border-l border-black/5 bg-paper shadow-[-8px_0_24px_rgba(28,27,25,0.18)]"
      >
        <header className="border-b border-black/5 px-4 py-3">
          <h2 className="text-[20px] font-semibold leading-7">No Charge</h2>
          <p className="mt-0.5 text-[13px] leading-[18px] text-steel">
            The order closes with no bill. It is not a sale and takes no invoice number.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mb-6 flex items-baseline justify-between border-b border-black/5/10 pb-3">
            <span className="text-[13px] leading-[18px] text-steel">No Charge value, before GST</span>
            <span className="font-mono text-[24px] font-semibold leading-8">
              {formatPaise(order.totals.subtotalInPaise)}
            </span>
          </div>

          {unsent > 0 && (
            <p className="mb-4 rounded-xl border-2 border-mirch/40 bg-mirch/5 px-3 py-2 text-[13px] leading-[18px]">
              Send or cancel the unsent items first.
            </p>
          )}

          <ReasonPicker reasons={NO_CHARGE_REASONS} value={reason} onChange={setReason} />
        </div>

        <footer className="flex gap-2 border-t border-black/5 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-12 flex-1 rounded-xl border-2 border-steel/40 text-[15px] font-semibold text-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            Keep it
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(reasonBody(reason))}
            className="h-12 flex-[2] rounded-xl bg-chana text-[15px] font-semibold text-ink transition-transform active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
          >
            {isBusy ? 'Saving…' : 'Give No Charge'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
