import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { removeBillLines } from '../../api/bills.js';
import { moneyText } from '../../components/ui/Money.jsx';
import ApprovalStep, { useApproval } from '../../components/ui/ApprovalStep.jsx';
import ReasonPicker, { isReasonComplete, reasonBody } from '../../components/ui/ReasonPicker.jsx';
import Sheet, { SheetActions } from '../../components/ui/Sheet.jsx';
import { LINE_CANCEL_REASONS } from '../orders/cancelReasons.js';
import { errorMessage } from './errorCopy.js';

/** A line the kitchen has: whoever removes it says whether it was made. */
const REACHED_KITCHEN = ['FIRED', 'READY', 'SERVED'];

/**
 * Taking one item off a bill nothing has been paid on. P29 Part B,
 * API-CONTRACT M3 section 16.8.1.
 *
 * The bill keeps its number and is revised: nothing is voided. The reason,
 * whether it was made when the kitchen had it, then a confirmation that states
 * the consequence in the server's own numbers ("Water Bottle ₹47.61 comes off
 * bill CFA/C/22446. The bill becomes ₹746.00."), worked out by a preview that
 * changes nothing. A manager's PIN only when `needsApproval`.
 */
export default function RemoveItemPanel({ bill, line, lineStatus, needsApproval, onCancel, onDone }) {
  const [reason, setReason] = useState({ reasonCode: null, note: '' });
  const [made, setMade] = useState(true);
  const reachedKitchen = REACHED_KITCHEN.includes(lineStatus);
  const approval = useApproval(needsApproval);

  const request = (extra = {}) => ({
    lines: [{ lineId: line.orderLineId, ...(reachedKitchen ? { wasPrepared: made } : {}) }],
    ...reasonBody(reason),
    ...extra,
  });

  const preview = useMutation({ mutationFn: () => removeBillLines(bill.id, request({ preview: true })) });
  const confirm = useMutation({ mutationFn: () => removeBillLines(bill.id, request(approval.body)), onSuccess: onDone });

  const name = line.variantName ? `${line.itemName} (${line.variantName})` : line.itemName;
  const sentence =
    preview.data &&
    `${name} ${moneyText(line.lineTotalInPaise)} comes off bill ${preview.data.billNumber}. The bill becomes ${moneyText(preview.data.newGrandTotalInPaise)}.`;

  return (
    <Sheet
      title={`Remove ${line.itemName}`}
      subtitle="The bill keeps its number. Nothing is voided."
      onCancel={onCancel}
      footer={
        preview.data ? (
          <SheetActions
            onCancel={() => preview.reset()}
            cancelLabel="Back"
            confirmLabel={confirm.isPending ? 'Removing…' : 'Remove it'}
            danger
            disabled={!approval.ready || confirm.isPending}
            onConfirm={() => confirm.mutate()}
          />
        ) : (
          <SheetActions
            onCancel={onCancel}
            cancelLabel="Keep it"
            confirmLabel={preview.isPending ? 'Working it out…' : 'Next'}
            disabled={!isReasonComplete(reason) || preview.isPending}
            onConfirm={() => preview.mutate()}
          />
        )
      }
    >
      {!preview.data ? (
        <div className="flex flex-col gap-4">
          <ReasonPicker reasons={LINE_CANCEL_REASONS} value={reason} onChange={setReason} />
          {reachedKitchen && (
            <fieldset className="flex flex-col gap-2">
              <legend className="type-label mb-1 text-muted">Was it already made?</legend>
              <div className="grid grid-cols-2 gap-2">
                {[true, false].map((answer) => (
                  <button
                    key={String(answer)}
                    type="button"
                    aria-pressed={made === answer}
                    onClick={() => setMade(answer)}
                    className={[
                      'type-label min-h-12 rounded-lg border px-4',
                      made === answer ? 'border-2 border-ink bg-sunken' : 'border-line bg-surface',
                    ].join(' ')}
                  >
                    {answer ? 'Yes, it was made' : 'No'}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {preview.isError && <p className="type-body text-alert">{errorMessage(preview.error)}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-line border-l-[3px] border-l-alert bg-surface p-3">
            <p className="type-body text-ink">{sentence}</p>
          </div>
          <ApprovalStep approval={approval} />
          {confirm.isError && <p className="type-body text-alert">{errorMessage(confirm.error)}</p>}
        </div>
      )}
    </Sheet>
  );
}
