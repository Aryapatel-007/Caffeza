import Button from './Button.jsx';
import { TriangleIcon } from './icons/index.jsx';

/**
 * A failure. DESIGN-SYSTEM section 9: says what happened and what to do
 * next, never apologises, never vague.
 *
 * Takes the ApiError from api/client.js, or a sentence. The server's message is
 * safe to show by design: it never carries a stack trace or a database error.
 * `onRetry` is worth passing whenever retrying can work. Most failures during
 * service are a wifi drop, and a retry fixes those without anyone calling us.
 */
export default function ErrorState({ error, onRetry, className = '' }) {
  if (!error) return null;

  const message = typeof error === 'string' ? error : (error.message ?? 'That did not work. Check the connection and try again.');

  return (
    <div role="alert" className={`rounded-[10px] border border-line border-l-[3px] border-l-alert bg-surface p-4 ${className}`}>
      <p className="type-body flex items-start gap-2 text-alert">
        <TriangleIcon className="mt-0.5" />
        <span>{message}</span>
      </p>

      {error?.fields && (
        <ul className="type-caption mt-2 list-inside list-disc space-y-1 text-ink">
          {Object.entries(error.fields).map(([field, detail]) => (
            <li key={field}>
              <span className="font-semibold">{field}</span>: {detail}
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
