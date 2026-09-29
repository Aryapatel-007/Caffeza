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
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>

      <input
        id={inputId}
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined}
        className={[
          'mt-1 block h-11 w-full rounded-lg border-0 px-3 text-base text-slate-900',
          'ring-1 ring-inset placeholder:text-slate-400',
          'focus:ring-2 focus:ring-inset',
          error ? 'ring-red-400 focus:ring-red-500' : 'ring-slate-300 focus:ring-brand-600',
          'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
        ].join(' ')}
        {...props}
      />

      {hint && !error && (
        <p id={hintId} className="mt-1 text-sm text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
