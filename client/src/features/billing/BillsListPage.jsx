import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { listBills } from '../../api/bills.js';
import { businessDateToday } from '../../utils/formatDate.js';
import { formatPaise } from '../../utils/formatMoney.js';
import BillStatusBadge from './BillStatusBadge.jsx';
import { errorMessage } from './errorCopy.js';
import { placeLabel } from '../orders/orderLabel.js';

/**
 * The day's bills, with a running total.
 *
 * OWNER, MANAGER, CASHIER, matching GET /bills on the server. The running
 * total covers the WHOLE matched business-day range, not just this page — the
 * server's `meta.totals`, not a client-side sum of what happens to be on
 * screen, per docs/API-CONTRACT.md section 14.3.
 */
export default function BillsListPage() {
  const [from, setFrom] = useState(businessDateToday);
  const [to, setTo] = useState(businessDateToday);
  const [status, setStatus] = useState('');
  const [includeVoided, setIncludeVoided] = useState(false);

  const query = useQuery({
    queryKey: ['bills', { from, to, status, includeVoided }],
    queryFn: () => listBills({ from, to, status: status || undefined, includeVoided }),
  });

  const bills = query.data?.data ?? [];
  const totals = query.data?.meta?.totals ?? {
    grandTotalInPaise: 0,
    amountPaidInPaise: 0,
    billCount: 0,
    voidedCount: 0,
  };

  return (
    <main className="min-h-full bg-paper">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-paper px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold leading-7">Bills</h1>
          <Link
            to="/floor"
            className="flex h-11 items-center rounded-xl px-3 text-[13px] font-medium text-steel hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            Floor
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* The running total. The number a cashier or owner opens this screen
            for, so it is the largest thing in this block. */}
        <div className="mb-6 rounded-xl border border-black/5 shadow-card px-4 py-4">
          <p className="text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
            {from === to ? from : `${from} – ${to}`}
          </p>
          <p className="mt-1 font-mono text-[36px] font-semibold leading-none">
            {formatPaise(totals.grandTotalInPaise)}
          </p>
          <p className="mt-2 text-[13px] leading-[18px] text-steel">
            <span className="font-mono text-ink">{totals.billCount}</span> bill
            {totals.billCount === 1 ? '' : 's'}
            {totals.voidedCount > 0 && (
              <>
                {' '}
                · <span className="font-mono text-ink">{totals.voidedCount}</span> voided (not
                counted)
              </>
            )}
          </p>
        </div>

        {/* Filters. Plain date inputs, not a keypad: a date is not a money or
            quantity entry. */}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-steel">
              From
            </span>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-11 rounded-xl border-2 border-steel/40 bg-paper px-3 text-[15px] focus:border-ink focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-steel">To</span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-11 rounded-xl border-2 border-steel/40 bg-paper px-3 text-[15px] focus:border-ink focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-steel">
              Status
            </span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-11 rounded-xl border-2 border-steel/40 bg-paper px-3 text-[15px] focus:border-ink focus:outline-none"
            >
              <option value="">All</option>
              <option value="UNPAID">Unpaid</option>
              <option value="PAID">Paid</option>
              <option value="ON_ACCOUNT">On Hold</option>
            </select>
          </label>
          <label className="flex h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={includeVoided}
              onChange={(event) => setIncludeVoided(event.target.checked)}
              className="size-4 accent-[var(--color-ink)]"
            />
            <span className="text-[13px] leading-[18px]">Include voided</span>
          </label>
        </div>

        {query.isPending && <Spinner label="Loading bills" />}
        {query.isError && <ErrorMessage error={{ message: errorMessage(query.error) }} />}

        {query.isSuccess && bills.length === 0 && (
          <p className="rounded-xl border-2 border-dashed border-steel/40 px-4 py-8 text-center text-[15px] text-steel">
            No bills in this range.
          </p>
        )}

        {bills.length > 0 && (
          <ul className="divide-y divide-steel/15 border-y border-black/5/10">
            {bills.map((bill) => (
              <li key={bill.id}>
                <Link
                  to={`/bills/${bill.id}`}
                  className="flex items-center justify-between gap-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <div>
                    <p className="font-mono text-[13px] leading-[18px]">{bill.billNumber}</p>
                    <p className="text-[13px] leading-[18px] text-steel">
                      {placeLabel(bill)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <BillStatusBadge bill={bill} />
                    <span className="font-mono text-[18px] font-semibold leading-6">
                      {formatPaise(bill.grandTotalInPaise)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
