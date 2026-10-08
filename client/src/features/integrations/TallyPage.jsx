import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { downloadLedgerMasters, listIntegrations, saveFile } from '../../api/integrations.js';
import Button from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorText } from '../online/OnlineSheets.jsx';

import TallyBridges from './TallyBridges.jsx';
import TallyDays from './TallyDays.jsx';
import TallyLedgerMapping from './TallyLedgerMapping.jsx';

/** How to bring the file into each version, in the accountant's words. */
const IMPORT_STEPS = {
  TALLY_PRIME: [
    'Open the company in TallyPrime.',
    'First time only: Import, then Masters, and choose the ledger list file.',
    'Import, then Transactions, and choose the day’s file.',
    'Check the Day Book for that date: the totals match the day’s report here.',
  ],
  TALLY_ERP9: [
    'Open the company in Tally.ERP 9.',
    'First time only: Gateway of Tally, Import of Data, Masters, and choose the ledger list file.',
    'Gateway of Tally, Import of Data, Vouchers, and choose the day’s file.',
    'Check the Day Book for that date: the totals match the day’s report here.',
  ],
};

/**
 * Tally. P25 Part L3: ledger mapping, the days and their exports, the bridge,
 * and how to import. OWNER and MANAGER; the mapping and the bridges are the
 * owner's to change.
 */
export default function TallyPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const [toast, setToast] = useState(null);
  const integrations = useQuery({ queryKey: ['integrations', 'list'], queryFn: listIntegrations });
  const masters = useMutation({ mutationFn: downloadLedgerMasters, onSuccess: saveFile, onError: (error) => setToast({ tone: 'error', message: errorText(error) }) });
  const connection = integrations.data?.find((entry) => entry.provider === 'TALLY')?.connection ?? null;

  return (
    <main className="v2 min-h-full bg-ground">
      <header className="border-b border-line px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <Link to="/settings/integrations" className="type-caption underline underline-offset-4">Integrations</Link>
          <h1 className="type-heading">Tally</h1>
          <p className="type-caption text-muted">Each closed day becomes Tally vouchers, from the figures frozen on its bills. A day is sent once.</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-3xl gap-8 px-4 py-6">
        {integrations.isPending && <Spinner label="Loading Tally" />}
        {integrations.isError && <ErrorState error={integrations.error} onRetry={integrations.refetch} />}
        {integrations.isSuccess && !connection && (
          <EmptyState title="Tally is not set up" description="The owner sets it up in Integrations: the Tally version and the company name." action={<Link to="/settings/integrations/TALLY" className="underline underline-offset-4">Set up Tally</Link>} />
        )}
        {connection && connection.status !== 'ACTIVE' && (
          <p className="type-body text-alert">
            {connection.config.delivery === 'BRIDGE'
              ? 'Tally is not connected yet. Pair a bridge below, then test the connection in Integrations.'
              : 'Tally is not connected yet. Test the connection in Integrations before exporting.'}
          </p>
        )}
        {connection && (
          <>
            {connection.status === 'ACTIVE' && <TallyDays connection={connection} isOwner={isOwner} onToast={setToast} />}
            {connection.config.delivery === 'BRIDGE' && <TallyBridges isOwner={isOwner} onToast={setToast} />}
            <section className="grid gap-2" aria-label="How to import">
              <h2 className="type-title">How to import a file</h2>
              <ol className="grid list-decimal gap-1 pl-6">
                {(IMPORT_STEPS[connection.config.version] ?? IMPORT_STEPS.TALLY_PRIME).map((step) => <li key={step} className="type-body">{step}</li>)}
              </ol>
              {isOwner && (
                <Button variant="secondary" size="sm" className="w-fit" isLoading={masters.isPending} onClick={() => masters.mutate()}>
                  Download the ledger list
                </Button>
              )}
            </section>
            <TallyLedgerMapping key={connection.id} connection={connection} canEdit={isOwner} onToast={setToast} />
          </>
        )}
      </div>
      {toast && <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />}
    </main>
  );
}
