import { useId } from 'react';

/**
 * A labelled text input.
 *
 * The label is required, not optional. An input with only a placeholder loses
 * its label the moment someone starts typing, which is exactly when a tired
 * person needs it.
 *
 * `error` is the message for this one field, which is what the server sends
 * back in error.fields.
 */
export default function Input({
  label,
  error,
  hint,
  id,
  type = 'text',
  className = '',
  ...props
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div className={className}>
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        {label}
      </label>

      <input
        id={inputId}
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined}
        className={[
          'mt-1 block h-11 w-full rounded-lg border-0 px-3 text-base text-ink',
          'ring-1 ring-inset placeholder:text-steel',
          'focus:ring-2 focus:ring-inset',
          error ? 'ring-red-400 focus:ring-red-500' : 'ring-black/10 focus:ring-brand-600',
          'disabled:cursor-not-allowed disabled:bg-linen disabled:text-steel',
        ].join(' ')}
        {...props}
      />

      {hint && !error && (
        <p id={hintId} className="mt-1 text-sm text-steel">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-sm text-mirch">
          {error}
        </p>
      )}
    </div>
  );
}
