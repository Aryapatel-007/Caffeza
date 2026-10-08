import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import { listIntegrations } from '../../api/integrations.js';
import ErrorState from '../../components/ui/ErrorState.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDayIst, formatTimeIst } from '../../utils/formatDate.js';

import IntegrationAlerts from './IntegrationAlerts.jsx';
import { connectionChip, KIND_WORDS } from './integrationWords.js';
import ProviderSheet from './ProviderSheet.jsx';

const when = (at) => (at ? `${formatDayIst(at)}, ${formatTimeIst(at)}` : null);

/**
 * Integrations. P25 Part L1 and L4. A card per partner with its state, its
 * last success and last error in plain words; the owner opens one to change
 * it, a manager to read it. Open alerts come first.
 */
export default function IntegrationsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'OWNER';
  const { provider: openProvider } = useParams();
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  const integrations = useQuery({ queryKey: ['integrations', 'list'], queryFn: listIntegrations });

  const entries = (integrations.data ?? []).map((entry) => ({ ...entry, kindWord: KIND_WORDS[entry.kind] ?? entry.kind }));
  const open = entries.find((entry) => entry.provider === openProvider) ?? null;

  return (
    <main className="v2 min-h-full bg-ground">
      <header className="border-b border-line px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <h1 className="type-heading">Integrations</h1>
          <p className="type-caption text-muted">
            Delivery platforms, the card machine and Tally. {canEdit ? 'Every change is recorded.' : 'Only the owner can change these.'}
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-3xl gap-6 px-4 py-6">
        <IntegrationAlerts />
        {integrations.isPending && <Spinner label="Loading integrations" />}
        {integrations.isError && <ErrorState error={integrations.error} onRetry={integrations.refetch} />}
        <ul className="grid gap-3 sm:grid-cols-2">
          {entries.map((entry) => {
            const chip = connectionChip(entry);
            const connection = entry.connection;
            return (
              <li key={entry.provider}>
                <button
                  type="button"
                  onClick={() => navigate(`/settings/integrations/${entry.provider}`)}
                  className="grid h-full w-full gap-2 rounded-xl border border-line bg-surface p-4 text-left hover:bg-sunken"
                >
                  <span className="type-caption text-muted">{entry.kindWord}</span>
                  <span className="type-title">{entry.name}</span>
                  <StateChip state={chip.state} word={chip.word} size="sm" className="w-fit" />
                  {connection?.lastSuccessAt && <span className="type-caption text-muted">Last worked {when(connection.lastSuccessAt)}</span>}
                  {connection?.lastError && <span className="type-caption text-alert">{connection.lastError}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {open && (
        <ProviderSheet
          key={open.provider}
          entry={open}
          canEdit={canEdit}
          onClose={() => navigate('/settings/integrations')}
          onToast={setToast}
        />
      )}
      {toast && <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />}
    </main>
  );
}
