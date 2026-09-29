import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import DataTable from '../../components/charts/DataTable.jsx';
import { StatTile } from '../../components/charts/StatTile.jsx';
import { getTaxSummary } from '../../api/reports.js';
import { formatBasisPoints } from '../../utils/formatMoney.js';
import { errorMessage } from './errorCopy.js';
import { formatPaise } from './formatReport.js';
import ReportShell, { lastNDays, ReportSection } from './ReportShell.jsx';

/**
 * The number an accountant files from.
 *
 * A table, not a chart, and deliberately so: each slab carries four figures at
 * once -- taxable value, CGST, SGST and the total -- and no chart shows four
 * measures per category without misrepresenting one of them. This is also the
 * screen most likely to be read alongside a printed bill, so the figures need
 * to be exact and aligned rather than approximate and pretty.
 *
 * Every number here was computed once by M3, per slab, under a documented
 * rounding rule, and frozen onto the bill. This screen sums stored values and
 * recomputes nothing, which is why it cannot disagree with the paper.
 */
export default function TaxPage() {
  const [range, setRange] = useState(() => lastNDays(29));
  const enabled = Boolean(range.from && range.to && range.from <= range.to);

  const query = useQuery({
    queryKey: ['reports', 'tax-summary', range],
    queryFn: () => getTaxSummary(range),
    enabled,
    placeholderData: (previous) => previous,
  });

  const data = query.data;

  return (
    <ReportShell title="Tax" range={range} onRangeChange={setRange}>
      {query.isError && <p className="mb-6 text-[15px] text-mirch">{errorMessage(query.error)}</p>}

      {data && (
        <div className={query.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Taxable value" value={formatPaise(data.totalTaxableInPaise)} />
            <StatTile label="CGST" value={formatPaise(data.totalCgstInPaise)} />
            <StatTile label="SGST" value={formatPaise(data.totalSgstInPaise)} />
            <StatTile label="Total tax" value={formatPaise(data.totalTaxInPaise)} />
          </div>

          <ReportSection
            title="By rate slab"
            description="Exactly as it was computed on each bill and printed on the paper. A slab with no sales in this range is not listed."
          >
            <DataTable
              caption="Tax by slab"
              columns={[
                {
                  key: 'taxRateBps',
                  header: 'Rate',
                  render: (row) => formatBasisPoints(row.taxRateBps),
                },
                {
                  key: 'taxableInPaise',
                  header: 'Taxable',
                  numeric: true,
                  render: (row) => formatPaise(row.taxableInPaise),
                },
                {
                  key: 'cgstInPaise',
                  header: 'CGST',
                  numeric: true,
                  render: (row) => formatPaise(row.cgstInPaise),
                },
                {
                  key: 'sgstInPaise',
                  header: 'SGST',
                  numeric: true,
                  render: (row) => formatPaise(row.sgstInPaise),
                },
                {
                  key: 'taxInPaise',
                  header: 'Total tax',
                  numeric: true,
                  render: (row) => formatPaise(row.taxInPaise),
                },
              ]}
              rows={(data.slabs ?? []).map((slab) => ({ ...slab, key: slab.taxRateBps }))}
              emptyMessage="No taxable sales in this range."
            />
          </ReportSection>

          <p className="text-[12px] leading-4 text-steel">
            Intra-state supply only. Each slab&rsquo;s tax splits in half, and CGST takes the extra
            paisa when the total is odd. Voided bills are in none of these figures.
          </p>
        </div>
      )}
    </ReportShell>
  );
}
