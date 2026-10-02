import { useQuery } from '@tanstack/react-query';

import ErrorState from '../../components/ui/ErrorState.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import { listTables } from '../../api/orders.js';
import { errorMessage } from './errorCopy.js';
import Spinner from '../../components/ui/Spinner.jsx';

/**
 * Moving an open dine-in order to another table, through
 * PATCH /orders/:orderId/table. Only free tables are offered; the server still
 * refuses an occupied one with TABLE_OCCUPIED if someone sits there first.
 */
export default function MoveTablePanel({ order, isBusy, onCancel, onConfirm }) {
  const tables = useQuery({
    queryKey: ['tables', { includeInactive: false }],
    queryFn: () => listTables(),
  });

  const free = (tables.data ?? []).filter((table) => !table.occupancy.isOccupied && table.id !== order.tableId);

  return (
    <Sheet title={`Move ${order.tableName ?? 'order'} to`} onCancel={onCancel}>
      {tables.isPending && <Spinner label="Loading the tables" size="sm" />}
      {tables.isError && <ErrorState error={errorMessage(tables.error)} />}
      {tables.isSuccess && free.length === 0 && <p className="type-body text-muted">Every other table is taken.</p>}

      <ul className="grid grid-cols-2 gap-2">
        {free.map((table) => (
          <li key={table.id}>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onConfirm(table)}
              className="flex min-h-20 w-full flex-col justify-between rounded-[10px] border border-line bg-surface p-3 text-left hover:bg-sunken disabled:opacity-50"
            >
              <span className="type-tile-name">{table.name}</span>
              <span className="type-caption text-muted">
                {[table.section, table.seats != null && `${table.seats} seats`].filter(Boolean).join(' · ') || 'Free'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
