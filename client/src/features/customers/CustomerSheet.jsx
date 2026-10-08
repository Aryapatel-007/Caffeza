import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getCustomer, updateCustomer } from '../../api/customers.js';
import Button from '../../components/ui/Button.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import Input from '../../components/ui/Input.jsx';
import Money from '../../components/ui/Money.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import { formatDayIst, formatTimeIst } from '../../utils/formatDate.js';
import { errorText } from '../online/OnlineSheets.jsx';

const when = (at) => (at ? `${formatDayIst(at)}, ${formatTimeIst(at)}` : '');
const SOURCE = { STAFF: 'by staff', ONLINE: 'on the page' };

/** One customer: their visits, total spent, and offers consent with its history. P27. */
export default function CustomerSheet({ customerId, onClose, onToast }) {
  const queryClient = useQueryClient();
  const customer = useQuery({ queryKey: ['customers', customerId], queryFn: () => getCustomer(customerId) });
  const [reason, setReason] = useState('');
  const change = useMutation({
    mutationFn: (offersConsent) => updateCustomer(customerId, { offersConsent, reason: reason.trim() }),
    onSuccess: (data) => {
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onToast({ tone: 'success', message: data.offers.given ? 'Recorded: agreed to offers.' : 'Recorded: no more offers.' });
    },
    onError: (error) => onToast({ tone: 'error', message: errorText(error) }),
  });

  const data = customer.data;
  return (
    <Sheet title={data?.name ?? 'Customer'} subtitle={data?.phone} wide onClose={onClose}>
      {customer.isPending && <Spinner label="Loading the customer" />}
      {customer.isError && <ErrorState error={customer.error} onRetry={customer.refetch} />}
      {data && (
        <div className="grid gap-5">
          <dl className="grid grid-cols-2 gap-3">
            <div><dt className="type-caption text-muted">Visits</dt><dd className="type-num-tile">{data.visitCount}</dd></div>
            <div><dt className="type-caption text-muted">Total spent</dt><dd><Money paise={data.totalSpentInPaise} size="num" /></dd></div>
            <div><dt className="type-caption text-muted">Last visit</dt><dd className="type-body">{when(data.lastVisitAt)}</dd></div>
            <div><dt className="type-caption text-muted">First visit</dt><dd className="type-body">{when(data.firstVisitAt)}</dd></div>
          </dl>

          <section className="grid gap-2" aria-label="Offers">
            <h3 className="type-heading">Offers by SMS or WhatsApp</h3>
            <StateChip state={data.offers.given ? 'ok' : 'free'} word={data.offers.given ? 'Agreed to offers' : 'Not agreed'} size="sm" className="w-fit" />
            <ul className="grid gap-1">
              {data.offersHistory.map((entry, index) => (
                <li key={index} className="type-caption text-muted">
                  {entry.given ? 'Agreed' : 'Withdrawn'} {SOURCE[entry.source] ?? ''}, {when(entry.at)}
                  {entry.reason ? ` · ${entry.reason}` : ''}
                </li>
              ))}
            </ul>
            <Input label="Why it changes" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: asked at the counter" />
            <Button variant="secondary" className="w-fit" disabled={!reason.trim()} isLoading={change.isPending} onClick={() => change.mutate(!data.offers.given)}>
              {data.offers.given ? 'Record: no more offers' : 'Record: agreed to offers'}
            </Button>
          </section>

          <section className="grid gap-2" aria-label="Visits">
            <h3 className="type-heading">Visits</h3>
            <ul className="grid gap-1">
              {data.visits.map((visit) => (
                <li key={visit.orderId} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2">
                  <span className="type-body">
                    {when(visit.openedAt)} · {visit.tableName ?? (visit.orderType === 'TAKEAWAY' ? 'Takeaway' : 'Delivery')}
                  </span>
                  {visit.bill ? <Money paise={visit.bill.grandTotalInPaise} tabular /> : <span className="type-caption text-muted">No bill</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Sheet>
  );
}
