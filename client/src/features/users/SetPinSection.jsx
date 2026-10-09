import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { setUserPin } from '../../api/users.js';
import Button from '../../components/ui/Button.jsx';
import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import Input from '../../components/ui/Input.jsx';

const PIN_PATTERN = /^\d{4,6}$/;

/**
 * Set PIN, on a staff member's page. P28. An owner or manager types theirs on a
 * cashier's or captain's screen to approve a cancel, a void, No Charge or cash
 * in or out, and staff use theirs on the attendance clock. Typed twice; never
 * shown again. The server refuses a manager setting an owner's.
 */
export default function SetPinSection({ userId }) {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const save = useMutation({
    mutationFn: () => setUserPin(userId, pin),
    onSuccess: () => {
      setPin('');
      setAgain('');
    },
  });
  const digits = (setter) => (event) => setter(event.target.value.replace(/\D/g, ''));
  const matches = PIN_PATTERN.test(pin) && pin === again;

  return (
    <section className="mt-8 flex flex-col gap-4 border-t border-line pt-6">
      <div>
        <h2 className="type-heading">Set PIN</h2>
        <p className="type-caption text-muted">
          4 to 6 digits. An owner or manager types it to approve cancels, voids, No Charge and cash on someone else&rsquo;s screen.
        </p>
      </div>
      <Input label="New PIN" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={digits(setPin)} />
      <Input
        label="The same PIN again"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        value={again}
        onChange={digits(setAgain)}
        hint={again && pin !== again ? 'The two PINs are different.' : undefined}
      />
      {save.isError && <ErrorMessage error={save.error} />}
      {save.isSuccess && <p className="type-body text-ok">PIN set.</p>}
      <div>
        <Button type="button" disabled={!matches} isLoading={save.isPending} onClick={() => save.mutate()}>
          Set PIN
        </Button>
      </div>
    </section>
  );
}
