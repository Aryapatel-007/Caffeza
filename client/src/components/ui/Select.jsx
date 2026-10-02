import { useId } from 'react';

/** A labelled dropdown, drawn like `Input`. */
export default function Select({ label, error, options, id, className = '', ...props }) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;

  return (
    <div className={className}>
      <label htmlFor={selectId} className="type-label block text-ink">
        {label}
      </label>

      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={[
          'type-body mt-1 block min-h-12 w-full rounded-lg border bg-surface px-3 text-ink',
          error ? 'border-alert' : 'border-muted',
          'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted',
        ].join(' ')}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error && (
        <p id={errorId} className="type-caption mt-1 text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
