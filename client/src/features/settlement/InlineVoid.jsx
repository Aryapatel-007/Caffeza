import { useState } from 'react';

/**
 * Void, with the reason asked for in place rather than in a browser dialog. P09
 * and P10. The record is kept, marked voided; the server requires the reason.
 */
export default function InlineVoid({ isBusy, onConfirm }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="min-h-12 type-caption text-alert underline"
      >
        Void
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <input
        type="text"
        value={reason}
        maxLength={200}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Why?"
        aria-label="Why is this being voided?"
        className="w-32 rounded-lg border-2 border-muted px-2 py-1 type-caption"
      />
      <button
        type="button"
        disabled={!reason.trim() || isBusy}
        onClick={() => onConfirm(reason.trim())}
        className="min-h-12 type-caption text-alert underline disabled:opacity-50"
      >
        Void it
      </button>
    </span>
  );
}
