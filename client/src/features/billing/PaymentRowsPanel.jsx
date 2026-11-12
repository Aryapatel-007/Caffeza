import { useState } from 'react';

import Money from '../../components/ui/Money.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { paiseToInput, parseRupeesToPaise } from '../../utils/formatMoney.js';
import { LABELS } from '../i18n/labels.js';

const MAX_ROWS = 6;
let nextKey = 1;
const newRow = (method, amount = '', reference = '') => ({ key: nextKey++, method, amount, reference });

/**
 * P66. Rows of method and amount, for a manager's Change payments on a paid
 * bill (Cash ₹795 becomes UPI ₹400 and Cash ₹395). The last row fills itself
 * with what is left until it is typed, shown "(rest)". Part payment uses
 * PartPaymentPanel, Arya's, which records its parts through the same split.
 *
 * `targetInPaise` is the outstanding for a part payment, or what was paid for
 * Change payments, where `exact` asks the rows to add up to it. Nothing here
 * records anything: `onConfirm(rows, reason)` hands the rows to the server,
 * which decides.
 */
export default function PaymentRowsPanel({
  title,
  subtitle = null,
  methods,
  targetInPaise,
  initialRows = null,
  otherModes = [],
  exact = false,
  askReason = false,
  minRows = 2,
  confirmLabel,
  isBusy,
  error,
  onCancel,
  onConfirm,
}) {
  const [rows, setRows] = useState(() =>
    initialRows?.length
      ? initialRows.map((row) => newRow(row.method, paiseToInput(row.amountInPaise), row.reference ?? ''))
      : [newRow(methods[0]?.code ?? ''), newRow(methods[1]?.code ?? methods[0]?.code ?? '')],
  );
  const [reason, setReason] = useState('');

  const typedOf = (row) => (row.amount === '' ? null : parseRupeesToPaise(row.amount));
  const othersInPaise = rows.slice(0, -1).reduce((sum, row) => sum + (typedOf(row) ?? 0), 0);
  const restInPaise = Math.max(targetInPaise - othersInPaise, 0);
  const amountOf = (row, index) => (index === rows.length - 1 && row.amount === '' ? restInPaise : typedOf(row));
  const amounts = rows.map(amountOf);
  const totalInPaise = amounts.reduce((sum, amount) => sum + (amount ?? 0), 0);
  const leftInPaise = targetInPaise - totalInPaise;

  const methodOf = (code) => methods.find((method) => method.code === code);
  const used = new Set(rows.map((row) => row.method));
  const problem =
    rows.length < minRows
      ? `Add at least ${minRows} methods.`
      : used.size !== rows.length
        ? 'Use each method once.'
        : amounts.some((amount) => amount === null || amount <= 0)
          ? 'Every row needs an amount.'
          : rows.some((row) => row.method === 'OTHER' && !row.reference.trim())
            ? 'Say how Other was paid.'
            : leftInPaise < 0
              ? 'The rows are more than the bill.'
              : exact && leftInPaise !== 0
                ? 'The rows must add up to what was paid.'
                : askReason && !reason.trim()
                  ? 'Give a reason.'
                  : null;

  const update = (key, patch) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const addRow = () => {
    const free = methods.find((method) => !used.has(method.code));
    // The row that was "the rest" keeps that amount, typed, so the new row starts as the rest.
    setRows((current) => [...current.map((row, index) => (index === current.length - 1 && row.amount === '' ? { ...row, amount: paiseToInput(restInPaise) } : row)), newRow(free?.code ?? '')]);
  };

  return (
    <Sheet
      title={title}
      subtitle={subtitle}
      wide
      onCancel={onCancel}
      footer={
        <div className="flex flex-col gap-2">
          {(problem || error) && <p className="type-caption text-alert">{error ?? problem}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="min-h-14 flex-1 rounded-lg border border-ink bg-surface type-button hover:bg-sunken">
              {LABELS.cancel}
            </button>
            <button
              type="button"
              disabled={Boolean(problem) || isBusy}
              onClick={() =>
                onConfirm(
                  rows.map((row, index) => ({ method: row.method, amountInPaise: amounts[index], reference: row.reference.trim() || null })),
                  reason.trim(),
                )
              }
              className="min-h-14 flex-[2] rounded-lg bg-accent type-button text-on-accent disabled:opacity-50"
            >
              {isBusy ? 'Saving…' : confirmLabel}
            </button>
          </div>
        </div>
      }
    >
      <ul className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const isRest = index === rows.length - 1 && row.amount === '';
          return (
            <li key={row.key} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[8rem] flex-1">
                  <span className="mb-1 block type-label text-muted">Method</span>
                  <select
                    aria-label={`Method ${index + 1}`}
                    value={row.method}
                    onChange={(event) => update(row.key, { method: event.target.value, reference: '' })}
                    className="min-h-12 w-full rounded-lg border border-muted bg-surface px-3 type-body"
                  >
                    {methods.map((method) => (
                      <option key={method.code} value={method.code}>
                        {method.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-36">
                  <span className="mb-1 block type-label text-muted">Amount {isRest ? '(rest)' : ''}</span>
                  <input
                    aria-label={`Amount ${index + 1}`}
                    inputMode="decimal"
                    value={isRest ? '' : row.amount}
                    placeholder={isRest ? paiseToInput(restInPaise) : '0.00'}
                    onChange={(event) => update(row.key, { amount: event.target.value.replace(/[^0-9.]/g, '') })}
                    className="min-h-12 w-full rounded-lg border border-muted bg-surface px-3 type-num placeholder:text-ink"
                  />
                </label>
                {rows.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove ${methodOf(row.method)?.name ?? 'row'}`}
                    onClick={() => setRows((current) => current.filter((candidate) => candidate.key !== row.key))}
                    className="min-h-12 min-w-12 rounded-lg text-muted hover:bg-sunken hover:text-ink"
                  >
                    ✕
                  </button>
                )}
              </div>
              {row.method === 'OTHER' ? (
                <label className="mt-2 block">
                  <span className="mb-1 block type-label text-muted">Mode of payment</span>
                  <input
                    aria-label={`Mode of payment ${index + 1}`}
                    list="other-modes"
                    value={row.reference}
                    maxLength={100}
                    onChange={(event) => update(row.key, { reference: event.target.value })}
                    placeholder="For example Cheque"
                    className="min-h-12 w-full rounded-lg border border-muted bg-surface px-3 type-body"
                  />
                </label>
              ) : (
                row.method !== 'CASH' && (
                  <input
                    aria-label={`Reference ${index + 1}`}
                    value={row.reference}
                    maxLength={100}
                    onChange={(event) => update(row.key, { reference: event.target.value })}
                    placeholder="Reference (optional)"
                    className="mt-2 min-h-12 w-full rounded-lg border border-muted bg-surface px-3 type-body"
                  />
                )
              )}
            </li>
          );
        })}
      </ul>
      <datalist id="other-modes">
        {otherModes.map((mode) => (
          <option key={mode} value={mode} />
        ))}
      </datalist>

      {rows.length < Math.min(MAX_ROWS, methods.length) && (
        <button type="button" onClick={addRow} className="type-label mt-3 min-h-12 rounded-lg px-3 text-accent hover:bg-sunken">
          + Add another method
        </button>
      )}

      <p className="type-body mt-4 flex flex-wrap gap-x-4 border-t border-line pt-3">
        <span>
          Total <Money paise={totalInPaise} />
        </span>
        <span className={leftInPaise < 0 ? 'text-alert' : 'text-muted'}>
          Left <Money paise={leftInPaise} />
        </span>
      </p>
      {!exact && leftInPaise > 0 && <p className="type-caption mt-1 text-muted">The rest stays outstanding for another method.</p>}

      {askReason && (
        <label className="mt-4 block">
          <span className="mb-1 block type-label text-muted">Reason, required</span>
          <textarea
            aria-label="Reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            maxLength={200}
            placeholder="Guest paid half by UPI, not all cash"
            className="w-full rounded-lg border border-muted bg-surface px-3 py-2 type-body placeholder:text-muted"
          />
        </label>
      )}
    </Sheet>
  );
}
