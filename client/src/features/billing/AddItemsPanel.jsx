import { useMutation } from '@tanstack/react-query';

import { reopenBill } from '../../api/bills.js';
import ApprovalStep, { useApproval } from '../../components/ui/ApprovalStep.jsx';
import Sheet, { SheetActions } from '../../components/ui/Sheet.jsx';
import { moneyText } from '../../components/ui/Money.jsx';

import { errorMessage } from './errorCopy.js';

/**
 * Add items after the bill is made. P26, API-CONTRACT M3 section 16.7.
 *
 * The bill is voided and the order opens again for the new dishes. When the
 * table is billed again, what was already paid moves onto the new bill. A
 * cashier or captain asks a manager to pick their name and type their PIN.
 */
export default function AddItemsPanel({ bill, needsApproval, onCancel, onDone }) {
  const approval = useApproval(needsApproval);
  const reopen = useMutation({
    mutationFn: () => reopenBill(bill.id, approval.body),
    onSuccess: onDone,
  });
  const approved = approval.ready;
  const paid = bill.amountPaidInPaise ?? 0;

  return (
    <Sheet
      title="Add items"
      subtitle="The bill is voided and the order opens again. The old number stays in the register."
      onCancel={onCancel}
      footer={
        <SheetActions
          onCancel={onCancel}
          cancelLabel="Keep the bill"
          confirmLabel={reopen.isPending ? 'Opening the order…' : 'Void and add items'}
          disabled={!approved || reopen.isPending}
          onConfirm={() => reopen.mutate()}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-line border-l-[3px] border-l-open bg-surface p-3">
          <p className="type-body text-ink">
            Bill {bill.billNumber} for {moneyText(bill.grandTotalInPaise)} will be voided. Add the dishes on the order and send them to the
            kitchen. Bill the table again once they are served.
            {paid > 0 ? ` The ${moneyText(paid)} already paid moves onto the new bill.` : ''}
          </p>
        </div>
        <ApprovalStep approval={approval} />
        {reopen.isError && <p className="type-body text-alert">{errorMessage(reopen.error)}</p>}
      </div>
    </Sheet>
  );
}
