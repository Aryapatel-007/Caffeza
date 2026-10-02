import Columns from '../../components/charts/Columns.jsx';
import HeatGrid from '../../components/charts/HeatGrid.jsx';
import RankedBars from '../../components/charts/RankedBars.jsx';
import { StatTile } from '../../components/charts/StatTile.jsx';
import { formatPaise } from '../../utils/formatMoney.js';
import { compactPaise, hourLabel, shortBusinessDate } from './formatReport.js';
import { formatCell } from './v2/reportCells.jsx';

/**
 * The chart above a section, where P18 section 9 gives one. Every chart sits
 * over the section's table, its twin, so no number is reachable only by
 * hovering, and a chart never shows a number the table does not.
 *
 * Returns null for every other section: most reports are tables.
 */
export default function ReportChart({ reportId, section }) {
  const rows = section.rows ?? [];
  const money = (value) => formatPaise(value);

  if (reportId === 'R1' && section.key === 'tiles') {
    const [tiles] = rows;
    if (!tiles) return null;
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {section.columns.map((column) => (
          <StatTile key={column.key} label={column.label} value={formatCell(column.type, tiles[column.key]) || '—'} />
        ))}
      </div>
    );
  }

  if (reportId === 'R3' && !section.key) {
    return (
      <Columns
        data={rows.map((row) => ({ label: shortBusinessDate(row.businessDate), value: row.netSalesInPaise }))}
        formatValue={money}
        formatTick={compactPaise}
        caption="Net sales per day"
      />
    );
  }

  if (reportId === 'R4' && section.key === 'byHour') {
    return (
      <Columns
        data={rows.map((row) => ({ label: hourLabel(row.hour), value: row.netSalesInPaise }))}
        formatValue={money}
        formatTick={compactPaise}
        caption="Net sales per hour"
      />
    );
  }

  if (reportId === 'R4' && section.key === 'weekdayByHour') {
    const buckets = section.columns.slice(1).map((column) => ({ key: column.key, label: hourLabel(Number(column.key.slice(1, -'InPaise'.length))) }));
    return <HeatGrid rows={rows} rowKey="weekday" buckets={buckets} formatValue={money} caption="Net sales by weekday and hour" />;
  }

  if (reportId === 'R5' && section.key === 'days') {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-steel">
            {section.columns.find((column) => column.key === 'inHandInPaise')?.label}
          </p>
          <Columns
            data={rows.map((row) => ({ label: shortBusinessDate(row.businessDate), value: row.inHandInPaise }))}
            formatValue={money}
            formatTick={compactPaise}
            height={160}
          />
        </div>
        <div>
          <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-steel">
            {section.columns.find((column) => column.key === 'platformInPaise')?.label}
          </p>
          <Columns
            data={rows.map((row) => ({ label: shortBusinessDate(row.businessDate), value: row.platformInPaise }))}
            formatValue={money}
            formatTick={compactPaise}
            height={160}
          />
        </div>
      </div>
    );
  }

  if ((reportId === 'R11' || reportId === 'R12') && !section.key) {
    return (
      <RankedBars
        data={rows.filter((row) => row.netSalesInPaise !== null).map((row) => ({ label: row.name, value: row.netSalesInPaise }))}
        formatValue={money}
      />
    );
  }

  return null;
}
