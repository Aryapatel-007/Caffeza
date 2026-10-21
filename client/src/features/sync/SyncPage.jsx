import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { listSyncConflicts, markSyncConflictSeen } from '../../api/sync.js';
import Button from '../../components/ui/Button.jsx';
import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import { formatDateIst, formatTimeIst } from '../../utils/formatDate.js';
import { durationWords } from '../network/networkCopy.js';
import { useSyncStatus } from './useSyncStatus.js';

const SIDE = { BOX: 'the cafe PC', CLOUD: 'the website' };
const KIND = {
  EDITED_BOTH: 'Changed on both',
  SAME_SLOT: 'Taken on both',
  DELETED_HERE: 'Removed on one, changed on the other',
};

/**
 * Sync. P63, for OWNER and MANAGER.
 *
 * How far the cafe PC and the website are in step, and the sync conflicts:
 * things both changed, or both took, before they could tell each other. Each
 * says what was kept; the fix itself is made on the ordinary screens, which
 * each conflict links to, and Mark as seen says a person has dealt with it.
 */
export default function SyncPage() {
  const [showSeen, setShowSeen] = useState(false);
  const status = useSyncStatus();
  const conflicts = useQuery({ queryKey: ['sync', 'conflicts', showSeen], queryFn: () => listSyncConflicts({ seen: showSeen }) });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <header>
        <h1 className="type-title">Sync</h1>
        <p className="type-body text-muted">The cafe PC and the website, kept in step.</p>
      </header>
      <StatusCard status={status} />
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="type-label">{showSeen ? 'Conflicts already seen' : 'Sync conflicts to check'}</h2>
          <Button size="sm" variant="quiet" onClick={() => setShowSeen((value) => !value)}>
            {showSeen ? 'Show the ones to check' : 'Show the ones seen'}
          </Button>
        </div>
        {conflicts.isError && <ErrorMessage error={conflicts.error} />}
        {conflicts.isLoading && <p className="type-body text-muted">Reading…</p>}
        {conflicts.data && conflicts.data.data.length === 0 && (
          <p className="type-body text-muted">{showSeen ? 'None yet.' : 'Nothing to check. Everything the PC and the website did fitted together.'}</p>
        )}
        <ul className="flex flex-col divide-y divide-line">
          {(conflicts.data?.data ?? []).map((conflict) => <ConflictRow key={conflict.id} conflict={conflict} />)}
        </ul>
      </section>
    </div>
  );
}

function StatusCard({ status }) {
  const data = status?.data;
  if (!status) {
    return (
      <section className="rounded-xl border border-line bg-surface p-4">
        <p className="type-body">Two-way sync is off on this server. The cafe PC and the website are not both taking bills.</p>
      </section>
    );
  }
  if (status.isError) return <ErrorMessage error={status.error} />;
  if (!data) return <p className="type-body text-muted">Reading…</p>;

  const isBox = data.node === 'BOX';
  let state = 'ok';
  let word = 'In step';
  let line;
  if (isBox) {
    const waiting = data.pushed?.waiting ?? 0;
    if (data.lastError && waiting > 0) {
      state = 'alert';
      word = 'Cannot reach the website';
    } else if (waiting > 0) {
      state = 'open';
      word = 'Catching up';
    }
    line = waiting > 0
      ? `${waiting} change${waiting === 1 ? '' : 's'} from this PC waiting to reach the website${data.pushed.secondsBehind ? `, the oldest ${durationWords(data.pushed.secondsBehind)} old` : ''}. They go as soon as the internet is back; billing here carries on.`
      : `Everything from this PC has reached the website. Last heard from the website ${data.pulled?.at ? `at ${formatTimeIst(data.pulled.at)}` : 'not yet'}.`;
  } else {
    const ago = data.boxSecondsAgo;
    if (ago === null || ago > 120) {
      state = 'open';
      word = 'The cafe PC is away';
    }
    line = ago === null
      ? 'The cafe PC has not connected yet. Bills made here use the website series (W).'
      : `The cafe PC last checked in ${durationWords(ago)} ago. While it is away, both keep billing; they catch up when it is back.`;
  }
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <StateChip state={state} word={word} />
        <span className="type-caption text-muted">This is {isBox ? 'the cafe PC' : 'the website'}</span>
      </div>
      <p className="type-body mt-2">{line}</p>
      {data.lastError && <p className="type-caption mt-1 text-muted">Last problem: {data.lastError}</p>}
    </section>
  );
}

function ConflictRow({ conflict }) {
  const queryClient = useQueryClient();
  const seen = useMutation({
    mutationFn: () => markSyncConflictSeen(conflict.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sync'] }),
  });
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="type-heading">{conflict.title}</span>
        <span className="type-caption text-muted">
          {formatDateIst(conflict.detectedAt)} {formatTimeIst(conflict.detectedAt)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StateChip state="open" word={KIND[conflict.kind] ?? conflict.kind} size="sm" />
        <span className="type-caption text-muted">Kept from {SIDE[conflict.keptFrom] ?? conflict.keptFrom}</span>
        {conflict.fields.length > 0 && <span className="type-caption text-muted">· {conflict.fields.join(', ')}</span>}
      </div>
      {conflict.detail && <p className="type-body">{conflict.detail}</p>}
      <div className="flex flex-wrap gap-2">
        {conflict.link && (
          <Link to={conflict.link} className="type-label inline-flex min-h-12 items-center rounded-full border border-line px-4 hover:bg-sunken">
            Open it
          </Link>
        )}
        {!conflict.seenAt ? (
          <Button size="sm" variant="secondary" isLoading={seen.isPending} onClick={() => seen.mutate()}>
            Mark as seen
          </Button>
        ) : (
          <span className="type-caption text-muted">Seen{conflict.seenByName ? ` by ${conflict.seenByName}` : ''}</span>
        )}
      </div>
      {seen.isError && <ErrorMessage error={seen.error} />}
    </li>
  );
}
