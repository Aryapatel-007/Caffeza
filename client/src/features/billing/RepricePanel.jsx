import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';

import { repriceBill } from '../../api/bills.js';
import Money, { moneyText } from '../../components/ui/Money.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { formatBasisPoints } from '../../utils/formatMoney.js';
import { LABELS } from '../i18n/labels.js';
import DiscountPanel from './DiscountPanel.jsx';
import { discountReasonLabel } from './discountReasons.js';
import { errorMessage } from './errorCopy.js';

/**
 * P66. Change discount or GST on a bill already made: owner and manager.
 *
 * An invoice is never edited, so the server voids it and bills again, carrying
 * the payments (POST /bills/:billId/reprice). The new total and what goes back
 * to the guest are the server's preview, read again on every change; nothing
 * is written until Make the new bill.
 */
export default function RepricePanel({ bill, onCancel, onDone }) {
  // KEEP the discount, NONE to take it off, or a new one chosen in the discount panel.
  const [choice, setChoice] = useState('KEEP');
  const [newDiscount, setNewDiscount] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const [gstIncluded, setGstIncluded] = useState(bill.pricesIncludeGst === true);
  const [reason, setReason] = useState('');

  // A new discount not chosen yet changes nothing.
  const discount = choice === 'KEEP' ? undefined : choice === 'NONE' ? null : (newDiscount ?? undefined);
  const pricesIncludeGst = gstIncluded === (bill.pricesIncludeGst === true) ? undefined : gstIncluded;
  const changed = discount !== undefined || pricesIncludeGst !== undefined;

  const previewQuery = useQuery({
    queryKey: ['reprice-preview', bill.id, discount, pricesIncludeGst],
    queryFn: () => repriceBill(bill.id, { discount, pricesIncludeGst, reason: 'Preview', preview: true }),
    enabled: changed,
    placeholderData: keepPreviousData,
  });
  const preview = changed ? previewQuery.data : null;

  const save = useMutation({
    mutationFn: () => repriceBill(bill.id, { discount, pricesIncludeGst, reason: reason.trim() }),
    onSuccess: onDone,
  });

  const ready = changed && reason.trim().length > 0 && !save.isPending;

  return (
    <Sheet
      title="Change discount or GST"
      subtitle={`Bill ${bill.billNumber}`}
      wide
      onCancel={onCancel}
      footer={
        <div className="flex flex-col gap-2">
          {save.isError && <p className="type-caption text-alert">{errorMessage(save.error)}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="min-h-14 flex-1 rounded-lg border border-ink bg-surface type-button hover:bg-sunken">
              {LABELS.cancel}
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => save.mutate()}
              className="min-h-14 flex-[2] rounded-lg bg-accent type-button text-on-accent disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Make the new bill'}
            </button>
          </div>
        </div>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 type-heading">Discount</legend>
        {[
          ['KEEP', bill.discount ? `Keep ${discountWords(bill.discount)}` : 'Keep no discount'],
          ...(bill.discount ? [['NONE', 'Take the discount off']] : []),
          ['NEW', newDiscount ? `New: ${discountWords(newDiscount)}` : 'A new discount'],
        ].map(([key, label]) => (
          <label key={key} className="flex min-h-12 items-center gap-3 rounded-lg border border-line px-3 hover:bg-sunken">
            <input
              type="radio"
              name="discount-choice"
              checked={choice === key}
              onChange={() => {
                setChoice(key);
                if (key === 'NEW' && !newDiscount) setChoosing(true);
              }}
            />
            <span className="type-body">{label}</span>
          </label>
        ))}
        {choice === 'NEW' && (
          <button type="button" onClick={() => setChoosing(true)} className="type-label min-h-12 self-start rounded-lg px-3 text-accent hover:bg-sunken">
            {newDiscount ? 'Change the new discount' : 'Choose the discount'}
          </button>
        )}
      </fieldset>

      <label className="mt-4 flex min-h-12 items-center gap-3 rounded-lg border border-line px-3 hover:bg-sunken">
        <input type="checkbox" checked={gstIncluded} onChange={(event) => setGstIncluded(event.target.checked)} />
        <span className="type-body">Price includes GST</span>
      </label>
      <p className="type-caption mt-1 text-muted">
        Ticked, the guest pays the menu price and the GST is worked out inside it. It is still a tax invoice.
      </p>

      <label className="mt-4 block">
        <span className="mb-1 block type-label text-muted">Reason, required</span>
        <textarea
          aria-label="Reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={200}
          placeholder="Owner's guest"
          className="w-full rounded-lg border border-muted bg-surface px-3 py-2 type-body placeholder:text-muted"
        />
      </label>

      <div aria-live="polite" className="mt-4 rounded-lg bg-sunken p-3">
        {!changed ? (
          <p className="type-body text-muted">Choose a discount or change the GST tick.</p>
        ) : previewQuery.isError ? (
          <p className="type-body text-alert">{errorMessage(previewQuery.error)}</p>
        ) : preview ? (
          <>
            <p className="type-body">
              New bill total <Money paise={preview.newBillTotalInPaise} /> (was <Money paise={preview.voidedBillTotalInPaise} />)
            </p>
            {preview.cashToGiveBackInPaise > 0 && <p className="type-body mt-1">Give back {moneyText(preview.cashToGiveBackInPaise)} in cash.</p>}
            {preview.refundsOwed.map((refund) => (
              <p key={refund.methodName} className="type-body mt-1">
                {moneyText(refund.amountInPaise)} is owed back on {refund.methodName}.
              </p>
            ))}
            {preview.newBillTotalInPaise > preview.voidedBillTotalInPaise && (
              <p className="type-body mt-1">Collect {moneyText(preview.newBillTotalInPaise - preview.voidedBillTotalInPaise)} more.</p>
            )}
            <p className="type-caption mt-2 text-muted">Bill {bill.billNumber} is voided and a new bill is made. The old number stays in the invoice register.</p>
          </>
        ) : (
          <p className="type-body text-muted">Working out the new total…</p>
        )}
      </div>

      {choosing && (
        <DiscountPanel
          billNumber={bill.billNumber}
          subtotalInPaise={bill.subtotalInPaise}
          isBusy={false}
          error={null}
          onCancel={() => {
            setChoosing(false);
            if (!newDiscount) setChoice('KEEP');
          }}
          onConfirm={(body) => {
            setNewDiscount(body);
            setChoice('NEW');
            setChoosing(false);
          }}
        />
      )}
    </Sheet>
  );
}

/** "10% · Regular guest", or "₹50.00 · Other: birthday". A stored discount or a new one. */
function discountWords(discount) {
  const size = discount.kind === 'PERCENT' ? formatBasisPoints(discount.rateBps) : moneyText(discount.valueInPaise ?? discount.amountInPaise);
  const label = discountReasonLabel(discount.reasonCode);
  const note = discount.note ?? discount.reason ?? null;
  return `${size} · ${note ? `${label}: ${note}` : label}`;
}
