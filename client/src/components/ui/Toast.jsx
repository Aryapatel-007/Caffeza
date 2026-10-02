import { useEffect } from 'react';

import { TickIcon, TriangleIcon } from './icons/index.jsx';

/**
 * A short message about something that just happened. It floats, so it is one
 * of the few things that casts a shadow.
 *
 * Plain language only: never a code, never an HTTP status. A success repeats
 * the verb of the button that caused it ("Item saved", not "Success").
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
      className={[
        'v2 fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-xl items-center gap-3 rounded-[10px] border border-line border-l-[3px] bg-surface px-4 py-3 text-ink shadow-float',
        'sm:inset-x-auto sm:bottom-5 sm:left-1/2 sm:w-[36rem] sm:-translate-x-1/2',
        isError ? 'border-l-alert' : 'border-l-ok',
      ].join(' ')}
    >
      <span className={isError ? 'text-alert' : 'text-ok'}>{isError ? <TriangleIcon /> : <TickIcon />}</span>
      <p className="type-body flex-1">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="type-label min-h-12 flex-none px-2 text-accent">
          Retry
        </button>
      )}
      {onDismiss && !onRetry && (
        <button type="button" onClick={onDismiss} className="type-label min-h-12 flex-none px-2 text-muted hover:text-ink">
          Dismiss
        </button>
      )}
    </div>
  );
}
