import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../users/roles.js';

/**
 * The frame every report screen sits in: the nav between reports, and ONE
 * date-range filter row above everything it scopes.
 *
 * One row, not one per chart. A filter inside a chart card invites two charts
 * on the same screen to be showing different ranges, and nothing on screen
 * says so.
 *
 * These are back-office screens on a desktop, not service screens on a tablet,
 * which is the one place this product's layout rules relax: a report may be
 * dense, and a table is the right form for a row carrying several numbers.
 * The tokens and the type ramp are unchanged.
 */
const TABS = [
  { to: '/reports', label: 'Today', end: true },
  { to: '/reports/sales', label: 'Sales' },
  { to: '/reports/tax', label: 'Tax' },
  { to: '/reports/discounts', label: 'Discounts' },
  { to: '/reports/stock', label: 'Stock' },
  { to: '/reports/labour', label: 'Labour' },
  { to: '/reports/payments', label: 'Payments', ownerOnly: true },
];

export default function ReportShell({ title, range, onRangeChange, children }) {
  const { pathname } = useLocation();
  const { user } = useAuth();

  const tabs = TABS.filter((tab) => !tab.ownerOnly || user?.role === ROLES.OWNER);

  return (
    <main className="min-h-full bg-paper">
      <header className="sticky top-0 z-10 border-b-2 border-ink bg-paper px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold leading-7">{title}</h1>
          <Link
            to="/dashboard"
            className="flex h-11 items-center rounded-[10px] px-3 text-[13px] font-medium text-steel hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            Dashboard
          </Link>
        </div>

        <nav className="mx-auto mt-2 flex max-w-6xl flex-wrap gap-1">
          {tabs.map((tab) => {
            const active = tab.end ? pathname === tab.to : pathname.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex h-10 items-center rounded-full px-3 text-[13px] font-medium',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                  active ? 'border-2 border-ink bg-chana/20 text-ink' : 'text-steel hover:bg-black/5',
                ].join(' ')}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* The one filter row. Everything below re-reads against this slice. */}
        {range && (
          <div className="mx-auto mt-3 flex max-w-6xl flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-steel">
                From
              </span>
              <input
                type="date"
                value={range.from}
                max={range.to}
                onChange={(event) => onRangeChange({ ...range, from: event.target.value })}
                className="h-11 rounded-[10px] border-2 border-steel/40 bg-paper px-3 font-mono text-[14px] focus:border-ink focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-steel">
                To
              </span>
              <input
                type="date"
                value={range.to}
                min={range.from}
                onChange={(event) => onRangeChange({ ...range, to: event.target.value })}
                className="h-11 rounded-[10px] border-2 border-steel/40 bg-paper px-3 font-mono text-[14px] focus:border-ink focus:outline-none"
              />
            </label>

            <div className="flex gap-1">
              {[
                { label: '7 days', days: 6 },
                { label: '30 days', days: 29 },
                { label: '90 days', days: 89 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onRangeChange(lastNDays(preset.days))}
                  className="h-11 rounded-[10px] border-2 border-steel/40 px-3 text-[13px] font-medium text-steel hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</div>
    </main>
  );
}

/** A range ending today, in IST business dates. */
export function lastNDays(days) {
  const IST_OFFSET_MINUTES = 330;
  const BOUNDARY_MINUTES = 300; // the default 05:00 business-day start
  const nowShifted = Date.now() + (IST_OFFSET_MINUTES - BOUNDARY_MINUTES) * 60_000;

  const to = new Date(nowShifted).toISOString().slice(0, 10);
  const from = new Date(nowShifted - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from, to };
}

/**
 * A section of a report screen. Chart on top, its table-view twin underneath
 * in a details element -- present for everyone, open on request, so no value
 * is reachable only by hovering a mark.
 */
export function ReportSection({ title, description, children, table }) {
  return (
    <section className="mb-8">
      <h2 className="text-[15px] font-semibold leading-5">{title}</h2>
      {description && <p className="mt-0.5 text-[13px] leading-[18px] text-steel">{description}</p>}
      <div className="mt-3">{children}</div>
      {table && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12px] font-medium text-steel hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            Show the numbers
          </summary>
          <div className="mt-2">{table}</div>
        </details>
      )}
    </section>
  );
}
