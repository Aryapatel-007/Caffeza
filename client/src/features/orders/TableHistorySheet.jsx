import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import Money from '../../components/ui/Money.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import { getTableHistory } from '../../api/orders.js';
import { formatTimeIst } from '../../utils/formatDate.js';
import { errorMessage } from './errorCopy.js';

const BILL_WORDS = { UNPAID: 'Unpaid', PAID: 'Paid', ON_ACCOUNT: 'On Hold', VOIDED: 'Cancelled' };
const BILL_STATES = { UNPAID: 'bill', PAID: 'ok', ON_ACCOUNT: 'open', VOIDED: 'alert' };

const dish = (line) => `${line.quantity} × ${line.itemName}${line.variantName ? ` (${line.variantName})` : ''}${line.addOnNames.length ? ` + ${line.addOnNames.join(', ')}` : ''}`;

/**
 * P48. The floor's 👁: what a table has had today, as PetPooja's Recall shows
 * it. Each send to the kitchen with its KOT number, the time and who sent it;
 * what was cancelled and why; the bill. Read-only: nothing here adds to the
 * order or sends a KOT.
 */
export default function TableHistorySheet({ table, onClose }) {
  const query = useQuery({ queryKey: ['table-history', table.id], queryFn: () => getTableHistory(table.id) });

  return (
    <Sheet title={`${table.name}: today`} subtitle="What this table has had. Nothing here is sent again." onClose={onClose}>
      {query.isPending && <Spinner label="Reading the table's day" />}
      {query.isError && <p className="type-body text-alert">{errorMessage(query.error)}</p>}
      {query.data && query.data.orders.length === 0 && <p className="type-body text-muted">Nothing on this table today.</p>}
      <ol className="flex flex-col gap-4">
        {(query.data?.orders ?? []).map((order) => (
          <li key={order.orderId} className="rounded-[10px] border border-line bg-surface p-3">
            <p className="type-label">
              Order #{order.orderNumber} · opened {formatTimeIst(order.openedAt)}
              {order.openedByName ? ` by ${order.openedByName}` : ''}
              {order.guestCount ? ` · ${order.guestCount} guests` : ''}
            </p>
            {order.sends.map((send) => (
              <div key={send.firedAt} className="mt-2 border-t border-line pt-2">
                <p className="type-caption text-muted">
                  {send.kotNumbers.length ? `KOT ${send.kotNumbers.join(', ')}` : 'Sent'} · {formatTimeIst(send.firedAt)}
                  {send.sentByName ? ` · ${send.sentByName}` : ''}
                </p>
                <ul className="type-body">
                  {send.lines.map((line, index) => (
                    <li key={index}>{dish(line)}</li>
                  ))}
                </ul>
              </div>
            ))}
            {order.notSent.length > 0 && (
              <div className="mt-2 border-t border-line pt-2">
                <p className="type-caption text-muted">Not sent yet</p>
                <ul className="type-body">
                  {order.notSent.map((line, index) => (
                    <li key={index}>{dish(line)}</li>
                  ))}
                </ul>
              </div>
            )}
            {order.cancelled.length > 0 && (
              <div className="mt-2 border-t border-line pt-2">
                <p className="type-caption text-alert">Cancelled</p>
                <ul className="type-body text-muted">
                  {order.cancelled.map((line, index) => (
                    <li key={index}>
                      <span className="line-through">{dish(line)}</span>
                      {line.at ? ` · ${formatTimeIst(line.at)}` : ''}
                      {line.byName ? ` · ${line.byName}` : ''}
                      {line.reason ? ` · ${line.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {order.bill && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
                <Link to={`/bills/${order.bill.billId}`} className="type-label text-accent underline-offset-4 hover:underline">
                  Bill {order.bill.billNumber}
                </Link>
                <StateChip state={BILL_STATES[order.bill.status] ?? 'free'} word={BILL_WORDS[order.bill.status] ?? order.bill.status} size="sm" />
                <Money paise={order.bill.grandTotalInPaise} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
