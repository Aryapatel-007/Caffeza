import { useEffect } from 'react';

/**
 * A short message about something that just happened.
 *
 * Plain language only: never a raw error code, never an HTTP status. The
 * sentence comes from features/menu/errorCopy.js for failures, and from the
 * caller for successes, using the same verb as the button that caused it
 * ("Item saved", not "Success").
 */
export default function Toast({ tone = 'success', message, onDismiss, onRetry, autoHideMs = 4000 }) {
  useEffect(() => {
    if (!message || tone === 'error' || !autoHideMs) return undefined;
    const timer = setTimeout(() => onDismiss?.(), autoHideMs);
    return () => clearTimeout(timer);
  }, [message, tone, autoHideMs, onDismiss]);

  if (!message) return null;

  const isError = tone === 'error';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-5 z-20 mx-auto flex max-w-xl items-center gap-3.5 rounded-xl border-2 bg-paper px-4 py-3.5 shadow-[0_6px_20px_rgba(28,27,25,0.18)] sm:inset-x-auto sm:left-1/2 sm:w-[36rem] sm:-translate-x-1/2"
      style={{ borderColor: isError ? 'var(--color-mirch)' : 'var(--color-ink)' }}
    >
      <span
        aria-hidden="true"
        className="h-6 w-1 flex-none rounded-sm"
        style={{ background: isError ? 'var(--color-mirch)' : 'var(--color-patta)' }}
      />
      <p className="flex-1 text-[15px] leading-[22px] text-ink">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex-none text-[13px] font-medium text-mirch focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirch"
        >
          Retry
        </button>
      )}
      {onDismiss && !onRetry && (
        <button
          type="button"
          onClick={onDismiss}
          className="flex-none text-[13px] font-medium text-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
