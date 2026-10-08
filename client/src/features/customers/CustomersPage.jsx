import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { downloadCustomers, listCustomers, searchCustomers } from '../../api/customers.js';
import { saveFile } from '../../api/integrations.js';
import Button from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDayIst } from '../../utils/formatDate.js';
import { errorText } from '../online/OnlineSheets.jsx';
import { Checkbox } from '../settings/settingsParts.jsx';

import CustomerSheet from './CustomerSheet.jsx';

/**
 * Customers. P27, API-CONTRACT M22. Everyone who gave a mobile number at a
 * table, at the counter or on the page: newest visit first, a search, the
 * ones who agreed to offers, and the owner's download of those.
 */
export default function CustomersPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [offers, setOffers] = useState(false);
  const [open, setOpen] = useState(null);
  const [toast, setToast] = useState(null);
  const searching = query.trim().length >= 2;
  const list = useQuery({ queryKey: ['customers', 'list', offers], queryFn: () => listCustomers({ offers }), enabled: !searching });
  const found = useQuery({ queryKey: ['customers', 'search', query.trim(), offers], queryFn: () => searchCustomers({ query: query.trim(), offers }), enabled: searching });
  const download = useMutation({ mutationFn: downloadCustomers, onSuccess: saveFile, onError: (error) => setToast({ tone: 'error', message: errorText(error) }) });

  const source = searching ? found : list;
  const rows = searching ? found.data ?? [] : list.data?.data ?? [];
  const total = searching ? rows.length : list.data?.meta?.total ?? 0;

  return (
    <main className="v2 min-h-full bg-ground">
      <header className="border-b border-line px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="type-heading">Customers</h1>
            <p className="type-caption text-muted">Guests who gave their mobile number. {total} {searching ? 'found' : 'in all'}.</p>
          </div>
          {user?.role === 'OWNER' && (
            <Button variant="secondary" size="sm" isLoading={download.isPending} onClick={() => download.mutate()}>
              Download those who agreed to offers
            </Button>
          )}
        </div>
      </header>
      <div className="mx-auto grid max-w-3xl gap-4 px-4 py-6">
        <Input label="Search" placeholder="A name, or the last digits of a mobile number" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Checkbox label="Only those who agreed to offers" checked={offers} onChange={setOffers} />
        {source.isPending && source.fetchStatus !== 'idle' && <Spinner label="Loading customers" />}
        {source.isError && <ErrorState error={source.error} onRetry={source.refetch} />}
        {source.isSuccess && rows.length === 0 && (
          <EmptyState title={searching ? 'Nobody matches' : 'No customers yet'} description="Customers appear when staff add a guest's mobile number while seating a table or taking an order." />
        )}
        <ul className="grid gap-2">
          {rows.map((customer) => (
            <li key={customer.id}>
              <button type="button" onClick={() => setOpen(customer.id)} className="grid w-full gap-1 rounded-xl border border-line bg-surface p-4 text-left hover:bg-sunken">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="type-heading">{customer.name ?? 'No name given'}</span>
                  {customer.offers?.given && <StateChip state="ok" word="Agreed to offers" size="sm" />}
                </span>
                <span className="type-caption text-muted">
                  {customer.phone} · {customer.visitCount} {customer.visitCount === 1 ? 'visit' : 'visits'} · last {formatDayIst(customer.lastVisitAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {open && <CustomerSheet customerId={open} onClose={() => setOpen(null)} onToast={setToast} />}
      {toast && <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />}
    </main>
  );
}
