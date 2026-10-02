import { useState } from 'react';

import { setUserStatus } from '../../api/users.js';
import Button from '../../components/ui/Button.jsx';
import ErrorMessage from '../../components/ui/ErrorMessage.jsx';

/**
 * Confirmation before switching someone off.
 *
 * Deactivating is not a delete: the record stays, because attendance history
 * links to it. It does end every session that person has open, which is why it
 * is worth a confirmation rather than a stray click on a busy screen.
 */
export default function ConfirmDeactivateDialog({ staff, onClose, onDone }) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleConfirm() {
    setError(null);
    setIsSaving(true);

    try {
      await setUserStatus(staff.id, false);
      onDone();
    } catch (statusError) {
      /**
       * This is where the last-owner rule shows up, as a 422 from the server.
       *
       * That rule is deliberately not duplicated here. Counting active owners
       * in the browser would be a second implementation that can disagree with
       * the first, and the browser does not have the data to count anyway.
       * Show what the server said.
       */
      setError(statusError);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-ink">Deactivate {staff.name}?</h2>
        <p className="mt-2 text-sm text-muted">
          They will be signed out everywhere and will not be able to sign in again. Their record and
          history stay. You can switch them back on later.
        </p>

        {error && <ErrorMessage className="mt-4" error={error} />}

        <div className="mt-6 flex gap-3">
          <Button variant="danger" onClick={handleConfirm} isLoading={isSaving}>
            Deactivate
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
