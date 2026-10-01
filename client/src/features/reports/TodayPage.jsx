import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { HeroFigure, StatTile } from '../../components/charts/StatTile.jsx';
import RankedBars from '../../components/charts/RankedBars.jsx';
import { getDashboard } from '../../api/reports.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { BASE_UNIT_SHORT_LABELS } from '../../utils/units.js';
import { errorMessage } from './errorCopy.js';
import { formatPaise } from './formatReport.js';
import ReportShell, { ReportSection } from './ReportShell.jsx';

/** The same three-state badge M4's stock list uses. Icon, colour and word together. */
const STOCK_FACES = {
  IN_STOCK: { icon: '✓', label: 'IN STOCK', classes: 'border-patta bg-patta-tint text-ink' },
  LOW: { icon: '!', label: 'LOW', classes: 'border-chana bg-chana/15 text-ink' },
  OUT: { icon: '✕', label: 'OUT', classes: 'border-mirch text-mirch' },
};

/**
 * The screen an owner opens every morning. Today's business day only.
 *
 * No date filter, deliberately: this is "today", the server decides which day
 * that is from the restaurant's own business-day boundary, and a date picker
 * here would let two people look at different days while both believing they
 * are looking at the same screen. Every other report takes a range.
 *
 * One hero figure -- the day's sales -- and everything else quieter than it.
 */
export default function TodayPage() {
  const { features } = useAuth();
  const inventoryOn = features?.inventory !== false;

  const query = useQuery({
    queryKey: ['reports', 'dashboard'],
    queryFn: getDashboard,
    // A dashboard left open on a back-office screen should not go stale
    // through a whole service.
    refetchInterval: 60_000,
  });

  const data = query.data;

  return (
    <ReportShell title="Today">
      {query.isPending && <p className="text-[15px] text-steel">Loading today…</p>}
      {query.isError && <p className="text-[15px] text-mirch">{errorMessage(query.error)}</p>}

      {data && (
        // Held at reduced opacity while refetching rather than replaced by a
        // skeleton, so the numbers never flash or jump.
        <div className={query.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
            <HeroFigure
              label="Sales today"
              value={formatPaise(data.sales.grossSalesInPaise)}
              hint={`Business day ${data.businessDate}. This is what was billed, not what has been collected.`}
            />
          </div>

          <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Bills" value={data.sales.billCount} />
            <StatTile label="Average bill" value={formatPaise(data.sales.averageBillInPaise)} />
            <StatTile
              label="Open orders"
              value={data.openOrders.count}
              hint={`${formatPaise(data.openOrders.runningValueInPaise)} on the floor`}
            />
            <StatTile
              label="Unpaid bills"
              value={data.unpaidBills.count}
              hint={
                data.unpaidBills.count > 0
                  ? `${formatPaise(data.unpaidBills.amountInPaise)} outstanding`
                  : 'Everything settled'
              }
            />
            <StatTile label="Tax collected" value={formatPaise(data.sales.totalTaxInPaise)} />
            <StatTile label="Discount given" value={formatPaise(data.sales.totalDiscountInPaise)} />
            {/* Null when attendance is switched off (P02). Zero would be a claim. */}
            {data.staffOnShift !== null && (
              <StatTile label="Staff on shift" value={data.staffOnShift} />
            )}
          </div>

          <ReportSection
            title="Top items today"
            description="By quantity sold. Cancelled lines never reach a bill, so they are not counted."
          >
            <RankedBars
              data={data.topItems}
              labelKey="itemName"
              valueKey="quantity"
              formatValue={(value) => `${value} sold`}
              secondaryKey="revenueInPaise"
              formatSecondary={formatPaise}
              emptyMessage="Nothing sold yet today."
            />
          </ReportSection>

          {inventoryOn && (
          <ReportSection
            title="Running low"
            description="Ingredients at or below their own threshold. Worst first."
          >
            {data.lowStock.length === 0 ? (
              <p className="rounded-[10px] border-2 border-dashed border-steel/40 px-4 py-8 text-center text-[13px] text-steel">
                Nothing is running low.
              </p>
            ) : (
              <ul className="divide-y divide-steel/15 border-y-2 border-ink/10">
                {data.lowStock.map((row) => (
                  <li key={row.ingredientId} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="text-[14px] leading-[20px]">{row.name}</span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-[13px] tabular-nums text-steel">
                        {row.currentQtyInBase} / {row.lowStockThresholdInBase}{' '}
                        {BASE_UNIT_SHORT_LABELS[row.baseUnit] ?? ''}
                      </span>
                      <StatusBadge
                        state={row.currentQtyInBase <= 0 ? 'OUT' : 'LOW'}
                        faces={STOCK_FACES}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              to="/inventory"
              className="mt-3 inline-flex h-11 items-center rounded-[10px] border-2 border-ink px-4 text-[13px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Open stock
            </Link>
          </ReportSection>
          )}
        </div>
      )}
    </ReportShell>
  );
}
