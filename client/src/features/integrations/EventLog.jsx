import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { listEvents } from '../../api/integrations.js';
import Button from '../../components/ui/Button.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import { formatDayIst, formatTimeIst } from '../../utils/formatDate.js';

import { OUTCOME_CHIP } from './integrationWords.js';

/**
 * A connection's event log, newest first. Lines are redacted when stored: no
 * secret and no phone number ever reaches this screen.
 */
export default function EventLog({ provider }) {
  const [page, setPage] = useState(1);
  const events = useQuery({ queryKey: ['integrations', provider, 'events', page], queryFn: () => listEvents(provider, { page }) });
  if (events.isError) return <ErrorState error={events.error} onRetry={events.refetch} />;
  const rows = events.data?.data ?? [];
  const total = events.data?.meta?.total ?? 0;

  return (
    <section className="grid gap-2" aria-label="Event log">
      <h3 className="type-heading">Event log</h3>
      {events.isSuccess && rows.length === 0 && <p className="type-caption text-muted">Nothing has happened on this connection yet.</p>}
      <ul className="grid gap-1">
        {rows.map((event) => {
          const chip = OUTCOME_CHIP[event.outcome] ?? { state: 'free', word: event.outcome };
          return (
            <li key={event.id} className="grid gap-1 border-b border-line py-2">
              <div className="flex flex-wrap items-center gap-2">
                <StateChip state={chip.state} word={chip.word} size="sm" />
                <span className="type-label">{event.direction === 'IN' ? 'Received' : 'Sent'} {event.kind}</span>
                {event.externalId && <span className="type-caption text-muted">{event.externalId}</span>}
              </div>
              <p className="type-caption text-muted">
                {formatDayIst(event.at)}, {formatTimeIst(event.at)}
                {event.httpStatus ? ` · ${event.httpStatus}` : ''}
                {Number.isInteger(event.durationMs) ? ` · ${event.durationMs} ms` : ''}
              </p>
              {event.error && <p className="type-caption text-alert">{event.error}</p>}
            </li>
          );
        })}
      </ul>
      {total > page * 20 || page > 1 ? (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Newer</Button>
          <Button variant="secondary" size="sm" disabled={total <= page * 20} onClick={() => setPage(page + 1)}>Older</Button>
        </div>
      ) : null}
    </section>
  );
}
