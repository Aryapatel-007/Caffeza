import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { reopenBill } from '../../api/bills.js';
import { listApprovers } from '../../api/users.js';
import Input from '../../components/ui/Input.jsx';
import Sheet, { SheetActions } from '../../components/ui/Sheet.jsx';
import { moneyText } from '../../components/ui/Money.jsx';

import { errorMessage } from './errorCopy.js';

/**
 * Add items after the bill is made. P26, API-CONTRACT M3 section 16.7.
 *
 * The bill is voided and the order opens again for the new dishes. When the
 * table is billed again, what was already paid moves onto the new bill. A
 * cashier or captain asks a manager to pick their name and type their PIN.
 */
export default function AddItemsPanel({ bill, needsApproval, onCancel, onDone }) {
  const [approverId, setApproverId] = useState('');
  const [pin, setPin] = useState('');
  const approvers = useQuery({ queryKey: ['approvers'], queryFn: listApprovers, enabled: needsApproval });
  const reopen = useMutation({
    mutationFn: () => reopenBill(bill.id, needsApproval ? { approval: { approverId, pin } } : {}),
    onSuccess: onDone,
  });
  const approved = !needsApproval || (approverId && /^\d{4,6}$/.test(pin));
  const paid = bill.amountPaidInPaise ?? 0;

  return (
    <Sheet
      title="Add items"
      subtitle="The bill is voided and the order opens again. The old number stays in the register."
      onCancel={onCancel}
      footer={
        <SheetActions
          onCancel={onCancel}
          cancelLabel="Keep the bill"
          confirmLabel={reopen.isPending ? 'Opening the order…' : 'Void and add items'}
          disabled={!approved || reopen.isPending}
          onConfirm={() => reopen.mutate()}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-line border-l-[3px] border-l-open bg-surface p-3">
          <p className="type-body text-ink">
            Bill {bill.billNumber} for {moneyText(bill.grandTotalInPaise)} will be voided. Add the dishes on the order and send them to the
            kitchen. Bill the table again once they are served.
            {paid > 0 ? ` The ${moneyText(paid)} already paid moves onto the new bill.` : ''}
          </p>
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
        {reopen.isError && <p className="type-body text-alert">{errorMessage(reopen.error)}</p>}
      </div>
    </Sheet>
  );
}
