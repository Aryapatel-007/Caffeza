import { useState } from 'react';

import { resetUserPassword } from '../../api/users.js';
import Button from '../../components/ui/Button.jsx';
import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import Input from '../../components/ui/Input.jsx';

/**
 * Reset a password for someone who forgot theirs.
 *
 * No current password: this is a manager acting for a member of staff. The
 * server refuses when the target is an owner and the caller is not.
 *
 * The new password is never sent back by the server, so it is shown here from
 * what was typed, once, and only until this closes.
 */
export default function ResetPasswordDialog({ staff, onClose }) {
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [isDone, setIsDone] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      await resetUserPassword(staff.id, newPassword);
      setIsDone(true);
    } catch (resetError) {
      setError(resetError);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
        {isDone ? (
          <>
            <h2 className="text-lg font-semibold text-slate-900">Password reset</h2>
            <p className="mt-2 text-sm text-slate-600">
              {staff.name} can sign in with the new password. They have been signed out everywhere
              and will need to use it next time.
            </p>
            <Button className="mt-6" fullWidth onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 className="text-lg font-semibold text-slate-900">Reset password</h2>
            <p className="mt-1 text-sm text-slate-500">
              For {staff.name}. Tell them the new password yourself, it is not shown again.
            </p>

            <Input
              className="mt-4"
              label="New password"
              type="text"
              required
              autoFocus
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={isSaving}
              hint="At least 8 characters."
            />

            {error && <ErrorMessage className="mt-4" error={error} />}

            <div className="mt-6 flex gap-3">
              <Button type="submit" isLoading={isSaving}>
                Reset password
              </Button>
              <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
