import { OTHER_REASON_CODE } from './cancelReasons.js';

/**
 * One large button per reason, then an optional note. P04.
 *
 * Shared by cancelling a line, cancelling an order and voiding a bill, so the
 * three look and behave the same. Laid out for a phone held in one hand: two
 * columns of 48px-tall buttons, the note under them. The labels come from
 * cancelReasons.js and are never typed again here.
 *
 * The note becomes required when "Other" is picked; `isReasonComplete` is what
 * the confirm button reads, and the server refuses the same thing anyway.
 */
export default function ReasonPicker({ reasons, value, onChange, noteMaxLength = 200 }) {
  const { reasonCode, note } = value;
  const noteRequired = reasonCode === OTHER_REASON_CODE;

  return (
    <div className="mb-6">
      <fieldset>
        <legend className="mb-2 text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
          Reason
        </legend>
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
                  'min-h-[48px] rounded-xl border-2 px-3 py-2 text-left text-[15px] leading-5',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                  chosen ? 'border-ink bg-chana/20 font-semibold' : 'border-steel/40',
                ].join(' ')}
              >
                {reason.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-4 block">
        <span className="mb-2 block text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
          {noteRequired ? 'Note, required' : 'Note, optional'}
        </span>
        <textarea
          value={note}
          onChange={(event) => onChange({ reasonCode, note: event.target.value })}
          rows={2}
          maxLength={noteMaxLength}
          placeholder={noteRequired ? 'Say what happened' : 'Anything worth adding'}
          className="w-full rounded-xl border-2 border-steel/40 bg-paper px-3 py-2 text-[15px] leading-[22px] placeholder:text-steel focus:border-ink focus:outline-none"
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
