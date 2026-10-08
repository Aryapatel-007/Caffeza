import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { cancelBillLines } from '../../api/bills.js';
import { listApprovers } from '../../api/users.js';
import Input from '../../components/ui/Input.jsx';
import { moneyText } from '../../components/ui/Money.jsx';
import ReasonPicker, { isReasonComplete, reasonBody } from '../../components/ui/ReasonPicker.jsx';
import Sheet, { SheetActions } from '../../components/ui/Sheet.jsx';
import { LINE_CANCEL_REASONS } from '../orders/cancelReasons.js';
import { errorMessage } from './errorCopy.js';

/**
 * Cancelling an item after the bill is made. P25 Part E, API-CONTRACT M3
 * section 16.4.
 *
 * Pick the items, say whether each was already made and why, and the server
 * works out what happens: a preview of the very same request, rolled back,
 * so the confirmation states the consequence in real numbers ("A new bill for
 * ₹449.00 will be made. Give back ₹346.00 in cash."). The till's arithmetic
 * stays on the server. A cashier or captain then asks a manager to pick their
 * name and type their PIN on this same screen.
 */
export default function CancelItemsPanel({ bill, needsApproval, onCancel, onDone }) {
  const [picked, setPicked] = useState({});
  const [reason, setReason] = useState({ reasonCode: null, note: '' });
  const [approverId, setApproverId] = useState('');
  const [pin, setPin] = useState('');

  const chosen = bill.lines.filter((line) => picked[line.orderLineId] !== undefined);
  const request = (extra = {}) => ({
    lines: chosen.map((line) => ({ lineId: line.orderLineId, wasPrepared: picked[line.orderLineId] })),
    ...reasonBody(reason),
    ...extra,
  });

  const approvers = useQuery({ queryKey: ['approvers'], queryFn: listApprovers, enabled: needsApproval });
  const preview = useMutation({ mutationFn: () => cancelBillLines(bill.id, request({ preview: true })) });
  const confirm = useMutation({
    mutationFn: () => cancelBillLines(bill.id, request(needsApproval ? { approval: { approverId, pin } } : {})),
    onSuccess: onDone,
  });

  const toggle = (line) =>
    setPicked((current) => {
      const next = { ...current };
      if (next[line.orderLineId] === undefined) next[line.orderLineId] = true;
      else delete next[line.orderLineId];
      return next;
    });
  const setMade = (line, made) => setPicked((current) => ({ ...current, [line.orderLineId]: made }));
  const ready = chosen.length > 0 && isReasonComplete(reason);
  const approved = !needsApproval || (approverId && /^\d{4,6}$/.test(pin));

  const sentence = preview.data && [
    `Bill ${preview.data.voidedBillNumber} for ${moneyText(preview.data.voidedBillTotalInPaise)} will be voided.`,
    preview.data.orderCancelled ? 'Nothing is left, so the order will be cancelled.' : `A new bill for ${moneyText(preview.data.newBillTotalInPaise)} will be made.`,
    preview.data.cashToGiveBackInPaise > 0 ? `Give back ${moneyText(preview.data.cashToGiveBackInPaise)} in cash.` : null,
    ...preview.data.refundsOwed.map((refund) => `${moneyText(refund.amountInPaise)} will be owed back on ${refund.methodName}.`),
    preview.data.onlineRefundInPaise > 0 ? `${moneyText(preview.data.onlineRefundInPaise)} paid online goes back to the guest.` : null,
  ].filter(Boolean).join(' ');

  return (
    <Sheet
      title="Cancel an item"
      subtitle="The bill is voided and a new one is made for what is left. The old number stays in the register."
      onCancel={onCancel}
      footer={
        preview.data ? (
          <SheetActions
            onCancel={() => preview.reset()}
            cancelLabel="Back"
            confirmLabel={confirm.isPending ? 'Cancelling…' : 'Cancel and re-bill'}
            danger
            disabled={!approved || confirm.isPending}
            onConfirm={() => confirm.mutate()}
          />
        ) : (
          <SheetActions
            onCancel={onCancel}
            cancelLabel="Keep the bill"
            confirmLabel={preview.isPending ? 'Working it out…' : 'Next'}
            disabled={!ready || preview.isPending}
            onConfirm={() => preview.mutate()}
          />
        )
      }
    >
      {!preview.data ? (
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="type-heading mb-1">Items</legend>
            {bill.lines.map((line) => {
              const isPicked = picked[line.orderLineId] !== undefined;
              return (
                <div key={line.orderLineId} className="rounded-lg border border-line bg-surface p-3">
                  <label className="flex min-h-12 cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={isPicked} onChange={() => toggle(line)} className="size-5 accent-[var(--color-accent)]" />
                    <span className="type-body flex-1">
                      {line.quantity} × {line.itemName}
                      {line.variantName ? ` (${line.variantName})` : ''}
                    </span>
                    <span className="type-num-meta">{moneyText(line.lineTotalInPaise)}</span>
                  </label>
                  {isPicked && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="type-caption text-muted">Was it already made?</span>
                      {[true, false].map((made) => (
                        <button
                          key={String(made)}
                          type="button"
                          aria-pressed={picked[line.orderLineId] === made}
                          onClick={() => setMade(line, made)}
                          className={[
                            'min-h-12 rounded-lg border px-4 type-label',
                            picked[line.orderLineId] === made ? 'border-2 border-ink bg-sunken' : 'border-line',
                          ].join(' ')}
                        >
                          {made ? 'Yes' : 'No'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>
          <ReasonPicker reasons={LINE_CANCEL_REASONS} value={reason} onChange={setReason} />
          {preview.isError && <p className="type-body text-alert">{errorMessage(preview.error)}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-line border-l-[3px] border-l-alert bg-surface p-3">
            <p className="type-body text-ink">{sentence}</p>
          </div>
          {needsApproval && (
            <fieldset className="flex flex-col gap-3">
              <legend className="type-heading mb-1">A manager approves</legend>
              <div className="flex flex-wrap gap-2">
                {(approvers.data ?? []).map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    aria-pressed={approverId === person.id}
                    onClick={() => setApproverId(person.id)}
                    className={[
                      'min-h-12 rounded-lg border px-4 type-label',
                      approverId === person.id ? 'border-2 border-ink bg-sunken' : 'border-line bg-surface',
                    ].join(' ')}
                  >
                    {person.name}
                  </button>
                ))}
              </div>
              <Input
                label="Their PIN"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              />
            </fieldset>
          )}
          {confirm.isError && <p className="type-body text-alert">{errorMessage(confirm.error)}</p>}
        </div>
      )}
    </Sheet>
  );
}
