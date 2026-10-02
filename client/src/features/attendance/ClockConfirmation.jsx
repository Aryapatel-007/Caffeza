import { useEffect, useState } from 'react';

import AvailabilityStamp from '../../components/ui/AvailabilityStamp.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';
import { formatMinutes } from '../../utils/formatDuration.js';
import Bilingual from '../i18n/Bilingual.jsx';
import { LABELS } from '../i18n/labels.js';

/**
 * The full-screen "it's done" panel, held for a few seconds after a clock event.
 *
 * Undo, not confirm: the action already happened. This screen exists so a
 * mis-tap can be walked back without reading a dialog. A large UNDO sits under
 * the result; when the window closes the screen returns to the grid on its own.
 *
 * The number is the message. The name and the IN / OUT stamp are for
 * recognition; the time is set large in mono so it reads across a counter.
 */
export default function ClockConfirmation({ result, onUndo, onDone, undoBusy = false }) {
  const isIn = result.event === 'CLOCK_IN' || result.event === 'UNDO_REOPEN';
  const clockedIn = result.event === 'CLOCK_IN';
  const clockedOut = result.event === 'CLOCK_OUT';

  const until = new Date(result.undoUntil).getTime();
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((until - Date.now()) / 1000)),
  );

  useEffect(() => {
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(tick);
        onDone();
      }
    }, 250);
    return () => clearInterval(tick);
  }, [until, onDone]);

  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-8 bg-paper px-6">
      <AvailabilityStamp kind="clock" state={isIn ? 'available' : 'out_of_stock'} size="xl" />

      <div className="flex flex-col items-center gap-2">
        <span className="text-2xl font-semibold text-ink">{result.userName}</span>
        <Bilingual
          k={clockedOut ? 'clockedOut' : 'clockedIn'}
          size="md"
          align="center"
        />
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="font-mono text-6xl font-semibold tabular-nums text-ink">
          {formatTimeIst(result.at)}
        </span>
        {clockedOut && typeof result.workedMinutes === 'number' && (
          <span className="font-mono text-lg text-steel">
            {LABELS.clockWorked} {formatMinutes(result.workedMinutes)}
          </span>
        )}
        {clockedIn && (
          <span className="text-[13px] text-steel">
            {LABELS.clockSince} {formatTimeIst(result.at)}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onUndo}
        disabled={undoBusy || secondsLeft <= 0}
        className="flex min-h-[72px] min-w-[220px] items-center justify-center gap-2 rounded-full border-[3px] border-mirch bg-paper px-8 text-xl font-semibold text-mirch active:translate-y-0.5 transition-transform duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirch disabled:opacity-40"
      >
        <Bilingual k="clockUndo" size="lg" align="center" />
        {secondsLeft > 0 && (
          <span className="font-mono text-base tabular-nums text-steel">{secondsLeft}</span>
        )}
      </button>
    </div>
  );
}
