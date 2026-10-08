import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { acknowledgeAlert, listAlerts } from '../../api/integrations.js';
import Button from '../../components/ui/Button.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import { formatDayIst, formatTimeIst } from '../../utils/formatDate.js';

/**
 * Open integration alerts: a plain sentence, where to go, and Done.
 * P25 Part L4, API-CONTRACT M21 section 5.1. The same alerts show in Today.
 */
export default function IntegrationAlerts() {
  const queryClient = useQueryClient();
  const alerts = useQuery({ queryKey: ['integrations', 'alerts'], queryFn: listAlerts, refetchInterval: 60_000 });
  const done = useMutation({
    mutationFn: acknowledgeAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations', 'alerts'] }),
  });

  const rows = alerts.data ?? [];
  if (rows.length === 0) return null;
  return (
    <section aria-label="Integration alerts" className="grid gap-2">
      <h2 className="type-title">Needs a look</h2>
      <ul className="grid gap-2">
        {rows.map((alert) => (
          <li key={`${alert.kind}:${alert.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-alert bg-surface p-4">
            <StateChip state="alert" word="Alert" size="sm" />
            <div className="min-w-0 flex-1">
              <p className="type-body">{alert.sentence}</p>
              <p className="type-caption text-muted">{formatDayIst(alert.at)}, {formatTimeIst(alert.at)}</p>
            </div>
            {alert.link && (
              <Link to={alert.link} className="type-button inline-flex min-h-12 items-center underline underline-offset-4">
                Open
              </Link>
            )}
            <Button variant="secondary" size="sm" isLoading={done.isPending && done.variables?.id === alert.id} onClick={() => done.mutate({ kind: alert.kind, id: alert.id })}>
              Done
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
