import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext.jsx';
import { businessDateForIst } from '../../utils/formatDate.js';
import { ROLES } from '../users/roles.js';

/**
 * P18: only the old Labour and Stock screens still use this frame; every other
 * report renders through features/reports/ReportPage.jsx.
 *
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
  { to: '/reports', label: 'All reports', end: true },
  { to: '/reports/stock', label: 'Stock', feature: 'inventory' },
  { to: '/reports/labour', label: 'Labour', feature: 'attendance' },
];

export default function ReportShell({ title, range, onRangeChange, children }) {
  const { pathname } = useLocation();
  const { user, features } = useAuth();

  // P02. A tab for a switched-off module is hidden; the server refuses its
  // report with FEATURE_DISABLED regardless.
  const tabs = TABS.filter(
    (tab) =>
      (!tab.ownerOnly || user?.role === ROLES.OWNER) &&
      (!tab.feature || features?.[tab.feature] !== false),
  );

  return (
    <main className="min-h-full bg-ground">
      <header className="sticky top-0 z-10 border-b border-line bg-ground px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <h1 className="type-heading">{title}</h1>
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
                  'flex min-h-12 items-center rounded-lg px-3 type-caption',
                  '',
                  active ? 'border border-line bg-sunken text-ink' : 'text-muted hover:bg-sunken',
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
              <span className="type-label text-muted">
                From
              </span>
              <input
                type="date"
                value={range.from}
                max={range.to}
                onChange={(event) => onRangeChange({ ...range, from: event.target.value })}
                className="min-h-12 rounded-lg border border-muted bg-surface px-3 type-num"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="type-label text-muted">
                To
              </span>
              <input
                type="date"
                value={range.to}
                min={range.from}
                onChange={(event) => onRangeChange({ ...range, to: event.target.value })}
                className="min-h-12 rounded-lg border border-muted bg-surface px-3 type-num"
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
                  className="min-h-12 rounded-lg border-2 border-muted px-3 type-caption text-muted hover:border-ink hover:text-ink "
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

/** A range ending today, in IST business dates, at the default 05:00 start. */
export function lastNDays(days) {
  const now = Date.now();
  const to = businessDateForIst(now);
  const from = businessDateForIst(now - days * 24 * 60 * 60 * 1000);
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
      <h2 className="type-body font-semibold font-semibold">{title}</h2>
      {description && <p className="mt-1 type-caption text-muted">{description}</p>}
      <div className="mt-3">{children}</div>
      {table && (
        <details className="mt-3">
          <summary className="cursor-pointer type-label text-muted hover:text-ink ">
            Show the numbers
          </summary>
          <div className="mt-2">{table}</div>
        </details>
      )}
    </section>
  );
}
