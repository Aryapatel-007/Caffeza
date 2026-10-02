import { useId } from 'react';

/**
 * A labelled text input. DESIGN-SYSTEM-V2: `surface` fill, a `muted` border
 * (never `line`, which is for dividers only), 8px corners.
 *
 * The label is required. An input with only a placeholder loses its label the
 * moment someone starts typing, which is exactly when a tired person needs it.
 * `error` is the message for this one field, from the server's `error.fields`.
 */
export default function Input({ label, error, hint, id, type = 'text', className = '', ...props }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div className={className}>
      <label htmlFor={inputId} className="type-label block text-ink">
        {label}
      </label>

      <input
        id={inputId}
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined}
        className={[
          'type-body mt-1 block min-h-12 w-full rounded-lg border bg-surface px-3 text-ink placeholder:text-muted',
          error ? 'border-alert' : 'border-muted',
          'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted',
        ].join(' ')}
        {...props}
      />

      {hint && !error && (
        <p id={hintId} className="type-caption mt-1 text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="type-caption mt-1 text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
