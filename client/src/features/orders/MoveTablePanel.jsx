import { useQuery } from '@tanstack/react-query';

import PanelShell from '../billing/PanelShell.jsx';
import { listTables } from '../../api/orders.js';
import { errorMessage } from './errorCopy.js';

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

  const free = (tables.data ?? []).filter(
    (table) => !table.occupancy.isOccupied && table.id !== order.tableId,
  );

  return (
    <PanelShell title={`Move ${order.tableName ?? 'order'} to`} onCancel={onCancel}>
      {tables.isPending && <p className="text-[15px] text-steel">Loading the tables…</p>}
      {tables.isError && <p className="text-[15px] text-mirch">{errorMessage(tables.error)}</p>}
      {tables.isSuccess && free.length === 0 && (
        <p className="text-[15px] text-steel">Every other table is taken.</p>
      )}

      <ul className="grid grid-cols-2 gap-3">
        {free.map((table) => (
          <li key={table.id}>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onConfirm(table)}
              className="flex min-h-[72px] w-full flex-col justify-between rounded-2xl bg-linen p-3 text-left hover:bg-linen-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
            >
              <span className="font-mono text-[18px] font-bold">{table.name}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-steel">
                {[table.section, table.seats != null && `${table.seats} seats`]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}
