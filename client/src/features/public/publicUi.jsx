/**
 * The pieces the public page is built from. P24.
 *
 * The cafe's own site, so it is warmer and more generous than the staff
 * screens, but on the same tokens: the accent the owner chose, the neutral
 * tone, Anek for display. Nothing loops; the few transitions stop under
 * reduced motion, which index.css already enforces.
 */
import { Link } from 'react-router-dom';

import { formatTimeIst } from '../../utils/formatDate.js';

export const DISPLAY = 'font-anek font-[700] [font-stretch:112%] tracking-[-0.01em]';

/** The bar along the top of every page: the wordmark and today's state. */
export function TopBar({ site, slug, back = null }) {
  const open = site.takeaway.openNow;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
        {back ? (
          <Link to={back} className="type-label flex min-h-12 items-center gap-1 text-accent">
            <span aria-hidden="true">←</span> Back
          </Link>
        ) : (
          <span className="w-10" />
        )}
        <Link to={`/r/${slug}`} className={`${DISPLAY} min-w-0 truncate text-xl text-ink`}>
          {site.wordmark ?? site.restaurantName}
        </Link>
        <span className={`type-caption flex items-center gap-1 ${open ? 'text-ok' : 'text-muted'}`}>
          <span aria-hidden="true" className={`size-2 rounded-full ${open ? 'bg-ok' : 'bg-line'}`} />
          {open ? 'Open' : 'Closed'}
        </span>
      </div>
    </header>
  );
}

/** Order, Details, Pay. The current step is filled; the done ones carry a tick. */
export function Steps({ steps, current }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Steps">
      {steps.map((step, index) => {
        const done = index < current;
        const here = index === current;
        return (
          <li key={step} className="flex flex-1 items-center gap-2" aria-current={here ? 'step' : undefined}>
            <span
              className={[
                'type-caption flex size-7 flex-none items-center justify-center rounded-full',
                here ? 'bg-accent text-on-accent' : done ? 'bg-ok text-on-accent' : 'border border-line bg-surface text-muted',
              ].join(' ')}
            >
              {done ? '✓' : index + 1}
            </span>
            <span className={`type-label truncate ${here ? 'text-ink' : 'text-muted'}`}>{step}</span>
            {index < steps.length - 1 && <span aria-hidden="true" className="h-px flex-1 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A ticket: a card with a perforated edge between its head and its body,
 * drawn with two notches and a dashed rule. Still, like everything here.
 */
export function Ticket({ head, children, tone = 'surface' }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line ${tone === 'accent' ? 'bg-accent text-on-accent' : 'bg-surface'}`}>
      <div className="px-5 pb-5 pt-6">{head}</div>
      <div className="relative">
        <span aria-hidden="true" className="absolute -left-3 -top-3 size-6 rounded-full border border-line bg-ground" />
        <span aria-hidden="true" className="absolute -right-3 -top-3 size-6 rounded-full border border-line bg-ground" />
        <div className={`mx-5 border-t-2 border-dashed ${tone === 'accent' ? 'border-on-accent/40' : 'border-line'}`} />
      </div>
      <div className="px-5 pb-6 pt-5">{children}</div>
    </div>
  );
}

/** A choice chip: dates, people, times. 48px tall, pressed when chosen. */
export function ChoiceChip({ selected, onClick, children, className = '', disabled = false }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={[
        'min-h-12 flex-none rounded-xl px-3 transition-colors duration-150 disabled:opacity-40',
        selected ? 'bg-ink text-surface' : 'border border-line bg-surface text-ink hover:border-ink',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/** A timeline of what happened and what is next. */
export function Timeline({ items }) {
  return (
    <ol className="grid gap-0">
      {items.map((item, index) => (
        <li key={item.label} className="grid grid-cols-[1.75rem_1fr] gap-3">
          <span className="flex flex-col items-center">
            <span
              className={[
                'mt-1 size-4 flex-none rounded-full border-2',
                item.state === 'done' ? 'border-ok bg-ok' : item.state === 'now' ? 'border-accent bg-surface' : item.state === 'stopped' ? 'border-alert bg-alert' : 'border-line bg-surface',
              ].join(' ')}
            />
            {index < items.length - 1 && <span className={`w-0.5 flex-1 ${item.state === 'done' ? 'bg-ok' : 'bg-line'}`} />}
          </span>
          <span className="pb-5">
            <span className={`type-label block ${item.state === 'later' ? 'text-muted' : 'text-ink'}`}>{item.label}</span>
            {item.detail && <span className="type-caption block text-muted">{item.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export const timeOrNull = (value) => (value ? formatTimeIst(value) : null);

/** The floating bar at the bottom of a phone screen, for the one next step. */
export function ActionBar({ children }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">{children}</div>
    </div>
  );
}
