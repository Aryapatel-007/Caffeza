import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import DataTable from '../../components/charts/DataTable.jsx';
import RankedBars from '../../components/charts/RankedBars.jsx';
import { StatTile } from '../../components/charts/StatTile.jsx';
import { getPaymentMethods } from '../../api/reports.js';
import { errorMessage } from './errorCopy.js';
import { formatPaise } from './formatReport.js';
import ReportShell, { lastNDays, ReportSection } from './ReportShell.jsx';

/**
 * What was collected, by method.
 *
 * OWNER ONLY, and that is the whole point of the report existing separately
 * rather than as a panel on the sales screen. The cash figure is the number a
 * dishonest manager most wants to see and most wants to control, so it is the
 * one report a manager does not get. The route is gated, the nav tab is hidden
 * for a manager, and the server refuses it regardless of either.
 *
 * All four methods always show, including the ones at zero. A method silently
 * missing from a list reads as "no data"; a zero reads as "none taken", and
 * those are different answers to a question an owner is asking carefully.
 */
export default function PaymentsPage() {
  const [range, setRange] = useState(() => lastNDays(29));
  const enabled = Boolean(range.from && range.to && range.from <= range.to);

  const query = useQuery({
    queryKey: ['reports', 'payment-methods', range],
    queryFn: () => getPaymentMethods(range),
    enabled,
    placeholderData: (previous) => previous,
  });

  const data = query.data;

  return (
    <ReportShell title="Payments" range={range} onRangeChange={setRange}>
      {query.isError && <p className="mb-6 text-[15px] text-mirch">{errorMessage(query.error)}</p>}

      {data && (
        <div className={query.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile label="Collected" value={formatPaise(data.totalCollectedInPaise)} />
            <StatTile
              label="Cash"
              value={formatPaise(
                data.methods.find((row) => row.method === 'CASH')?.amountInPaise ?? 0,
              )}
            />
            <StatTile
              label="Still unpaid"
              value={formatPaise(data.unpaidInPaise)}
              hint="Billed but not settled"
            />
          </div>

          <ReportSection
            title="By method"
            description="What was actually collected against bills in this range. We record which method was used; no money moves through this software."
            table={
              <DataTable
                caption="Collected by method"
                columns={[
                  { key: 'method', header: 'Method' },
                  { key: 'paymentCount', header: 'Payments', numeric: true },
                  {
                    key: 'amountInPaise',
                    header: 'Amount',
                    numeric: true,
                    render: (row) => formatPaise(row.amountInPaise),
                  },
                ]}
                rows={data.methods.map((row) => ({ ...row, key: row.method }))}
              />
            }
          >
            <RankedBars
              data={data.methods}
              labelKey="method"
              valueKey="amountInPaise"
              formatValue={formatPaise}
              secondaryKey="paymentCount"
              formatSecondary={(count) => `${count} payments`}
              emptyMessage="Nothing was collected in this range."
            />
          </ReportSection>

          <p className="text-[12px] leading-4 text-steel">
            Only an owner can see this breakdown. Voided bills are in none of these figures.
          </p>
        </div>
      )}
    </ReportShell>
  );
}
