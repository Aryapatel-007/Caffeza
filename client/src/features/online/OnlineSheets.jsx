/**
 * The accept and decline sheets for an online takeaway, and the decline sheet
 * a booking reuses. P23. The server decides; these only ask, and show what it
 * answered.
 */
import { useState } from 'react';

import Money from '../../components/ui/Money.jsx';
import ReasonPicker, { isReasonComplete, reasonBody } from '../../components/ui/ReasonPicker.jsx';
import Sheet, { SheetActions } from '../../components/ui/Sheet.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';

const MINUTE_MS = 60_000;

/** The server's own sentence is written for a person to read. */
export const errorText = (error) =>
  error?.code === 'NETWORK' || !error?.message ? 'Could not reach the server. Check the connection.' : error.message;

/** The guest's time, then the same pushed back in steps the kitchen can promise. */
function pickupChoices(guestTime) {
  const base = new Date(guestTime).getTime();
  return [0, 10, 20, 30, 45].map((minutes) => {
    const at = new Date(base + minutes * MINUTE_MS);
    return { value: at.toISOString(), label: minutes === 0 ? `${formatTimeIst(at)}, as the guest asked` : `${formatTimeIst(at)}, ${minutes} minutes later` };
  });
}

export function AcceptSheet({ request, onAccept, onDecline, onClose, isPending, error }) {
  const choices = pickupChoices(request.pickupAt);
  const [pickupAt, setPickupAt] = useState(choices[0].value);
  const [fireNow, setFireNow] = useState(true);
  const changes = error?.code === 'ONLINE_ORDER_CHANGED' ? error.changes ?? [] : null;
  const unavailable = changes?.some((change) => change.unavailable);

  const send = (acceptChangedPrices = false) =>
    onAccept({ pickupAt: pickupAt === choices[0].value ? undefined : pickupAt, fireNow, acceptChangedPrices });

  return (
    <Sheet
      title={`Accept ${request.reference}`}
      subtitle={`${request.customerName} · ${request.itemCount} items`}
      onClose={onClose}
      footer={
        changes ? (
          <SheetActions
            cancelLabel="Decline"
            onCancel={onDecline}
            confirmLabel={unavailable ? 'Cannot accept' : 'Accept with new prices'}
            disabled={unavailable || isPending}
            onConfirm={() => send(true)}
          />
        ) : (
          <SheetActions cancelLabel="Cancel" onCancel={onClose} confirmLabel="Accept" disabled={isPending} onConfirm={() => send(false)} />
        )
      }
    >
      <div className="grid gap-4">
        <fieldset className="grid gap-2">
          <legend className="type-heading mb-1">Pickup time</legend>
          {choices.map((choice) => (
            <label key={choice.value} className="flex min-h-12 items-center gap-3">
              <input
                type="radio"
                name="pickup"
                checked={pickupAt === choice.value}
                onChange={() => setPickupAt(choice.value)}
                className="size-5 accent-[var(--color-accent)]"
              />
              <span className="type-body">{choice.label}</span>
            </label>
          ))}
        </fieldset>

        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" checked={fireNow} onChange={(event) => setFireNow(event.target.checked)} className="size-5 accent-[var(--color-accent)]" />
          <span className="type-body">Send to kitchen now</span>
        </label>

        {changes && (
          <div className="grid gap-2 rounded-lg border border-alert bg-alert-tint p-3 text-alert">
            <p className="type-label">{error.message}</p>
            <ul className="grid gap-1">
              {changes.map((change) => (
                <li key={`${change.itemName}-${change.variantName ?? ''}`} className="type-body">
                  {change.itemName}
                  {change.variantName ? ` (${change.variantName})` : ''}
                  {change.unavailable ? (
                    ' is not available'
                  ) : (
                    <>
                      {': was '}
                      <Money paise={change.wasInPaise} tabular />
                      {', now '}
                      <Money paise={change.nowInPaise} tabular />
                    </>
                  )}
                </li>
              ))}
            </ul>
            <a href={`tel:${request.customerPhone}`} className="type-button flex min-h-12 items-center underline">
              Call the guest, {request.customerPhone}
            </a>
          </div>
        )}
        {error && !changes && <p className="type-body text-alert">{errorText(error)}</p>}
      </div>
    </Sheet>
  );
}

export function DeclineSheet({ title, reasons, onDecline, onClose, isPending, error }) {
  const [reason, setReason] = useState({ reasonCode: null, note: '' });
  return (
    <Sheet
      title={title}
      subtitle="The guest sees the reason, never your note."
      onClose={onClose}
      footer={
        <SheetActions
          onCancel={onClose}
          confirmLabel="Decline"
          danger
          disabled={!isReasonComplete(reason) || isPending}
          onConfirm={() => onDecline(reasonBody(reason))}
        />
      }
    >
      <ReasonPicker reasons={reasons} value={reason} onChange={setReason} legend="Why" />
      {error && <p className="type-body mt-3 text-alert">{errorText(error)}</p>}
    </Sheet>
  );
}
