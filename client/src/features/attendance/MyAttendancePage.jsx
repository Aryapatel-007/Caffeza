import { useQuery } from '@tanstack/react-query';

import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import * as attendanceApi from '../../api/attendance.js';
import { formatDateIst, formatTimeIst } from '../../utils/formatDate.js';
import { formatMinutes } from '../../utils/formatDuration.js';
import { errorMessage } from './errorCopy.js';

/**
 * `/attendance/me`. Every role. Read only.
 *
 * Your open shift, your closed shifts over the last seven business days, and the
 * minutes those add up to. No actions: a correction is a manager's job, from the
 * register.
 */
export default function MyAttendancePage() {
  const meQuery = useQuery({
    queryKey: ['attendance-me'],
    queryFn: attendanceApi.getMyAttendance,
  });

  const data = meQuery.data;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-col bg-paper">
      <header className="border-b border-black/5 px-5 py-4">
        <h1 className="text-xl font-semibold text-ink">My hours</h1>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-5">
        {meQuery.isLoading && <Spinner label="Loading your hours" />}

        {meQuery.isError && (
          <ErrorMessage
            error={{ message: errorMessage(meQuery.error) }}
            onRetry={() => meQuery.refetch()}
          />
        )}

        {data && (
          <>
            <section className="flex items-end justify-between gap-4 rounded-xl border border-black/5 shadow-card p-4">
              <div className="flex flex-col">
                <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-steel">
                  Last 7 days
                </span>
                <span className="font-mono text-4xl font-semibold tabular-nums text-ink">
                  {formatMinutes(data.rangeMinutes)}
                </span>
              </div>
              {data.openShift ? (
                <span className="font-mono text-sm text-patta">
                  On the clock since {formatTimeIst(data.openShift.clockInAt)}
                </span>
              ) : (
                <span className="font-mono text-sm text-steel">Clocked out</span>
              )}
            </section>

            {data.recent.length === 0 ? (
              <p className="text-[15px] text-steel">No closed shifts in the last seven days.</p>
            ) : (
              <ul className="divide-y divide-steel/25">
                {data.recent.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-[15px] text-ink">{formatDateIst(entry.clockInAt)}</span>
                      <span className="font-mono text-[13px] text-steel">
                        {formatTimeIst(entry.clockInAt)} — {formatTimeIst(entry.clockOutAt)}
                      </span>
                    </div>
                    <span className="font-mono text-[15px] font-medium tabular-nums text-ink">
                      {formatMinutes(entry.workedMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </main>
  );
}
