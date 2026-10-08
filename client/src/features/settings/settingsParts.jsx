/**
 * The section frame and the labelled checkbox every Settings section uses.
 * Their own file since P23, so a section can live in its own file too.
 */
export function Section({ title, description, children }) {
  return (
    <section className="border-t border-line pt-4">
      <h2 className="type-heading">{title}</h2>
      {description && <p className="mt-1 type-caption text-muted">{description}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

/**
 * A labelled on/off row.
 *
 * A checkbox rather than a toggle switch: this is a desktop back-office screen,
 * not the tablet availability board, and a checkbox with a label reads
 * unambiguously without needing colour to say which way is on.
 */
export function Checkbox({ label, hint, checked, onChange, disabled }) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="mt-1 h-5 w-5 rounded border border-line text-open focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
      />
      <span>
        <span className="type-body">{label}</span>
        {hint && <span className="block type-caption text-muted">{hint}</span>}
      </span>
    </label>
  );
}
