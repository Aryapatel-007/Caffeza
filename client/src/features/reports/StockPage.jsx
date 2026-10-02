import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import DataTable from '../../components/charts/DataTable.jsx';
import RankedBars from '../../components/charts/RankedBars.jsx';
import { getStockConsumption } from '../../api/reports.js';
import { BASE_UNIT_SHORT_LABELS } from '../../utils/units.js';
import { errorMessage } from './errorCopy.js';
import ReportShell, { lastNDays, ReportSection } from './ReportShell.jsx';

/**
 * What was actually used, wasted and received.
 *
 * A table carries the detail because each ingredient has six figures at once,
 * and no chart shows six measures per row honestly. The ranked bars above it
 * answer the one question someone opens this screen with -- what are we
 * getting through the most of -- and the table answers everything else.
 *
 * Open to a storekeeper as well as an owner and a manager: this is the read
 * their job depends on, the same reason M4 gives them the ledger.
 */
export default function StockPage() {
  const [range, setRange] = useState(() => lastNDays(29));
  const enabled = Boolean(range.from && range.to && range.from <= range.to);

  const query = useQuery({
    queryKey: ['reports', 'stock-consumption', range],
    queryFn: () => getStockConsumption(range),
    enabled,
    placeholderData: (previous) => previous,
  });

  const rows = query.data ?? [];
  const unit = (row) => BASE_UNIT_SHORT_LABELS[row.baseUnit] ?? '';

  return (
    <ReportShell title="Stock consumed" range={range} onRangeChange={setRange}>
      {query.isError && <p className="mb-6 type-body text-alert">{errorMessage(query.error)}</p>}

      <div className={query.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <ReportSection
          title="Most used"
          description="Deductions less the returns that reversed them, so a dish that was fired and then cancelled unmade nets to nothing."
        >
          <RankedBars
            data={rows.slice(0, 15)}
            labelKey="name"
            valueKey="netConsumedInBase"
            formatValue={(value) => `${value}`}
            emptyMessage="No stock moved in this range."
          />
        </ReportSection>

        <ReportSection
          title="Every ingredient"
          description="Quantities are in each ingredient's own base unit. Wastage counts spillage with it: the actionable question is how much is being thrown away, not which word was picked at the time."
        >
          <DataTable
            caption="Stock consumption"
            columns={[
              { key: 'name', header: 'Ingredient' },
              {
                key: 'netConsumedInBase',
                header: 'Net used',
                numeric: true,
                render: (row) => `${row.netConsumedInBase} ${unit(row)}`,
              },
              {
                key: 'consumedInBase',
                header: 'Deducted',
                numeric: true,
                render: (row) => `${row.consumedInBase} ${unit(row)}`,
              },
              {
                key: 'returnedInBase',
                header: 'Returned',
                numeric: true,
                render: (row) => `${row.returnedInBase} ${unit(row)}`,
              },
              {
                key: 'wastageInBase',
                header: 'Wasted',
                numeric: true,
                render: (row) => `${row.wastageInBase} ${unit(row)}`,
              },
              {
                key: 'receivedInBase',
                header: 'Received',
                numeric: true,
                render: (row) => `${row.receivedInBase} ${unit(row)}`,
              },
              {
                key: 'recountAdjustmentInBase',
                header: 'Recount',
                numeric: true,
                render: (row) => `${row.recountAdjustmentInBase} ${unit(row)}`,
              },
            ]}
            rows={rows.map((row) => ({ ...row, key: row.ingredientId }))}
            emptyMessage="No stock moved in this range."
          />
        </ReportSection>
      </div>
    </ReportShell>
  );
}
