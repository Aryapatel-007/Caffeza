import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { removeBillLines } from '../../api/bills.js';
import { moneyText } from '../../components/ui/Money.jsx';
import ApprovalStep, { useApproval } from '../../components/ui/ApprovalStep.jsx';
import ReasonPicker, { isReasonComplete, reasonBody } from '../../components/ui/ReasonPicker.jsx';
import Sheet, { SheetActions } from '../../components/ui/Sheet.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';
import { LINE_CANCEL_REASONS } from '../orders/cancelReasons.js';
import { errorMessage } from './errorCopy.js';

/** A line the kitchen has: whoever removes it says whether it was made. */
export const REACHED_KITCHEN = ['FIRED', 'READY', 'SERVED'];

/** "sent 8:05 pm", or "Not sent" for a line the kitchen never had. P35. */
export const sentWords = (choice) => (REACHED_KITCHEN.includes(choice.status) && choice.firedAt ? `sent ${formatTimeIst(choice.firedAt)}` : 'Not sent');

/**
 * Taking items off a bill nothing has been paid on. P29 Part B, API-CONTRACT M3
 * section 16.8.1, and P35 for a row made of several lines.
 *
 * The bill lists its item rows: the same dish ordered in two rounds is one row,
 * "2 × Roti". Removing from such a row first asks which round goes ("1 × Roti,
 * sent 8:05 pm"), because each round is its own order line and kitchen ticket.
 * Then the reason, whether it was made when the kitchen had any of it, and a
 * confirmation in the server's own numbers ("2 × Roti ₹80.00 comes off bill …"),
 * worked out by a preview that changes nothing. A manager's PIN when any line
 * picked needs one. A bill keeps at least one line, so picking every line it
 * has is refused here, as the server would.
 *
 * `choices` are the row's lines, each `{ line, status, firedAt }`.
 */
export default function RemoveItemPanel({ bill, row, choices, needsApprovalFor, onCancel, onDone }) {
  const several = choices.length > 1;
  const [picked, setPicked] = useState(() => (several ? [] : [choices[0].line.orderLineId]));
  const [picking, setPicking] = useState(several);
  const [reason, setReason] = useState({ reasonCode: null, note: '' });
  const [made, setMade] = useState(true);

  const pickedChoices = choices.filter((choice) => picked.includes(choice.line.orderLineId));
  const reachedKitchen = pickedChoices.some((choice) => REACHED_KITCHEN.includes(choice.status));
  const empties = picked.length >= bill.lines.length;
  const approval = useApproval(needsApprovalFor(pickedChoices));

  const request = (extra = {}) => ({
    // "Was it made?" goes on each picked line the kitchen had, and on no other.
    lines: pickedChoices.map((choice) => ({
      lineId: choice.line.orderLineId,
      ...(REACHED_KITCHEN.includes(choice.status) ? { wasPrepared: made } : {}),
    })),
    ...reasonBody(reason),
    ...extra,
  });

  const preview = useMutation({ mutationFn: () => removeBillLines(bill.id, request({ preview: true })) });
  const confirm = useMutation({ mutationFn: () => removeBillLines(bill.id, request(approval.body)), onSuccess: onDone });

  const name = row.variantName ? `${row.itemName} (${row.variantName})` : row.itemName;
  const sentence =
    preview.data &&
    `${preview.data.removedQuantity} × ${name} ${moneyText(preview.data.removedLineTotalInPaise)} comes off bill ${preview.data.billNumber}. The bill becomes ${moneyText(preview.data.newGrandTotalInPaise)}.`;

  const toggle = (orderLineId) =>
    setPicked((current) => (current.includes(orderLineId) ? current.filter((id) => id !== orderLineId) : [...current, orderLineId]));

  const footer = picking ? (
    <SheetActions
      onCancel={onCancel}
      cancelLabel="Keep it"
      confirmLabel="Next"
      disabled={picked.length === 0 || empties}
      onConfirm={() => setPicking(false)}
    />
  ) : preview.data ? (
    <SheetActions
      onCancel={() => preview.reset()}
      cancelLabel="Back"
      confirmLabel={confirm.isPending ? 'Removing…' : 'Remove it'}
      danger
      disabled={!approval.ready || confirm.isPending || empties}
      onConfirm={() => confirm.mutate()}
    />
  ) : (
    <SheetActions
      onCancel={several ? () => setPicking(true) : onCancel}
      cancelLabel={several ? 'Back' : 'Keep it'}
      confirmLabel={preview.isPending ? 'Working it out…' : 'Next'}
      disabled={!isReasonComplete(reason) || preview.isPending}
      onConfirm={() => preview.mutate()}
    />
  );

  return (
    <Sheet title={`Remove ${row.itemName}`} subtitle="The bill keeps its number. Nothing is voided." onCancel={onCancel} footer={footer}>
      {picking ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="type-label mb-1 text-muted">Which one?</legend>
          {choices.map((choice) => {
            const id = choice.line.orderLineId;
            const on = picked.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(id)}
                className={[
                  'type-body min-h-12 rounded-lg border px-4 text-left',
                  on ? 'border-2 border-ink bg-sunken' : 'border-line bg-surface',
                ].join(' ')}
              >
                {choice.line.quantity} × {name}, {sentWords(choice)}
              </button>
            );
          })}
          {empties && (
            <p className="type-body text-alert">A bill keeps at least one item. To take everything off, cancel the order instead.</p>
          )}
        </fieldset>
      ) : !preview.data ? (
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
