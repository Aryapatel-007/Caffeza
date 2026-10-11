import { useState } from 'react';

import { resetPassword } from '../../api/authApi.js';
import Button from '../../components/ui/Button.jsx';
import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import Input from '../../components/ui/Input.jsx';

const MIN_PASSWORD_LENGTH = 8;

/**
 * P34. Forgot password: a new password, approved by an owner or manager beside
 * the person, who types their own phone and PIN. API-CONTRACT 1.7.
 *
 * The approver types a phone rather than picking a name, as P28 screens do:
 * nobody is signed in here, so there is no list of names to read.
 *
 * `onDone` receives the credentials to sign in with. The server says the same
 * thing for every refusal, so this form does too.
 */
export default function ResetPasswordForm({ initialIdentifier = '', onDone, onCancel }) {
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [approverPhone, setApproverPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tooShort = newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;

  async function handleSubmit(event) {
    event.preventDefault();
    if (tooShort || mismatch) return;
    setError(null);
    setIsSubmitting(true);

    const value = identifier.trim();
    const who = value.includes('@') ? { email: value } : { phone: value };
    try {
      await resetPassword({ ...who, newPassword, approverPhone: approverPhone.trim(), pin: pin.trim() });
      await onDone({ ...who, password: newPassword });
    } catch (resetError) {
      setError(resetError);
      setPin('');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      <Input
        label="Phone or email"
        name="identifier"
        type="text"
        autoComplete="username"
        required
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
        hint="Yours: the one you sign in with"
        disabled={isSubmitting}
      />

      <Input
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
        error={tooShort ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
        disabled={isSubmitting}
      />

      <Input
        label="New password again"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        error={mismatch ? 'The two passwords are not the same.' : undefined}
        disabled={isSubmitting}
      />

      <fieldset className="flex flex-col gap-4 rounded-[10px] border border-line p-4">
        <legend className="type-label px-1 text-ink">A manager approves</legend>
        <p className="type-caption -mt-2 text-muted">
          An owner or manager types their own phone and PIN. They cannot approve their own password.
        </p>

        <Input
          label="Manager's phone"
          name="approverPhone"
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          required
          value={approverPhone}
          onChange={(event) => setApproverPhone(event.target.value)}
          disabled={isSubmitting}
        />

        <Input
          label="PIN"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]{4,6}"
          maxLength={6}
          required
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
          disabled={isSubmitting}
        />
      </fieldset>

      {error && <ErrorMessage error={error} />}

      <Button type="submit" size="lg" fullWidth isLoading={isSubmitting} disabled={tooShort || mismatch}>
        Set password
      </Button>
      <Button variant="quiet" fullWidth onClick={onCancel} disabled={isSubmitting}>
        Back to sign in
      </Button>
    </form>
  );
}
