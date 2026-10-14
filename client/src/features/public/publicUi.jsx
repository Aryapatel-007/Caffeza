/**
 * The pieces the public page is built from. P24, restyled in P38.
 *
 * A street-food signboard: the restaurant's own brand colour for the header,
 * the buttons and the bars, a cream page, chit-paper cards with a hard ink
 * shadow, saffron for what is chosen, and saffron festoons between sections.
 * The tokens live under `[data-public]` in index.css. Nothing loops; the few
 * transitions stop under reduced motion, which index.css already enforces.
 */
import { Link } from 'react-router-dom';

import { formatTimeIst } from '../../utils/formatDate.js';

export const DISPLAY = 'font-anek font-[750] [font-stretch:112%] tracking-[-0.01em]';
/** Small capitals, for eyebrows and stamps. */
export const EYEBROW = 'font-anek text-xs font-[700] uppercase tracking-[0.14em]';

/** A row of saffron dots, the festoon strung under the signboard. */
export function Festoon({ className = '' }) {
  return <div aria-hidden="true" className={`festoon h-2 w-full ${className}`} />;
}

/** A small flourish either side of an eyebrow line. */
export function Flourish({ children, className = '' }) {
  return (
    <p className={`${EYEBROW} flex items-center gap-2 ${className}`}>
      <span aria-hidden="true">✦</span>
      <span>{children}</span>
      <span aria-hidden="true">✦</span>
    </p>
  );
}

/** The bar along the top of every page: the wordmark, today's state and a call button. */
export function TopBar({ site, slug, back = null }) {
  const open = site.takeaway.openNow;
  return (
    <header className="sticky top-0 z-20 bg-stall text-on-stall shadow-[0_4px_16px_rgb(0_0_0/0.18)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        {back ? (
          <Link to={back} className="flex min-h-12 min-w-12 items-center gap-1 font-anek text-sm font-[650]">
            <span aria-hidden="true" className="text-xl">←</span> Back
          </Link>
        ) : (
          <span className={`flex items-center gap-1.5 rounded-full bg-on-stall/15 px-3 py-1 ${EYEBROW}`}>
            <span aria-hidden="true" className={`size-2 rounded-full ${open ? 'bg-saffron' : 'bg-on-stall/50'}`} />
            {open ? 'Open' : 'Closed'}
          </span>
        )}
        <Link to={`/r/${slug}`} className={`${DISPLAY} min-w-0 truncate text-center text-2xl uppercase tracking-[0.02em]`}>
          {site.wordmark ?? site.restaurantName}
        </Link>
        {site.contactPhone ? (
          <a
            href={`tel:${site.contactPhone}`}
            aria-label={`Call ${site.restaurantName}`}
            className="flex size-12 flex-none items-center justify-center rounded-lg bg-saffron text-masala shadow-[2px_2px_0_rgb(0_0_0/0.35)]"
          >
            <span aria-hidden="true" className="text-xl">☎</span>
          </a>
        ) : (
          <span className="w-12" />
        )}
      </div>
      <Festoon className="opacity-90" />
    </header>
  );
}

