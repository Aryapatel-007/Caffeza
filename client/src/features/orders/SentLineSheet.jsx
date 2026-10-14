import { useState } from 'react';

import ApprovalStep, { useApproval } from '../../components/ui/ApprovalStep.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import ReasonPicker, { isReasonComplete, reasonBody } from '../../components/ui/ReasonPicker.jsx';
import { LINE_CANCEL_REASONS } from './cancelReasons.js';
import { QuantityStepper } from './LineOptionsPanel.jsx';

/** P42. A dish the kitchen has made. Taking it back asks a reason, and a PIN where the approvals say. */
export const MADE = ['READY', 'SERVED'];

/** What the guest changed their mind about: a fixed reason, so reports can group it. */
const GUEST_CHANGED = { reasonCode: 'MODIFICATION', note: null };

/** Undo writes SENT_BY_MISTAKE on its own; nobody picks it by hand. */
const REASONS = LINE_CANCEL_REASONS.filter((reason) => reason.code !== 'SENT_BY_MISTAKE');

/**
 * Changing a dish after it is sent. P42.
 *
 * The guest changes their mind once the kitchen has the ticket: fewer of it, a
 * different note, none at all, or something else instead. Until the kitchen
 * has made it there is nothing to ask: the reason is "Guest changed the order"
 * and it was not made, so its stock comes back. Once the kitchen has made it,
 * the sheet says so, asks the reason, and asks a manager when the approvals
 * do; the note cannot change any more. A dish the kitchen made but has not
 * ticked is the same, once "Already made by the kitchen" is ticked.
 *
 * `onSave({ quantity, notes })` sends only what changed. `onRemove(answers)`
 * and `onSwap(answers)` take the line off; swap then opens the menu for the
 * replacement.
 */
export default function SentLineSheet({ line, needsApproval, isBusy, onClose, onSave, onRemove, onSwap }) {
  const markedReady = MADE.includes(line.status);
  // A kitchen sometimes cooks a dish before ticking it: the person says so, and it counts as made.
  const [saysMade, setSaysMade] = useState(false);
  const made = markedReady || saysMade;
  const [quantity, setQuantity] = useState(line.quantity);
  const [notes, setNotes] = useState(line.notes ?? '');
  const [reason, setReason] = useState({ reasonCode: null, note: '' });
  const approval = useApproval(made && needsApproval);

  const answers = () => ({
    ...(made ? reasonBody(reason) : GUEST_CHANGED),
    wasPrepared: made,
    ...approval.body,
  });
  const questionsDone = (!made || isReasonComplete(reason)) && approval.ready;
  const lowered = quantity < line.quantity;
  const noteChanged = !markedReady && notes.trim() !== (line.notes ?? '');
  const canSave = (lowered || noteChanged) && questionsDone && !isBusy;
  const name = line.variantName ? `${line.itemName} · ${line.variantName}` : line.itemName;

  return (
    <Sheet
      title={`Change ${line.itemName}`}
      subtitle={markedReady ? 'The kitchen has already made this one.' : 'With the kitchen. The kitchen sees the change at once.'}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={!canSave}
            onClick={() =>
              onSave({
                ...(lowered ? { quantity, ...answers() } : {}),
                ...(noteChanged ? { notes: notes.trim() || null } : {}),
              })
            }
            className="type-button min-h-14 rounded-lg bg-accent px-4 text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {isBusy ? 'Saving…' : 'Save'}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isBusy || !questionsDone}
              onClick={() => onRemove(answers())}
              className="type-button min-h-12 rounded-lg border border-alert px-3 text-alert hover:bg-alert-tint disabled:opacity-50"
            >
              Remove dish
            </button>
            <button
              type="button"
              disabled={isBusy || !questionsDone}
              onClick={() => onSwap(answers())}
              className="type-button min-h-12 rounded-lg border border-ink px-3 hover:bg-sunken disabled:opacity-50"
            >
              Swap for another dish
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="type-body truncate" title={name}>
          {name}
        </p>

        <div className="flex items-center justify-between gap-3">
          <span className="type-label">Quantity</span>
          <QuantityStepper value={quantity} max={line.quantity} onChange={setQuantity} />
        </div>
        <p className="type-caption -mt-3 text-muted">
          Lower it here. To add more, add the dish again from the menu.
        </p>

        <label className="flex flex-col gap-1">
          <span className="type-label">Note to chef</span>
          <textarea
            value={notes}
            disabled={markedReady}
            maxLength={200}
            rows={2}
            onChange={(event) => setNotes(event.target.value)}
            className="type-body rounded-lg border border-line bg-surface px-3 py-2 disabled:opacity-60"
          />
          {markedReady && <span className="type-caption text-muted">Already made, so the note cannot change.</span>}
        </label>

        {!markedReady && (
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-line px-3">
            <input type="checkbox" checked={saysMade} onChange={(event) => setSaysMade(event.target.checked)} className="size-5 accent-[var(--color-accent)]" />
            <span className="type-body">Already made by the kitchen</span>
          </label>
        )}

        {made && (
          <ReasonPicker reasons={REASONS} value={reason} onChange={setReason} legend="Why is it coming off?" />
        )}

        <ApprovalStep approval={approval} />
      </div>
    </Sheet>
  );
}
