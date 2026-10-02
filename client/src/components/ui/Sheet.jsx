import { useEffect } from 'react';

import { CrossIcon } from './icons/index.jsx';

/**
 * A sheet for editing one record. DESIGN-SYSTEM sections 6, 9 and 10.
 *
 * From the right on a wide screen, from the bottom on a phone, never a blocking
 * modal in the middle: a cashier mid-payment often needs to glance at the bill
 * behind it. 16px corners on the edge that enters, the one floating shadow, and
 * a 180ms slide that reduced motion turns into an instant change.
 *
 * `footer` is pinned to the bottom, where the one primary action sits.
 * Escape closes it.
 */
export default function Sheet({ title, subtitle = null, wide = false, onClose, onCancel, footer = null, children }) {
  const close = onClose ?? onCancel;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') close?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div className="v2 fixed inset-0 z-30 flex items-end sm:items-stretch sm:justify-end">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={close} className="absolute inset-0 bg-scrim" />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          'relative flex max-h-[92vh] w-full flex-col bg-surface text-ink shadow-float',
          'animate-[sheet-in-bottom_180ms_ease-out] rounded-t-2xl',
          'sm:max-h-none sm:animate-[sheet-in-right_180ms_ease-out] sm:rounded-none sm:rounded-l-2xl',
          wide ? 'sm:max-w-[580px]' : 'sm:max-w-md',
        ].join(' ')}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 className="type-heading">{title}</h2>
            {subtitle && <p className="type-num-meta mt-1 text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex size-12 flex-none items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
          >
            <CrossIcon />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
        {footer && <footer className="border-t border-line px-4 py-3 sm:px-6">{footer}</footer>}
      </aside>
    </div>
  );
}

/**
 * The footer most sheets need: a way back, and the one action, which is the
 * screen's primary (accent) or, for something destructive, `alert`.
 */
export function SheetActions({ cancelLabel = 'Cancel', onCancel, confirmLabel, onConfirm, disabled = false, danger = false, children }) {
  return (
    <div className="flex gap-2">
      {onCancel && (
        <button type="button" onClick={onCancel} className="type-button min-h-12 flex-1 rounded-lg border border-ink bg-surface text-ink hover:bg-sunken">
          {cancelLabel}
        </button>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onConfirm}
        className={[
          'type-button min-h-12 flex-[2] rounded-lg px-4 text-on-accent hover:brightness-110 disabled:opacity-50',
          danger ? 'bg-alert' : 'bg-accent',
        ].join(' ')}
      >
        {children ?? confirmLabel}
      </button>
    </div>
  );
}
