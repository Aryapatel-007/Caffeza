import Button from './Button.jsx';

/**
 * The failure state for a screen that could not load.
 *
 * Takes the ApiError from api/client.js. It shows the message the server sent,
 * which is safe to display by design: the server never puts a stack trace or a
 * database error in it.
 *
 * `onRetry` is worth passing whenever retrying is actually possible. Most
 * failures during service are a wifi drop, and a retry button fixes those
 * without anyone reaching for a phone.
 */
export default function ErrorMessage({ error, onRetry, className = '' }) {
  if (!error) return null;

  const message =
    typeof error === 'string' ? error : (error.message ?? 'Something went wrong.');

  return (
    <div
      role="alert"
      className={`rounded-lg bg-red-50 p-4 ring-1 ring-inset ring-red-200 ${className}`}
    >
      <p className="text-sm font-medium text-red-800">{message}</p>

      {error?.fields && (
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-red-700">
          {Object.entries(error.fields).map(([field, detail]) => (
            <li key={field}>
              <span className="font-medium">{field}</span>: {detail}
            </li>
          ))}
        </ul>
      )}

      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
