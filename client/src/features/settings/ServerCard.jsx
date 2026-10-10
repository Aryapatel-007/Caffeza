import { useQuery } from '@tanstack/react-query';

import { getServerStarts } from '../../api/system.js';
import { formatDayIst, formatTimeIst } from '../../utils/formatDate.js';
import { Section } from './settingsParts.jsx';

/** A business date label, read at midday India time, as "Thu 9 Oct". */
const dayLabel = (businessDate) => formatDayIst(`${businessDate}T12:00:00+05:30`);

const joinAnd = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/**
 * The owner's Server card. P30, API-CONTRACT P30 section 3.
 *
 * Render's free server sleeps after 15 minutes alone, and the pingers exist to
 * stop that during working hours. This says how often it started, and names
 * any day it slept while the restaurant was open.
 */
export default function ServerCard() {
  const starts = useQuery({ queryKey: ['system', 'starts', 7], queryFn: () => getServerStarts(7) });

  return (
    <Section title="Server" description="How often the free server started. It sleeps after 15 minutes with no one using it.">
      {starts.isPending ? (
        <p className="type-body text-muted">Reading the server's starts…</p>
      ) : starts.isError ? (
        <p className="type-body text-muted">The server's starts could not be read just now.</p>
      ) : (
        <ServerSummary data={starts.data} />
      )}
    </Section>
  );
}

function ServerSummary({ data }) {
  const today = data.days[0];
  const todayTimes = data.starts
    .filter((start) => start.businessDate === today?.businessDate)
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))
    .map((start) => formatTimeIst(start.startedAt));
  const counts = [...data.days].reverse().map((day) => day.starts);

  return (
    <div className="grid gap-2">
      <p className="type-body">
        {todayTimes.length === 0
          ? 'Not started yet today.'
          : `Started ${todayTimes.length} ${todayTimes.length === 1 ? 'time' : 'times'} today, at ${joinAnd(todayTimes)}.`}{' '}
        Last {counts.length} days: <span className="type-num-meta">{counts.join(', ')}</span>.
      </p>
      {data.sleptInWorkingHours.length > 0 && (
        <p className="type-body rounded-lg border border-open bg-open-tint px-3 py-2">
          The server went to sleep during working hours on {joinAnd(data.sleptInWorkingHours.map(dayLabel))}. Check the pingers in
          docs/DEPLOYMENT.md section 14.
        </p>
      )}
    </div>
  );
}
