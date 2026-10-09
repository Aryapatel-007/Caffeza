import { useState } from 'react';

import { TriangleIcon } from '../../components/ui/icons/index.jsx';
import ApprovalStep, { useApproval } from '../../components/ui/ApprovalStep.jsx';
import Money from '../../components/ui/Money.jsx';
import ReasonPicker, { isReasonComplete, reasonBody } from '../../components/ui/ReasonPicker.jsx';
import Sheet, { SheetActions } from '../../components/ui/Sheet.jsx';
import { LABELS } from '../i18n/labels.js';
import { NO_CHARGE_REASONS } from './noChargeReasons.js';

/**
 * Giving an order No Charge. P08. OWNER and MANAGER, or a cashier with an owner's
 * or manager's PIN (P28, `needsApproval`).
 *
 * Shows what is being given away at menu price, before GST, the number the No
 * Charge report will print, then the fixed reasons. The order closes with no
 * bill and no invoice number, and the table frees. The server checks the four
 * rules; the panel says the one a waiter most often trips over, unsent items,
 * before anyone taps confirm.
 */
export default function NoChargePanel({ order, needsApproval = false, isBusy, onCancel, onConfirm }) {
  const [reason, setReason] = useState({ reasonCode: null, note: '' });
  const approval = useApproval(needsApproval);
  const unsent = order.lines.filter((line) => line.status === 'PENDING').length;
  const canConfirm = unsent === 0 && isReasonComplete(reason) && approval.ready && !isBusy;

  return (
    <Sheet
      title="No Charge"
      onClose={onCancel}
      footer={
        <SheetActions cancelLabel={LABELS.keepIt} onCancel={onCancel} disabled={!canConfirm} onConfirm={() => onConfirm({ ...reasonBody(reason), ...approval.body })}>
          {isBusy ? 'Saving…' : 'Give No Charge'}
        </SheetActions>
      }
    >
      <p className="type-body text-muted">The order closes with no bill. It is not a sale and takes no invoice number.</p>

      <div className="my-6 flex items-baseline justify-between border-b border-line pb-3">
        <span className="type-label text-muted">No Charge value, before GST</span>
        <Money paise={order.totals.subtotalInPaise} size="tile" />
      </div>

      {unsent > 0 && (
        <p className="type-body mb-4 flex items-center gap-2 rounded-lg border border-line border-l-[3px] border-l-alert bg-surface px-3 py-2 text-alert">
          <TriangleIcon />
          Send or cancel the unsent items first.
        </p>
      )}

      <ReasonPicker reasons={NO_CHARGE_REASONS} value={reason} onChange={setReason} />

      <ApprovalStep approval={approval} />
    </Sheet>
  );
}
