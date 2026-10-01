import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import DataTable from '../../components/charts/DataTable.jsx';
import RankedBars from '../../components/charts/RankedBars.jsx';
import { StatTile } from '../../components/charts/StatTile.jsx';
import { getDiscounts } from '../../api/reports.js';
import { formatBasisPoints } from '../../utils/formatMoney.js';
import { formatDateIst } from '../../utils/formatDate.js';
import { errorMessage } from './errorCopy.js';
import { formatPaise } from './formatReport.js';
import ReportShell, { lastNDays, ReportSection } from './ReportShell.jsx';

/**
 * How much was given away, and by whom.
 *
 * "By whom" is the point. BUILD-PLAN calls the audit trail the feature that
 * sells this product to an owner losing money to a dishonest cashier, and this
 * is the report where that becomes a number with a name against it.
 *
 * The figures come from the bills, not from the audit log: the bill is the
 * authoritative record of what was actually charged, the audit log is the
 * trail of who did it, and if the two ever disagree the bill is right.
 */
export default function DiscountsPage() {
  const [range, setRange] = useState(() => lastNDays(29));
  const [page, setPage] = useState(1);
  const enabled = Boolean(range.from && range.to && range.from <= range.to);

  const query = useQuery({
    queryKey: ['reports', 'discounts', range, page],
    queryFn: () => getDiscounts({ ...range, page, limit: 20 }),
    enabled,
    placeholderData: (previous) => previous,
  });

  const data = query.data;
  const paging = data?.recentPaging;
  const pageCount = paging ? Math.max(1, Math.ceil(paging.total / paging.limit)) : 1;

  return (
    <ReportShell
      title="Discounts"
      range={range}
      onRangeChange={(next) => {
        setRange(next);
        setPage(1);
      }}
    >
      {query.isError && <p className="mb-6 text-[15px] text-mirch">{errorMessage(query.error)}</p>}

      {data && (
        <div className={query.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile label="Total given away" value={formatPaise(data.totalDiscountInPaise)} />
            <StatTile label="Bills discounted" value={data.discountedBillCount} />
            <StatTile
              label="Share of those bills"
              value={formatBasisPoints(data.discountAsPercentOfSubtotalBps)}
              hint="Of the subtotal of the bills that were discounted"
            />
          </div>

          <ReportSection
            title="By person"
            description="Who applied the discount, from the bill itself. Only an owner or a manager can discount at all."
          >
            <RankedBars
              data={data.byUser}
              labelKey="name"
              valueKey="amountInPaise"
              formatValue={formatPaise}
              secondaryKey="billCount"
              formatSecondary={(count) => `${count} bills`}
              emptyMessage="Nothing was discounted in this range."
            />
          </ReportSection>

          <ReportSection
            title="Every discount"
            description="Newest first. Each one carries the reason the person typed at the time."
          >
            <DataTable
              caption="Discounts applied"
              columns={[
                { key: 'billNumber', header: 'Bill' },
                { key: 'businessDate', header: 'Business day' },
                { key: 'appliedBy', header: 'Applied by' },
                { key: 'reason', header: 'Reason' },
                {
                  key: 'appliedAt',
                  header: 'When',
                  render: (row) => formatDateIst(row.appliedAt),
                },
                {
                  key: 'amountInPaise',
                  header: 'Amount',
                  numeric: true,
                  render: (row) => formatPaise(row.amountInPaise),
                },
              ]}
              rows={(data.recent ?? []).map((row) => ({ ...row, key: row.billId }))}
              emptyMessage="Nothing was discounted in this range."
            />

            {pageCount > 1 && (
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                  className="h-11 rounded-xl border-2 border-steel/40 px-4 text-[13px] font-medium disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  Previous
                </button>
                <span className="font-mono text-[13px] tabular-nums text-steel">
                  {page} of {pageCount}
                </span>
                <button
                  type="button"
                  disabled={page >= pageCount}
                  onClick={() => setPage((current) => current + 1)}
                  className="h-11 rounded-xl border-2 border-steel/40 px-4 text-[13px] font-medium disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  Next
                </button>
              </div>
            )}
          </ReportSection>
        </div>
      )}
    </ReportShell>
  );
}
