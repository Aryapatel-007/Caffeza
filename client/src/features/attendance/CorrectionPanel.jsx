import { useMemo, useState } from 'react';

import Button from '../../components/ui/Button.jsx';
import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import { fromDatetimeLocalIst, toDatetimeLocalIst, toIst } from '../../utils/formatDate.js';

/**
 * The slide-over for fixing or adding an attendance entry.
 *
 * A panel, not a modal, matching the M1 item editor: a manager correcting one
 * shift needs to keep the day's list in view. The reason is required on every
 * write — a correction nobody can explain is not an audit trail — and the
 * entry's own correction history is shown right here, because a trail nobody
 * looks at is not a trail either.
 *
 * The form works in IST wall-clock through <input type="datetime-local">; every
 * value leaving here is a UTC ISO string, converted in utils/formatDate.js.
 */
export default function CorrectionPanel({
  entry,
  staff,
  onCorrect,
  onCreate,
  onVoid,
  onClose,
  busy = false,
  error = null,
}) {
  const isCreate = !entry;

  const [userId, setUserId] = useState('');
  const [clockInLocal, setClockInLocal] = useState(
    isCreate ? '' : toDatetimeLocalIst(entry.clockInAt),
  );
  const [clockOutLocal, setClockOutLocal] = useState(
    isCreate || !entry.clockOutAt ? '' : toDatetimeLocalIst(entry.clockOutAt),
  );
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState(null);

  const userOptions = useMemo(
    () => [
      { value: '', label: 'Choose a staff member' },
      ...[...staff]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((person) => ({ value: person.id, label: person.name })),
    ],
    [staff],
  );

  const requireReason = () => {
    if (reason.trim().length === 0) {
      setFieldError('A reason is required.');
      return false;
    }
    setFieldError(null);
    return true;
  };

  const submit = (event) => {
    event.preventDefault();
    if (!requireReason()) return;

    if (isCreate) {
      if (!userId || !clockInLocal) {
        setFieldError('Pick a staff member and a clock-in time.');
        return;
      }
      onCreate({
        userId,
        clockInAt: fromDatetimeLocalIst(clockInLocal),
        clockOutAt: clockOutLocal ? fromDatetimeLocalIst(clockOutLocal) : undefined,
        reason: reason.trim(),
      });
      return;
    }

    const changes = { reason: reason.trim() };
    const nextIn = fromDatetimeLocalIst(clockInLocal);
    const nextOut = clockOutLocal ? fromDatetimeLocalIst(clockOutLocal) : null;
    if (nextIn && nextIn !== entry.clockInAt) changes.clockInAt = nextIn;
    if (nextOut && nextOut !== entry.clockOutAt) changes.clockOutAt = nextOut;

    if (!changes.clockInAt && !changes.clockOutAt) {
      setFieldError('Change a clock-in or clock-out time to correct this entry.');
      return;
    }
    onCorrect(entry.id, changes);
  };

  const voidThis = () => {
    if (!requireReason()) return;
    onVoid(entry.id, reason.trim());
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-line bg-ground p-6 shadow-float">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-ink">
          {isCreate ? 'Add a missed entry' : `Correct ${entry.userName}'s shift`}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 px-1 type-caption text-muted underline-offset-4 hover:underline "
        >
          Close
        </button>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        {isCreate && (
          <Select
            label="Staff member"
            options={userOptions}
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          />
        )}

        <Input
          label="Clock in (IST)"
          type="datetime-local"
          value={clockInLocal}
          onChange={(event) => setClockInLocal(event.target.value)}
        />
        <Input
          label={isCreate ? 'Clock out (IST) — leave blank for an open shift' : 'Clock out (IST)'}
          type="datetime-local"
          value={clockOutLocal}
          onChange={(event) => setClockOutLocal(event.target.value)}
        />

        <Input
          label="Reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={fieldError}
          placeholder="What is being changed and why"
        />

        {error && <ErrorMessage error={{ message: error }} />}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="submit" isLoading={busy}>
            {isCreate ? 'Add entry' : 'Save correction'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {!isCreate && !entry.isVoided && (
            <button
              type="button"
              onClick={voidThis}
              disabled={busy}
              className="ml-auto min-h-12 type-caption text-alert underline-offset-4 hover:underline "
            >
              Void this entry
            </button>
          )}
        </div>
      </form>

      {!isCreate && entry.corrections?.length > 0 && (
        <section className="mt-2 border-t border-line pt-4">
          <h3 className="type-label text-muted">
            Correction history
          </h3>
          <ul className="mt-2 flex flex-col gap-3">
            {entry.corrections.map((correction) => (
              <li key={correction.id} className="type-caption text-ink">
                <span className="font-mono text-muted">{toIst(correction.correctedAt)}</span>
                <span className="mx-1">·</span>
                <span className="font-medium">{correction.field}</span>
                <p className="text-muted">{correction.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
