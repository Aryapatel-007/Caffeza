import { Link } from 'react-router-dom';

import DataTable from '../../components/charts/DataTable.jsx';
import { drillHref } from './catalog.js';
import { Cell } from './v2/reportCells.jsx';

const NUMERIC = new Set(['money', 'count', 'percent', 'decimal2', 'minutes']);

/**
 * One envelope table: its columns as the server sent them, each cell
 * formatted by type, a drill link wherever the server gave one, and the totals
 * row the server added up. The client adds up nothing. P18.
 */
export default function ReportTable({ columns, rows, totals, caption }) {
  const cell = (row, column) => {
    const content = <Cell type={column.type} value={row[column.key]} />;
    const href = drillHref(row.drill?.[column.key]);
    if (!href || row[column.key] === null || row[column.key] === undefined) return content;
    return (
      <Link to={href} className="text-accent underline underline-offset-2">
        {content}
      </Link>
    );
  };

  const hasTotals = totals && Object.keys(totals).some((key) => key !== 'drill' && columns.some((column) => column.key === key));
  const tableColumns = columns.map((column, index) => ({
    key: column.key,
    header: column.label,
    numeric: NUMERIC.has(column.type),
    render: (row) => cell(row, column),
    renderTotal: (row) => {
      if (index === 0 && !(column.key in row)) return 'Total';
      if (!(column.key in row)) return null;
      return cell(row, column);
    },
  }));

  return (
    <div className="report-table">
      <DataTable
        columns={tableColumns}
        rows={rows.map((row, index) => ({ ...row, key: index }))}
        totals={hasTotals ? totals : null}
        stickyFirstColumn
        caption={caption}
        emptyMessage="Nothing in this range."
      />
    </div>
  );
}
