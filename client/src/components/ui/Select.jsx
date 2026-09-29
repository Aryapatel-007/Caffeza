import { useId } from 'react';

/**
 * A labelled dropdown.
 *
 * Added in M0-C because the staff screens need role and status pickers, and
 * without a shared one every module would grow its own.
 */
export default function Select({ label, error, options, id, className = '', ...props }) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;

  return (
    <div className={className}>
      <label htmlFor={selectId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>

      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={[
          'mt-1 block h-11 w-full rounded-lg border-0 bg-white px-3 text-base text-slate-900',
          'ring-1 ring-inset focus:ring-2 focus:ring-inset',
          error ? 'ring-red-400 focus:ring-red-500' : 'ring-slate-300 focus:ring-brand-600',
          'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
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
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
