import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import AvailabilityStamp from '../../components/ui/AvailabilityStamp.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import * as attendanceApi from '../../api/attendance.js';
import { listUsers } from '../../api/users.js';
import { formatTimeIst } from '../../utils/formatDate.js';
import Bilingual from '../i18n/Bilingual.jsx';
import ClockConfirmation from './ClockConfirmation.jsx';
import { LABELS } from '../i18n/labels.js';
import PinPad from './PinPad.jsx';

const ROSTER_KEY = ['clock-roster'];
const OPEN_KEY = ['clock-open-shifts'];

function initialsOf(name) {
  return (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

/**
 * The clock. `/attendance`. Every role.
 *
 * A shared tablet on a wall. One screen, one job: find your tile, tap it, type
 * your PIN, done. No nav, nothing else reachable from here (docs/DESIGN-SYSTEM
 * section 6, and the M5 brief section 7).
 *
 * The tablet holds one ordinary session for the whole floor. The roster read
 * (`/users`) and the open-shift read (`/attendance`) are OWNER/MANAGER only, so
 * the tablet has to be signed in as one of those; the clock action itself
 * (`/attendance/station/clock`) is open to every role and is what a PIN reaches.
 */
export default function ClockScreen() {
  const queryClient = useQueryClient();

  const [mode, setMode] = useState('grid'); // grid | pin | confirm
  const [selected, setSelected] = useState(null);
  const [pendingPin, setPendingPin] = useState('');
  const [result, setResult] = useState(null);
  const [pinError, setPinError] = useState(null);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(tick);
  }, []);

  const rosterQuery = useQuery({
    queryKey: ROSTER_KEY,
    queryFn: () => listUsers({ limit: 200, isActive: true }),
  });
  const openQuery = useQuery({
    queryKey: OPEN_KEY,
    queryFn: () => attendanceApi.listRegister({ openOnly: true }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const openByUser = useMemo(() => {
    const map = new Map();
    for (const entry of openQuery.data?.data ?? []) map.set(entry.userId, entry);
    return map;
  }, [openQuery.data]);

  const roster = useMemo(
    () =>
      [...(rosterQuery.data?.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [rosterQuery.data],
  );

  const clockMutation = useMutation({
    mutationFn: ({ userId, pin, action }) =>
      attendanceApi.stationClock({ userId, pin, action }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: OPEN_KEY });
      if (data.event === 'UNDO') {
        backToGrid();
        return;
      }
      setResult(data);
      setMode('confirm');
    },
    onError: (error) => {
      if (error?.code === 'PIN_LOCKED') setPinError('clockPinLocked');
      else if (error?.code === 'INVALID_PIN') setPinError('clockWrongPin');
      else setPinError({ en: 'Could not reach the server. Try again.', hi: 'सर्वर नहीं मिला। फिर कोशिश करें।' });
    },
  });

  function backToGrid() {
    setMode('grid');
    setSelected(null);
    setPendingPin('');
    setResult(null);
    setPinError(null);
    clockMutation.reset();
  }

  const onPickName = (person) => {
    setSelected(person);
    setPinError(null);
    setMode('pin');
  };

  const onSubmitPin = (pin) => {
    setPinError(null);
    setPendingPin(pin);
    clockMutation.mutate({ userId: selected.id, pin });
  };

  const onUndo = () => {
    clockMutation.mutate({ userId: selected.id, pin: pendingPin, action: 'undo' });
  };

  if (mode === 'confirm' && result) {
    return (
      <ClockConfirmation
        result={result}
        onUndo={onUndo}
        onDone={backToGrid}
        undoBusy={clockMutation.isPending}
      />
    );
  }

  if (mode === 'pin' && selected) {
    return (
      <main className="flex min-h-full flex-col justify-center bg-paper px-4 py-10">
        <PinPad
          personName={selected.name}
          onSubmit={onSubmitPin}
          onBack={backToGrid}
          busy={clockMutation.isPending}
          errorLabel={pinError}
        />
      </main>
    );
  }

  const managerNeeded =
    rosterQuery.error?.status === 403 || openQuery.error?.status === 403;

  return (
    <main className="flex min-h-full flex-col bg-paper">
      <header className="flex items-center justify-between border-b border-black/5 px-5 py-4">
        <h1>
          <Bilingual k="clockTitle" size="lg" />
        </h1>
        <span className="font-mono text-2xl font-semibold tabular-nums text-ink">
          {formatTimeIst(now)}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-5 p-5">
        {(rosterQuery.isLoading || openQuery.isLoading) && !managerNeeded && (
          <Spinner label="Loading the roster" />
        )}

        {managerNeeded && (
          <div className="mx-auto max-w-md rounded-xl border border-black/5 shadow-card bg-white p-6 text-center">
            <p className="text-[15px] leading-[22px] text-ink">
              This tablet needs to be signed in as an owner or manager to show the staff list.
            </p>
            <p lang="hi" className="mt-2 text-[13px] text-steel">
              यह टैबलेट मालिक या मैनेजर से साइन-इन होना चाहिए।
            </p>
          </div>
        )}

        {!managerNeeded && roster.length > 0 && (
          <>
            <Bilingual k="clockPickName" size="md" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {roster.map((person) => {
                const open = openByUser.get(person.id);
                const isIn = Boolean(open);
                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => onPickName(person)}
                    className="flex min-h-[112px] flex-col items-start justify-between gap-3 rounded-xl border border-black/5 shadow-card bg-white p-4 text-left active:translate-y-0.5 transition-transform duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    <div className="flex w-full items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-black/5 shadow-card font-mono text-lg font-semibold text-ink"
                      >
                        {initialsOf(person.name)}
                      </span>
                      <span className="text-[15px] font-medium leading-[20px] text-ink">
                        {person.name}
                      </span>
                    </div>
                    <div className="flex w-full items-center justify-between">
                      <AvailabilityStamp
                        kind="clock"
                        state={isIn ? 'available' : 'out_of_stock'}
                        size="sm"
                      />
                      {isIn && (
                        <span className="font-mono text-xs text-steel">
                          {LABELS.clockSince} {formatTimeIst(open.clockInAt)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {!managerNeeded && !rosterQuery.isLoading && roster.length === 0 && (
          <p className="text-[15px] text-steel">No active staff to show yet.</p>
        )}
      </div>
    </main>
  );
}
