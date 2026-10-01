import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { getBill, listBills } from '../../api/bills.js';
import { businessDateToday, formatTimeIst } from '../../utils/formatDate.js';
import { formatBasisPoints, formatPaise } from '../../utils/formatMoney.js';
import BillStatusBadge from './BillStatusBadge.jsx';
import { errorMessage } from './errorCopy.js';
import { paymentMethodName } from './paymentMethodsForBill.js';
import { placeLabel } from '../orders/orderLabel.js';

const PAGE_SIZE = 50;

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'ON_ACCOUNT', label: 'On Hold' },
];

/**
 * The register ledger: the day's bills in a table, with the selected bill
 * beside it.
 *
 * OWNER, MANAGER, CASHIER, matching GET /bills on the server. The figures at
 * the top are the server's `meta.totals` over the whole business-date range,
 * not a sum of whatever page is on screen (API-CONTRACT section 14.3), so they
 * stay right however the table is filtered or paged. The unpaid count is the
 * `meta.total` of the same list asked for unpaid bills only.
 *
 * The search box narrows the rows on this page only, by bill number, table
 * and captain. It is a convenience for finding one bill, not a report.
 */
export default function BillsListPage() {
  const [from, setFrom] = useState(businessDateToday);
  const [to, setTo] = useState(businessDateToday);
  const [status, setStatus] = useState('');
  const [includeVoided, setIncludeVoided] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const query = useQuery({
    queryKey: ['bills', { from, to, status, includeVoided, page }],
    queryFn: () =>
      listBills({ from, to, status: status || undefined, includeVoided, page, limit: PAGE_SIZE }),
  });

  const unpaid = useQuery({
    queryKey: ['bills', { from, to, status: 'UNPAID', count: true }],
    queryFn: () => listBills({ from, to, status: 'UNPAID', limit: 1 }),
  });

  const bills = query.data?.data ?? [];
  const meta = query.data?.meta ?? { page: 1, limit: PAGE_SIZE, total: 0 };
  const totals = meta.totals ?? {
    grandTotalInPaise: 0,
    amountPaidInPaise: 0,
    billCount: 0,
    voidedCount: 0,
  };
  const unpaidCount = unpaid.data?.meta?.total ?? 0;

  const needle = search.trim().toLowerCase();
  const rows = needle
    ? bills.filter((bill) =>
        [bill.billNumber, placeLabel(bill), bill.captainName]
          .filter(Boolean)
          .some((text) => text.toLowerCase().includes(needle)),
      )
    : bills;

  const selected = rows.find((bill) => bill.id === selectedId) ?? rows[0] ?? null;
  const lastPage = Math.max(1, Math.ceil(meta.total / (meta.limit || PAGE_SIZE)));
  const rangeLabel = from === to ? from : `${from} – ${to}`;

  const resetPage = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  return (
    <main className="min-h-full bg-paper px-4 py-6 lg:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Bill total" hint={`${rangeLabel} · voided left out`}>
            <span className="font-mono text-[28px] font-bold leading-9">
              {formatPaise(totals.grandTotalInPaise)}
            </span>
          </Stat>
          <Stat label="Bills" hint="Issued and not voided">
            <span className="font-mono text-[28px] font-bold leading-9">{totals.billCount}</span>
          </Stat>
          <Stat label="Unpaid bills" hint="Waiting for payment">
            <span className="font-mono text-[28px] font-bold leading-9 text-ink">
              {unpaidCount}
            </span>
            {unpaidCount > 0 && (
              <button
                type="button"
                onClick={() => resetPage(setStatus)('UNPAID')}
                className="ml-3 rounded-full bg-chana-soft px-2.5 py-0.5 text-[12px] font-semibold hover:bg-chana/30"
              >
                Show them
              </button>
            )}
          </Stat>
          <Stat label="Voided" hint="Kept in the invoice register">
            <span
              className={[
                'font-mono text-[28px] font-bold leading-9',
                totals.voidedCount > 0 ? 'text-mirch' : '',
              ].join(' ')}
            >
              {totals.voidedCount}
            </span>
          </Stat>
        </section>

        <div className="flex flex-col items-start gap-6 lg:flex-row">
          <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-3 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <DateField label="From" value={from} onChange={resetPage(setFrom)} />
                <DateField label="To" value={to} onChange={resetPage(setTo)} />

                <div className="flex items-center gap-1 rounded-full bg-linen-2 p-1" role="group" aria-label="Status">
                  {STATUS_FILTERS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={status === option.value}
                      onClick={() => resetPage(setStatus)(option.value)}
                      className={[
                        'h-9 rounded-full px-4 text-[12px] font-medium transition-colors',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                        status === option.value ? 'bg-ink text-white shadow-card' : 'text-steel hover:text-ink',
                      ].join(' ')}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <label className="flex h-9 items-center gap-2 rounded-full bg-linen-2 px-3">
                  <input
                    type="checkbox"
                    checked={includeVoided}
                    onChange={(event) => resetPage(setIncludeVoided)(event.target.checked)}
                    className="size-4 accent-[var(--color-ink)]"
                  />
                  <span className="text-[12px] font-medium">Include voided</span>
                </label>
              </div>

              <label className="relative block w-full sm:w-64">
                <span className="sr-only">Search this page</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search bill, table, captain"
                  className="h-11 w-full rounded-full bg-linen px-4 text-[13px] placeholder:text-steel focus:bg-white focus:outline-none focus:ring-2 focus:ring-chana"
                />
              </label>
            </div>

            <div className="overflow-hidden rounded-2xl bg-white shadow-card">
              {query.isPending && (
                <div className="p-6">
                  <Spinner label="Loading bills" />
                </div>
              )}
              {query.isError && (
                <div className="p-6">
                  <ErrorMessage error={{ message: errorMessage(query.error) }} />
                </div>
              )}

              {query.isSuccess && rows.length === 0 && (
                <p className="px-4 py-10 text-center text-[15px] text-steel">
                  {needle ? `No bill on this page matches “${search.trim()}”.` : 'No bills in this range.'}
                </p>
              )}

              {rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-linen/70 font-mono text-[11px] uppercase tracking-wider text-steel">
                        <th className="px-4 py-3.5 font-semibold">Invoice number</th>
                        <th className="px-2 py-3.5 font-semibold">Time issued</th>
                        <th className="px-4 py-3.5 font-semibold">Table</th>
                        <th className="hidden px-4 py-3.5 font-semibold xl:table-cell">Captain</th>
                        <th className="hidden px-4 py-3.5 font-semibold xl:table-cell">Paid with</th>
                        <th className="px-2 py-3.5 font-semibold">Status</th>
                        <th className="whitespace-nowrap px-4 py-3.5 text-right font-semibold">Bill total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-linen-3">
                      {rows.map((bill) => {
                        const isSelected = selected?.id === bill.id;
                        const struck = bill.isVoided ? 'line-through text-steel' : '';
                        return (
                          <tr
                            key={bill.id}
                            onClick={() => setSelectedId(bill.id)}
                            className={[
                              'cursor-pointer transition-colors',
                              isSelected ? 'bg-chana-soft' : 'hover:bg-linen',
                              bill.isVoided ? 'opacity-70' : '',
                            ].join(' ')}
                          >
                            <td className="px-4 py-3.5">
                              <button
                                type="button"
                                onClick={() => setSelectedId(bill.id)}
                                aria-pressed={isSelected}
                                className={[
                                  'flex items-center gap-2 whitespace-nowrap font-mono text-[13px] font-bold',
                                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                                  struck,
                                ].join(' ')}
                              >
                                {isSelected && <span aria-hidden className="h-6 w-1.5 rounded-full bg-chana" />}
                                {bill.billNumber}
                              </button>
                            </td>
                            <td className={`whitespace-nowrap px-2 py-3.5 font-mono text-[12px] text-steel ${struck}`}>
                              {bill.billedAt ? formatTimeIst(bill.billedAt) : ''}
                            </td>
                            <td className="px-4 py-3.5">
                              <span className={`inline-flex rounded-full bg-linen-2 px-2.5 py-1 text-[12px] font-medium ${struck}`}>
                                {placeLabel(bill)}
                              </span>
                            </td>
                            <td className={`hidden px-4 py-3.5 text-[13px] xl:table-cell ${struck}`}>
                              {bill.captainName ?? '—'}
                            </td>
                            <td className={`hidden px-4 py-3.5 text-[13px] text-steel xl:table-cell ${struck}`}>
                              {(bill.payments ?? []).map(paymentMethodName).join(', ') || '—'}
                            </td>
                            <td className="px-2 py-3.5">
                              <BillStatusBadge bill={bill} />
                            </td>
                            <td className={`whitespace-nowrap px-4 py-3.5 text-right font-mono text-[15px] font-bold ${struck}`}>
                              {formatPaise(bill.grandTotalInPaise)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 bg-linen/90 px-4 py-3">
                <p className="font-mono text-[13px]">
                  <span className="font-bold">
                    {totals.billCount} bills · {formatPaise(totals.grandTotalInPaise)}
                  </span>
                  <span className="mx-2 text-steel">·</span>
                  <span className="text-steel">Money received {formatPaise(totals.amountPaidInPaise)}</span>
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-steel">
                    Page <span className="font-mono">{page}</span> of <span className="font-mono">{lastPage}</span>
                  </span>
                  <PageButton label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    ‹
                  </PageButton>
                  <PageButton label="Next page" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>
                    ›
                  </PageButton>
                </div>
              </div>
            </div>
          </div>

          {selected && <BillPreview billId={selected.id} />}
        </div>
      </div>
    </main>
  );
}

/** The selected bill, read in full, beside the ledger. Hidden below the lg breakpoint, where a tap opens the bill. */
function BillPreview({ billId }) {
  const bill = useQuery({ queryKey: ['bill', billId], queryFn: () => getBill(billId) });

  return (
    <aside className="sticky top-4 hidden w-[420px] flex-none flex-col overflow-hidden rounded-2xl bg-white shadow-lift lg:flex">
      {bill.isPending && (
        <div className="p-6">
          <Spinner label="Loading the bill" />
        </div>
      )}
      {bill.isError && <p className="p-6 text-[13px] text-mirch">{errorMessage(bill.error)}</p>}
      {bill.data && <PreviewBody bill={bill.data} />}
    </aside>
  );
}

function PreviewBody({ bill }) {
  const outstanding = bill.grandTotalInPaise - bill.amountPaidInPaise;
  const isUnpaid = !bill.isVoided && bill.status === 'UNPAID';

  return (
    <>
      <header className="flex items-start justify-between gap-2 bg-linen p-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-semibold">Bill details</h2>
            <BillStatusBadge bill={bill} />
          </div>
          <p className="mt-1 font-mono text-[12px] text-steel">
            <span className="font-bold text-ink">{bill.billNumber}</span>
            {bill.billedAt && ` · ${formatTimeIst(bill.billedAt)}`} · {placeLabel(bill)}
          </p>
        </div>
      </header>

      {isUnpaid && (
        <p className="bg-chana-soft px-4 py-2.5 text-[12px] font-medium">
          Waiting for payment · <span className="font-mono">{formatPaise(outstanding)}</span> outstanding
        </p>
      )}

      <ul className="flex max-h-[310px] flex-col gap-2 overflow-y-auto p-4">
        {bill.lines.map((line) => (
          <li key={line.orderLineId} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14px] font-medium leading-5">
                {line.itemName}
                {line.variantName ? ` (${line.variantName})` : ''}
              </p>
              <p className="font-mono text-[12px] text-steel">
                {line.quantity} × {formatPaise(line.unitPriceInPaise)}
                {line.addOnNames.length > 0 && ` · + ${line.addOnNames.join(', ')}`}
              </p>
            </div>
            <span className="font-mono text-[14px] font-bold">{formatPaise(line.lineTotalInPaise)}</span>
          </li>
        ))}
      </ul>

      <dl className="flex flex-col gap-1.5 bg-linen p-4 text-[12px]">
        <PreviewRow label="Item total" value={formatPaise(bill.subtotalInPaise)} />
        {bill.discount && (
          <PreviewRow tone="text-patta" label="Discount" value={`− ${formatPaise(bill.discount.amountInPaise)}`} />
        )}
        {bill.taxBreakdown.map((slab) => (
          <PreviewRow
            key={slab.taxRateBps}
            label={`GST @ ${formatBasisPoints(slab.taxRateBps)}`}
            value={formatPaise(slab.cgstInPaise + slab.sgstInPaise)}
          />
        ))}
        {bill.roundOffInPaise !== 0 && <PreviewRow label="Round-off" value={formatPaise(bill.roundOffInPaise)} />}
        <div className="mt-1 flex items-baseline justify-between">
          <dt className="text-[16px] font-semibold">Bill total</dt>
          <dd className="font-mono text-[28px] font-bold">{formatPaise(bill.grandTotalInPaise)}</dd>
        </div>
      </dl>

      {bill.captainName && (
        <p className="bg-linen-3/60 px-4 py-2.5 text-[12px] text-steel">
          Captain: <span className="font-semibold text-ink">{bill.captainName}</span>
          {bill.guestCount != null && ` · ${bill.guestCount} covers`}
        </p>
      )}

      <div className="flex flex-col gap-2 p-4">
        <Link
          to={`/bills/${bill.id}`}
          className="flex h-14 items-center justify-between rounded-full bg-chana px-6 text-[15px] font-bold text-ink shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <span>{isUnpaid ? 'Take payment' : 'Open bill'}</span>
          <span className="font-mono">{isUnpaid ? `${formatPaise(outstanding)} →` : '→'}</span>
        </Link>
        <Link
          to={`/bills/${bill.id}/receipt`}
          className="flex h-11 items-center justify-center rounded-full text-[13px] font-semibold hover:bg-linen focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Receipt preview and print
        </Link>
      </div>
    </>
  );
}

function PreviewRow({ label, value, tone = 'text-steel' }) {
  return (
    <div className={`flex justify-between ${tone}`}>
      <dt>{label}</dt>
      <dd className="font-mono text-ink">{value}</dd>
    </div>
  );
}

function Stat({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-card">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-steel">{label}</span>
      <div className="flex items-baseline">{children}</div>
      <span className="text-[12px] text-steel">{hint}</span>
    </div>
  );
}

function DateField({ label, value, onChange }) {
  return (
    <label className="flex h-11 items-center gap-2 rounded-full bg-linen px-4">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-steel">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent font-mono text-[13px] focus:outline-none"
      />
    </label>
  );
}

function PageButton({ label, disabled, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-lg bg-linen-2 text-[18px] hover:bg-linen-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}
