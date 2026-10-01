import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import Columns from '../../components/charts/Columns.jsx';
import DataTable from '../../components/charts/DataTable.jsx';
import RankedBars from '../../components/charts/RankedBars.jsx';
import { StatTile } from '../../components/charts/StatTile.jsx';
import { getHourly, getSalesByDay, getSalesSummary, getTopItems } from '../../api/reports.js';
import { errorMessage } from './errorCopy.js';
import { compactPaise, formatPaise, hourLabel, shortBusinessDate } from './formatReport.js';
import ReportShell, { lastNDays, ReportSection } from './ReportShell.jsx';

/**
 * Sales across a range: the headline totals, the daily trend, the shape of a
 * day by hour, and what actually sold.
 *
 * Four reads against one range, from the one filter row in the shell. All four
 * re-render against the same slice, so nothing on screen can be showing a
 * different period from anything else.
 */
export default function SalesPage() {
  const [range, setRange] = useState(() => lastNDays(29));
  const [sort, setSort] = useState('quantity');

  const enabled = Boolean(range.from && range.to && range.from <= range.to);
  const options = { enabled, placeholderData: (previous) => previous };

  const summary = useQuery({
    queryKey: ['reports', 'sales-summary', range],
    queryFn: () => getSalesSummary(range),
    ...options,
  });
  const byDay = useQuery({
    queryKey: ['reports', 'sales-by-day', range],
    queryFn: () => getSalesByDay(range),
    ...options,
  });
  const hours = useQuery({
    queryKey: ['reports', 'hourly', range],
    queryFn: () => getHourly(range),
    ...options,
  });
  const items = useQuery({
    queryKey: ['reports', 'top-items', range, sort],
    queryFn: () => getTopItems({ ...range, sort, limit: 20 }),
    ...options,
  });

  const firstError = [summary, byDay, hours, items].find((query) => query.isError);

  return (
    <ReportShell title="Sales" range={range} onRangeChange={setRange}>
      {!enabled && (
        <p className="mb-6 text-[13px] text-mirch">The end of the range is before its start.</p>
      )}
      {firstError && (
        <p className="mb-6 text-[15px] text-mirch">{errorMessage(firstError.error)}</p>
      )}

      {summary.data && (
        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Gross sales" value={formatPaise(summary.data.grossSalesInPaise)} />
          <StatTile label="Bills" value={summary.data.billCount} />
          <StatTile label="Average bill" value={formatPaise(summary.data.averageBillInPaise)} />
          <StatTile label="Tax collected" value={formatPaise(summary.data.totalTaxInPaise)} />
          <StatTile
            label="Dine-in"
            value={formatPaise(summary.data.dineIn.salesInPaise)}
            hint={`${summary.data.dineIn.billCount} bills`}
          />
          <StatTile
            label="Takeaway"
            value={formatPaise(summary.data.takeaway.salesInPaise)}
            hint={`${summary.data.takeaway.billCount} bills`}
          />
          <StatTile label="Discount given" value={formatPaise(summary.data.totalDiscountInPaise)} />
          {/*
            Voided bills appear here and in no other figure on this screen.
            An owner wants to watch this number, which is exactly why it is
            shown rather than quietly filtered away everywhere.
          */}
          <StatTile
            label="Voided"
            value={summary.data.voidedBillCount}
            hint={`${formatPaise(summary.data.voidedBillValueInPaise)}, in no sales figure above`}
          />
        </div>
      )}

      <ReportSection
        title="Sales by day"
        description="Days with no bills show as zero rather than being skipped, so a quiet week reads as a quiet week."
        table={
          <DataTable
            caption="Sales by day"
            columns={[
              { key: 'businessDate', header: 'Business day' },
              { key: 'billCount', header: 'Bills', numeric: true },
              {
                key: 'grossSalesInPaise',
                header: 'Gross sales',
                numeric: true,
                render: (row) => formatPaise(row.grossSalesInPaise),
              },
              {
                key: 'averageBillInPaise',
                header: 'Average bill',
                numeric: true,
                render: (row) => formatPaise(row.averageBillInPaise),
              },
              {
                key: 'totalDiscountInPaise',
                header: 'Discount',
                numeric: true,
                render: (row) => formatPaise(row.totalDiscountInPaise),
              },
            ]}
            rows={(byDay.data ?? []).map((row) => ({ ...row, key: row.businessDate }))}
          />
        }
      >
        <Columns
          data={(byDay.data ?? []).map((row) => ({
            label: shortBusinessDate(row.businessDate),
            value: row.grossSalesInPaise,
          }))}
          formatValue={formatPaise}
          formatTick={compactPaise}
          caption="Gross sales per business day"
          height={220}
        />
      </ReportSection>

      <ReportSection
        title="By hour"
        description="Every hour of the IST clock across the whole range, so a quiet hour is visible as well as a busy one."
        table={
          <DataTable
            caption="Sales by hour"
            columns={[
              { key: 'hourIst', header: 'Hour', render: (row) => hourLabel(row.hourIst) },
              { key: 'billCount', header: 'Bills', numeric: true },
              {
                key: 'grossSalesInPaise',
                header: 'Gross sales',
                numeric: true,
                render: (row) => formatPaise(row.grossSalesInPaise),
              },
            ]}
            rows={(hours.data ?? []).map((row) => ({ ...row, key: row.hourIst }))}
          />
        }
      >
        <Columns
          data={(hours.data ?? []).map((row) => ({
            label: hourLabel(row.hourIst),
            value: row.grossSalesInPaise,
          }))}
          formatValue={formatPaise}
          formatTick={compactPaise}
          caption="Gross sales by hour of day, IST"
          height={200}
        />
      </ReportSection>

      <ReportSection
        title="What sold"
        description="Read from the bills themselves, so a cancelled line is already excluded. A renamed dish shows its current name with its whole history joined."
        table={
          <DataTable
            caption="Items sold"
            columns={[
              { key: 'itemName', header: 'Item' },
              { key: 'quantity', header: 'Quantity', numeric: true },
              {
                key: 'revenueInPaise',
                header: 'Revenue',
                numeric: true,
                render: (row) => formatPaise(row.revenueInPaise),
              },
              { key: 'billCount', header: 'On bills', numeric: true },
            ]}
            rows={(items.data ?? []).map((row) => ({ ...row, key: row.menuItemId }))}
          />
        }
      >
        <div className="mb-3 flex gap-1">
          {[
            { value: 'quantity', label: 'By quantity' },
            { value: 'revenue', label: 'By revenue' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSort(option.value)}
              aria-pressed={sort === option.value}
              className={[
                'h-10 rounded-full px-3 text-[13px] font-medium',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                sort === option.value
                  ? 'border border-black/5 shadow-card bg-chana/20 text-ink'
                  : 'border-2 border-steel/40 text-steel',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>

        <RankedBars
          data={items.data ?? []}
          labelKey="itemName"
          valueKey={sort === 'revenue' ? 'revenueInPaise' : 'quantity'}
          formatValue={sort === 'revenue' ? formatPaise : (value) => `${value} sold`}
          secondaryKey={sort === 'revenue' ? 'quantity' : 'revenueInPaise'}
          formatSecondary={sort === 'revenue' ? (value) => `${value} sold` : formatPaise}
          emptyMessage="Nothing sold in this range."
        />
      </ReportSection>
    </ReportShell>
  );
}
