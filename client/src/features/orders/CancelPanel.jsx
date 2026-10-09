import { useState } from 'react';

import ApprovalStep, { useApproval } from '../../components/ui/ApprovalStep.jsx';
import Sheet, { SheetActions } from '../../components/ui/Sheet.jsx';
import ReasonPicker, { isReasonComplete, reasonBody } from '../../components/ui/ReasonPicker.jsx';
import Bilingual from '../i18n/Bilingual.jsx';
import { LABELS } from '../i18n/labels.js';

/**
 * Cancelling a line, or a whole order. One panel, because the two ask the same
 * two questions. The reasons are a fixed list passed in (P04): the line list
 * for a line, the order list for an order.
 *
 * `needsWasPrepared` decides whether the kitchen question appears. It is true
 * when the thing being cancelled has already been sent, and the server enforces
 * the same rule from the stored status: sending the answer when it does not
 * apply is a 400, omitting it when it does is a 422. This panel only decides
 * what to show; it does not decide the rule.
 *
 * The question is asked plainly rather than as jargon, because whoever is
 * cancelling has to answer it honestly for M4's stock numbers to mean anything
 * later.
 *
 * `needsApproval` (P28) adds the owner's or manager's PIN step.
 */
export default function CancelPanel({
  title,
  reasons,
  description,
  needsWasPrepared,
  needsApproval = false,
  isBusy,
  error,
  onCancel,
  onConfirm,
}) {
  const [reason, setReason] = useState({ reasonCode: null, note: '' });
  const [wasPrepared, setWasPrepared] = useState(null);
  const approval = useApproval(needsApproval);

  const canConfirm =
    isReasonComplete(reason) && (!needsWasPrepared || wasPrepared !== null) && approval.ready && !isBusy;

  return (
    <Sheet
      title={title}
      subtitle={null}
      onClose={onCancel}
      footer={
        <SheetActions
          cancelLabel={LABELS.keepIt}
          onCancel={onCancel}
          danger
          disabled={!canConfirm}
          onConfirm={() => onConfirm({ ...reasonBody(reason), ...(needsWasPrepared ? { wasPrepared } : {}), ...approval.body })}
        >
          {isBusy ? 'Cancelling…' : <Bilingual k="cancel" en="Cancel it" keep align="center" />}
        </SheetActions>
      }
    >
      {description && <p className="type-body mb-4 text-muted">{description}</p>}

      <ReasonPicker reasons={reasons} value={reason} onChange={setReason} />

      {needsWasPrepared && (
        <fieldset>
          <legend className="type-label mb-1">Did the kitchen make it?</legend>
          <p className="type-caption mb-2 text-muted">If it was cooked, the ingredients are gone and stock has to count them.</p>

          <div className="flex flex-col gap-2">
            {[
              { value: true, label: 'Yes, it was made' },
              { value: false, label: 'No, it was not started' },
            ].map((option) => (
              <label
                key={String(option.value)}
                className={[
                  'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3',
                  wasPrepared === option.value ? 'border-2 border-ink bg-sunken' : 'border-line bg-surface hover:bg-sunken',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="wasPrepared"
                  checked={wasPrepared === option.value}
                  onChange={() => setWasPrepared(option.value)}
                  className="size-5 accent-[var(--color-accent)]"
                />
                <span className="type-body">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <ApprovalStep approval={approval} />

      {error && <p className="type-body mt-4 text-alert">{error}</p>}
    </Sheet>
  );
}
