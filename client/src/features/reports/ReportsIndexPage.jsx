import { Link } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../users/roles.js';
import { GROUPS, reportPath, reportsFor } from './catalog.js';

/**
 * Every report the signed-in user may open, grouped, each with the question it
 * answers. M19, P18. A report the role cannot open is not listed; the server
 * refuses it regardless.
 *
 * The old labour and stock reports stay under "Other", and only while their
 * feature is switched on.
 */
export default function ReportsIndexPage() {
  const { user, features } = useAuth();
  const reports = reportsFor(user?.role);
  const others = [
    { to: '/reports/labour', title: 'Labour', question: 'Who worked how long?', show: features?.attendance !== false },
    {
      to: '/reports/stock',
      title: 'Stock',
      question: 'What was used, and what is running low?',
      show: features?.inventory !== false && [ROLES.OWNER, ROLES.MANAGER, ROLES.STOREKEEPER].includes(user?.role),
    },
  ].filter((entry) => entry.show);

  return (
    <main className="min-h-full bg-ground px-4 py-6 lg:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header>
          <h1 className="type-title ">Reports</h1>
          <p className="type-caption text-muted">
            Every number adds up, and every number opens the bills behind it.
          </p>
        </header>

        {GROUPS.map((group) => {
          const entries = reports.filter((report) => report.group === group);
          if (entries.length === 0) return null;
          return (
            <section key={group}>
              <h2 className="mb-2 type-label text-muted">{group}</h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map((report) => (
                  <li key={report.id}>
                    <ReportCard to={reportPath(report)} id={report.id} title={report.title} question={report.question} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {others.length > 0 && (
          <section>
            <h2 className="mb-2 type-label text-muted">Other</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((entry) => (
                <li key={entry.to}>
                  <ReportCard to={entry.to} title={entry.title} question={entry.question} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

function ReportCard({ to, id, title, question }) {
  return (
    <Link
      to={to}
      className="flex h-full flex-col gap-1 rounded-[10px] bg-surface p-4 border border-line transition hover:bg-sunken "
    >
      <span className="flex items-center justify-between gap-2">
        <span className="type-body font-semibold font-semibold">{title}</span>
        {id && <span className="type-num-meta text-muted">{id}</span>}
      </span>
      <span className="type-caption text-muted">{question}</span>
    </Link>
  );
}
