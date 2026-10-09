import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { listApprovers } from '../../api/users.js';

import Input from './Input.jsx';

const PIN_PATTERN = /^\d{4,6}$/;

/**
 * An owner's or manager's approval, typed on someone else's screen. P28, which
 * took it from P25 Part E's cancel after billing and P26's reopen, so every
 * sensitive action asks the same way.
 *
 * `useApproval(needed)` holds who was picked and the PIN. `ready` is true when
 * nothing is needed or both are filled in; `body` is what the request sends,
 * `{ approval }` or nothing. The server decides whether one is needed and
 * checks the PIN; this only decides what to show.
 */
export function useApproval(needed) {
  const [approverId, setApproverId] = useState('');
  const [pin, setPin] = useState('');
  const ready = !needed || Boolean(approverId && PIN_PATTERN.test(pin));
  const body = needed && approverId ? { approval: { approverId, pin } } : {};
  return { needed, approverId, setApproverId, pin, setPin, ready, body };
}

/** The approver tiles and the PIN box. Draws nothing when no approval is needed. */
export default function ApprovalStep({ approval }) {
  const approvers = useQuery({ queryKey: ['approvers'], queryFn: listApprovers, enabled: approval.needed });
  if (!approval.needed) return null;
  const anyWithPin = (approvers.data ?? []).some((person) => person.hasPin);

  return (
    <fieldset className="mt-4 flex flex-col gap-3">
      <legend className="type-heading mb-1">A manager approves</legend>
      <div className="flex flex-wrap gap-2">
        {(approvers.data ?? []).map((person) => (
          <button
            key={person.id}
            type="button"
            disabled={!person.hasPin}
            aria-pressed={approval.approverId === person.id}
            onClick={() => approval.setApproverId(person.id)}
            className={[
              'flex min-h-12 flex-col items-start justify-center rounded-lg border px-4 type-label disabled:opacity-50',
              approval.approverId === person.id ? 'border-2 border-ink bg-sunken' : 'border-line bg-surface',
            ].join(' ')}
          >
            {person.name}
            {!person.hasPin && <span className="type-caption text-muted">No PIN yet</span>}
          </button>
        ))}
      </div>
      {approvers.isSuccess && !anyWithPin && (
        <p className="type-caption text-muted">No owner or manager has a PIN yet. The owner sets one on the Staff screen.</p>
      )}
      <Input
        label="Their PIN"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={approval.pin}
        onChange={(event) => approval.setPin(event.target.value.replace(/\D/g, ''))}
      />
    </fieldset>
  );
}
