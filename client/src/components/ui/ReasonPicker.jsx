import { OTHER_REASON_CODE } from '../../features/orders/cancelReasons.js';

/**
 * One large button per reason, then an optional note. P04, restyled for
 * DESIGN-SYSTEM-V2 and moved into the shared components.
 *
 * Shared by cancelling a line, cancelling an order, voiding a bill, a discount
 * and No Charge, so they look and behave the same. Two columns of 48px buttons
 * for a phone held in one hand, the note under them. The labels come from each
 * caller's reason list and are never typed again here.
 *
 * The note becomes required when "Other" is picked; `isReasonComplete` is what
 * the confirm button reads, and the server refuses the same thing anyway.
 */

export default function ReasonPicker({ reasons, value, onChange, noteMaxLength = 200, legend = 'Reason' }) {
  const { reasonCode, note } = value;
  const noteRequired = reasonCode === OTHER_REASON_CODE;

  return (
    <div className="mb-6">
      <fieldset>
        <legend className="type-label mb-2 text-muted">{legend}</legend>
        <div className="grid grid-cols-2 gap-2">
          {reasons.map((reason) => {
            const chosen = reasonCode === reason.code;
            return (
              <button
                key={reason.code}
                type="button"
                aria-pressed={chosen}
                onClick={() => onChange({ reasonCode: reason.code, note })}
                className={[
                  'type-label min-h-12 rounded-lg border px-3 py-2 text-left transition-colors',
                  chosen ? 'border-2 border-ink bg-sunken text-ink' : 'border-line bg-surface text-ink hover:bg-sunken',
                ].join(' ')}
              >
                {reason.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-4 block">
        <span className="type-label mb-2 block text-muted">{noteRequired ? 'Note, required' : 'Note, optional'}</span>
        <textarea
          value={note}
          onChange={(event) => onChange({ reasonCode, note: event.target.value })}
          rows={2}
          maxLength={noteMaxLength}
          placeholder={noteRequired ? 'Say what happened' : 'Anything worth adding'}
          className="type-body w-full rounded-lg border border-muted bg-surface px-3 py-2 text-ink placeholder:text-muted"
        />
      </label>
    </div>
  );
}

/** True when a code is chosen and, for Other, a note has text. */
export function isReasonComplete({ reasonCode, note }) {
  if (!reasonCode) return false;
  if (reasonCode === OTHER_REASON_CODE) return note.trim().length > 0;
  return true;
}

/** The request fields: the code, and the trimmed note or null. */
export function reasonBody({ reasonCode, note }) {
  const trimmed = note.trim();
  return { reasonCode, note: trimmed === '' ? null : trimmed };
}
