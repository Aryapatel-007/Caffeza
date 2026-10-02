import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import Button from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Toast from '../../components/ui/Toast.jsx';
import * as attendanceApi from '../../api/attendance.js';
import { listUsers } from '../../api/users.js';
import { businessDateToday, formatTimeIst } from '../../utils/formatDate.js';
import { formatMinutes } from '../../utils/formatDuration.js';
import CorrectionPanel from './CorrectionPanel.jsx';
import { errorMessage } from './errorCopy.js';

/** Flagged first, then still-open, then most recent clock-in. */
function forRegister(a, b) {
  if (a.requiresAttention !== b.requiresAttention) return a.requiresAttention ? -1 : 1;
  const aOpen = a.clockOutAt === null;
  const bOpen = b.clockOutAt === null;
  if (aOpen !== bOpen) return aOpen ? -1 : 1;
  return new Date(b.clockInAt) - new Date(a.clockInAt);
}

/**
 * `/attendance/register`. OWNER and MANAGER.
 *
 * The day's entries as a dense list, not cards (docs/DESIGN-SYSTEM section 6).
 * Open shifts and anything open past twelve hours sit at the top. Correcting an
 * entry, or adding one that was missed, opens the slide-over.
 */
export default function AttendanceRegisterPage() {
  const queryClient = useQueryClient();

  const [from, setFrom] = useState(businessDateToday);
  const [to, setTo] = useState(businessDateToday);
  const [panel, setPanel] = useState(null); // null | { mode: 'create' } | { mode: 'edit', entry }
  const [toast, setToast] = useState(null);

  const registerKey = ['attendance-register', { from, to }];
  const registerQuery = useQuery({
    queryKey: registerKey,
    queryFn: () => attendanceApi.listRegister({ from, to, limit: 200 }),
  });

  const staffQuery = useQuery({
    queryKey: ['attendance-register-staff'],
    queryFn: () => listUsers({ limit: 200 }),
    enabled: panel?.mode === 'create',
  });

  const entries = useMemo(
    () => [...(registerQuery.data?.data ?? [])].sort(forRegister),
    [registerQuery.data],
  );

  const done = (message) => {
    setToast({ tone: 'success', message });
    setPanel(null);
    queryClient.invalidateQueries({ queryKey: registerKey });
  };
  const failed = (error) => setToast({ tone: 'error', message: errorMessage(error) });

  const correct = useMutation({
    mutationFn: ({ entryId, changes }) => attendanceApi.correctEntry(entryId, changes),
    onSuccess: () => done('Correction saved'),
    onError: failed,
  });
  const create = useMutation({
    mutationFn: (values) => attendanceApi.createEntry(values),
    onSuccess: () => done('Entry added'),
    onError: failed,
  });
  const voidEntry = useMutation({
    mutationFn: ({ entryId, reason }) => attendanceApi.voidEntry(entryId, reason),
    onSuccess: () => done('Entry voided'),
    onError: failed,
  });

  const busy = correct.isPending || create.isPending || voidEntry.isPending;
  const panelError =
    (correct.error && errorMessage(correct.error)) ||
    (create.error && errorMessage(create.error)) ||
    (voidEntry.error && errorMessage(voidEntry.error)) ||
    null;

  const dateInput =
    'min-h-12 rounded-lg border-0 px-3 text-base text-ink ring-1 ring-inset ring-muted focus:ring-2 focus:ring-inset focus:ring-ink';

  return (
    <main className="mx-auto flex min-h-full w-full max-w-4xl flex-col bg-ground">
      <header className="sticky top-0 z-10 flex flex-wrap items-end justify-between gap-3 border-b border-line bg-ground px-5 py-4">
        <h1 className="text-xl font-semibold text-ink">Attendance</h1>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col type-label text-muted">
            From
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={dateInput} />
          </label>
          <label className="flex flex-col type-label text-muted">
            To
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={dateInput} />
          </label>
          <Button type="button" onClick={() => setPanel({ mode: 'create' })}>
            Add entry
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-5">
        {registerQuery.isLoading && <Spinner label="Loading the register" />}

        {registerQuery.isError && (
          <ErrorMessage
            error={{ message: errorMessage(registerQuery.error) }}
            onRetry={() => registerQuery.refetch()}
          />
        )}

        {!registerQuery.isLoading && !registerQuery.isError && entries.length === 0 && (
          <EmptyState
            title="No entries for these dates"
            description="Nobody clocked in on the selected day, or the range is empty."
          />
        )}

        {entries.length > 0 && (
          <ul className="divide-y divide-line">
            {entries.map((entry) => {
              const open = entry.clockOutAt === null;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setPanel({ mode: 'edit', entry })}
                    className="flex w-full items-center justify-between gap-4 py-3 text-left "
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="type-body text-ink">
                        {entry.userName}
                        <span className="ml-2 type-caption text-muted">
                          {entry.userRole}
                        </span>
                        {entry.isVoided && (
                          <span className="ml-2 type-num-meta text-alert">voided</span>
                        )}
                      </span>
                      <span className="type-num-meta text-muted">
                        {formatTimeIst(entry.clockInAt)}
                        {' — '}
                        {open ? 'open' : formatTimeIst(entry.clockOutAt)}
                        {entry.businessDate ? ` · ${entry.businessDate}` : ''}
                      </span>
                    </div>

                    <div className="flex flex-none items-center gap-3">
                      {entry.requiresAttention && (
                        <span className="rounded-full border-2 border-alert px-2 py-0.5 type-num-meta text-alert">
                          Open 12h+
                        </span>
                      )}
                      <span className="type-num tabular-nums text-ink">
                        {open ? formatMinutes(entry.openMinutes) : formatMinutes(entry.workedMinutes)}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {panel?.mode === 'edit' && (
        <CorrectionPanel
          entry={panel.entry}
          staff={[]}
          onCorrect={(entryId, changes) => correct.mutate({ entryId, changes })}
          onVoid={(entryId, reason) => voidEntry.mutate({ entryId, reason })}
          onClose={() => setPanel(null)}
          busy={busy}
          error={panelError}
        />
      )}

      {panel?.mode === 'create' && (
        <CorrectionPanel
          entry={null}
          staff={staffQuery.data?.data ?? []}
          onCreate={(values) => create.mutate(values)}
          onClose={() => setPanel(null)}
          busy={busy}
          error={panelError}
        />
      )}

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}
