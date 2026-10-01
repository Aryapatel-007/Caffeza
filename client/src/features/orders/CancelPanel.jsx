import { useState } from 'react';

import ReasonPicker, { isReasonComplete, reasonBody } from './ReasonPicker.jsx';

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
 */
export default function CancelPanel({
  title,
  reasons,
  description,
  needsWasPrepared,
  isBusy,
  error,
  onCancel,
  onConfirm,
}) {
  const [reason, setReason] = useState({ reasonCode: null, note: '' });
  const [wasPrepared, setWasPrepared] = useState(null);

  const canConfirm =
    isReasonComplete(reason) && (!needsWasPrepared || wasPrepared !== null) && !isBusy;

  return (
    <div className="fixed inset-0 z-30 flex">
      <button type="button" aria-label="Close" onClick={onCancel} className="flex-1 bg-ink/30" />

      <aside
        role="dialog"
        aria-label={title}
        className="flex w-full max-w-md flex-col border-l border-black/5 bg-paper shadow-[-8px_0_24px_rgba(28,27,25,0.18)]"
      >
        <header className="border-b border-black/5 px-4 py-3">
          <h2 className="text-[20px] font-semibold leading-7">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[13px] leading-[18px] text-steel">{description}</p>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <ReasonPicker reasons={reasons} value={reason} onChange={setReason} />

          {needsWasPrepared && (
            <fieldset>
              <legend className="mb-1 text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
                Did the kitchen make it?
              </legend>
              <p className="mb-2 text-[13px] leading-[18px] text-steel">
                If it was cooked, the ingredients are gone and stock has to count them.
              </p>

              <div className="space-y-2">
                {[
                  { value: true, label: 'Yes, it was made' },
                  { value: false, label: 'No, it was not started' },
                ].map((option) => (
                  <label
                    key={String(option.value)}
                    className={[
                      'flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border-2 px-3',
                      wasPrepared === option.value ? 'border-ink' : 'border-steel/40',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="wasPrepared"
                      checked={wasPrepared === option.value}
                      onChange={() => setWasPrepared(option.value)}
                      className="size-4 accent-[var(--color-ink)]"
                    />
                    <span className="text-[15px] leading-[22px]">{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {error && <p className="mt-4 text-[13px] leading-[18px] text-mirch">{error}</p>}
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
            onClick={() =>
              onConfirm({
                ...reasonBody(reason),
                ...(needsWasPrepared ? { wasPrepared } : {}),
              })
            }
            className="h-12 flex-[2] rounded-xl bg-mirch text-[15px] font-semibold text-paper transition-transform active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirch disabled:opacity-50"
          >
            {isBusy ? 'Cancelling…' : 'Cancel it'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