/** Order, Details, Done, as three paper chits. The current one is saffron; done ones carry a tick. */
export function Steps({ steps, current }) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Steps">
      {steps.map((step, index) => {
        const done = index < current;
        const here = index === current;
        return (
          <li
            key={step}
            aria-current={here ? 'step' : undefined}
            className={[
              'flex min-h-12 items-center justify-center gap-1.5 rounded-md border-2 px-2 text-center',
              here ? 'chit-shadow -translate-y-0.5 border-masala bg-saffron text-masala' : done ? 'border-masala/40 bg-chit text-leaf' : 'border-dashed border-masala/30 bg-chit/60 text-masala-soft',
            ].join(' ')}
          >
            <span className="font-anek text-sm font-[750]">{done ? '✓' : `${index + 1}.`}</span>
            <span className="truncate font-anek text-sm font-[650] uppercase tracking-wide">{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A ticket, or a chit: a card with a perforated edge between its head and its
 * body, drawn with two notches and a dashed rule. Still, like everything here.
 */
export function Ticket({ head, children, tone = 'chit' }) {
  const stall = tone === 'accent';
  return (
    <div className={`chit-shadow relative overflow-hidden rounded-xl border-2 border-masala ${stall ? 'bg-stall text-on-stall' : 'bg-chit text-masala'}`}>
      <div aria-hidden="true" className={`festoon h-2 ${stall ? 'opacity-90' : 'bg-stall'}`} />
      <div className="px-5 pb-5 pt-5">{head}</div>
      <div className="relative">
        <span aria-hidden="true" className="absolute -left-3 -top-3 size-6 rounded-full border-2 border-masala bg-cream" />
        <span aria-hidden="true" className="absolute -right-3 -top-3 size-6 rounded-full border-2 border-masala bg-cream" />
        <div className={`mx-5 border-t-2 border-dashed ${stall ? 'border-on-stall/50' : 'border-masala/30'}`} />
      </div>
      <div className="px-5 pb-6 pt-5">{children}</div>
    </div>
  );
}

/** A rubber stamp, tilted: the state of a ticket at a glance. */
export function Stamp({ tone = 'leaf', children }) {
  const tones = {
    leaf: 'border-leaf text-leaf',
    saffron: 'border-masala text-masala bg-saffron-tint',
    stall: 'border-stall text-stall',
    quiet: 'border-masala-soft text-masala-soft',
  };
  return (
    <span className={`inline-block -rotate-3 rounded-md border-[3px] bg-chit px-3 py-1 ${EYEBROW} text-sm ${tones[tone] ?? tones.leaf}`}>{children}</span>
  );
}

/** A choice chip: dates, people, times. 48px tall, saffron when chosen. */
export function ChoiceChip({ selected, onClick, children, className = '', disabled = false }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={[
        'min-h-12 flex-none rounded-lg border-2 px-3 text-masala transition-colors duration-150 disabled:opacity-40',
        selected ? 'chit-shadow border-masala bg-saffron font-[700]' : 'border-masala/25 bg-chit hover:border-masala',
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
    <ol className="grid gap-0 rounded-xl border-2 border-masala/20 bg-chit p-4">
      {items.map((item, index) => (
        <li key={item.label} className="grid grid-cols-[1.75rem_1fr] gap-3">
          <span className="flex flex-col items-center">
            <span
              className={[
                'mt-1 size-5 flex-none rounded-full border-2',
                item.state === 'done' ? 'border-leaf bg-leaf' : item.state === 'now' ? 'border-stall bg-saffron' : item.state === 'stopped' ? 'border-stall bg-stall' : 'border-masala/30 bg-chit',
              ].join(' ')}
            />
            {index < items.length - 1 && <span className={`w-0.5 flex-1 ${item.state === 'done' ? 'bg-leaf' : 'border-l-2 border-dashed border-masala/30'}`} />}
          </span>
          <span className="pb-5">
            <span className={`block font-anek font-[650] ${item.state === 'later' ? 'text-masala-soft' : 'text-masala'}`}>{item.label}</span>
            {item.detail && <span className="type-caption block text-masala-soft">{item.detail}</span>}
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
    <div className="fixed inset-x-0 bottom-0 z-20 bg-stall px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-on-stall shadow-[0_-6px_20px_rgb(0_0_0/0.18)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">{children}</div>
    </div>
  );
}

/** The one big button on the bar: saffron on the brand colour, with a hard shadow. */
export function BarButton({ children, disabled = false, busy = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className="flex min-h-12 flex-none items-center gap-2 rounded-lg border-2 border-masala bg-saffron px-5 font-anek text-base font-[750] uppercase tracking-wide text-masala shadow-[3px_3px_0_rgb(0_0_0/0.45)] transition-transform active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50"
    >
      {busy ? 'Sending…' : children}
      {!busy && <span aria-hidden="true">→</span>}
    </button>
  );
}

/** A labelled section heading in the signboard type, with its flourish line above. */
export function SectionTitle({ eyebrow, title, line = null, id }) {
  return (
    <div className="grid gap-1">
      {eyebrow && <Flourish className="text-stall">{eyebrow}</Flourish>}
      <h2 id={id} className={`${DISPLAY} text-3xl leading-tight text-masala`}>{title}</h2>
      {line && <p className="type-body text-masala-soft">{line}</p>}
    </div>
  );
}
