import { useQuery } from '@tanstack/react-query';

import Money from '../../components/ui/Money.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { getTableHistory } from '../../api/orders.js';
import { formatTimeIst } from '../../utils/formatDate.js';
import { errorMessage } from './errorCopy.js';

const dish = (line) =>
  `${line.quantity} × ${line.itemName}${line.variantName ? ` (${line.variantName})` : ''}${line.addOnNames.length ? ` + ${line.addOnNames.join(', ')}` : ''}`;

/**
 * P48. The floor's 👁, kept as simple as Rishi asked (2026-10-14): only the
 * table's current order. Each KOT with its time and the dishes on it, then any
 * dishes not sent yet, and the order's total. Read-only: nothing here adds to
 * the order or sends a KOT. Earlier orders on the table are not shown.
 */
export default function TableHistorySheet({ table, onClose }) {
  const query = useQuery({ queryKey: ['table-history', table.id], queryFn: () => getTableHistory(table.id) });
  const current = (query.data?.orders ?? []).find((order) => order.orderId === table.occupancy?.orderId) ?? null;

  return (
    <Sheet title={table.name} subtitle="What this table has ordered" onClose={onClose}>
      {query.isPending && <Spinner label="Reading the order" />}
      {query.isError && <p className="type-body text-alert">{errorMessage(query.error)}</p>}
      {query.isSuccess && !current && <p className="type-body text-muted">No order on this table now.</p>}
      {current && (
        <div className="flex flex-col gap-3">
          {current.sends.map((send) => (
            <section key={send.firedAt} className="rounded-[10px] border border-line bg-surface p-3">
              <h3 className="type-label">
                {send.kotNumbers.length ? `KOT ${send.kotNumbers.join(', ')}` : 'Sent'}
                <span className="type-caption text-muted"> · {formatTimeIst(send.firedAt)}</span>
              </h3>
              <ul className="type-body mt-1">
                {send.lines.map((line, index) => (
                  <li key={index}>{dish(line)}</li>
                ))}
              </ul>
            </section>
          ))}
          {current.notSent.length > 0 && (
            <section className="rounded-[10px] border border-dashed border-line bg-surface p-3">
              <h3 className="type-label">Not sent yet</h3>
              <ul className="type-body mt-1">
                {current.notSent.map((line, index) => (
                  <li key={index}>{dish(line)}</li>
                ))}
              </ul>
            </section>
          )}
          {table.occupancy?.itemTotalInPaise != null && (
            <p className="type-heading flex items-baseline justify-between">
              Item total <Money paise={table.occupancy.itemTotalInPaise} size="num" />
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
