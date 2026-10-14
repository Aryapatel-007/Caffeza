import { useQuery } from '@tanstack/react-query';

import { getServerBackups } from '../../api/system.js';
import { formatAgo, formatBytes, formatDecimalGb } from '../../utils/formatBytes.js';
import { formatTimeIst } from '../../utils/formatDate.js';

const ALERT = 'type-body rounded-lg border border-alert bg-alert-tint px-3 py-2';
const NEARLY_FULL_BYTES = 7_000_000_000;

/** "about 3 years", from the space left and what the kept-forever files add a month. */
function yearsLeft(storage) {
  if (!storage.last30DaysBytes) return null;
  const years = (storage.freeBytes - storage.estimatedBytes) / (storage.last30DaysBytes * 12);
  if (years > 100) return 'more than 100 years';
  if (years < 1) return 'less than a year';
  return `about ${Math.round(years)} ${Math.round(years) === 1 ? 'year' : 'years'}`;
}

/** The one sentence that says what is wrong. */
function problemSentence(data) {
  if (data.gapSince) return `The change diary lost its place at ${formatTimeIst(data.gapSince)}; a full copy is being taken to start again.`;
  if (data.state === 'FAILING') return 'The last backup failed. It is tried again by itself.';
  if (data.behindSeconds > 15 * 60) return `Changes have waited ${Math.round(data.behindSeconds / 60)} minutes to be saved.`;
  return data.lastSnapshot ? `No full copy since ${formatTimeIst(data.lastSnapshot.at)}.` : 'No full copy has been taken yet.';
}

/**
 * The Backups part of the owner's Server card. P54, API-CONTRACT "P54".
 * Every word is from GLOSSARY section 37.
 */
export default function ServerBackups() {
  const backups = useQuery({ queryKey: ['system', 'backups'], queryFn: getServerBackups, refetchInterval: 60_000 });
  if (backups.isPending) return <p className="type-body text-muted">Reading the backups…</p>;
  if (backups.isError) return <p className="type-body text-muted">The backups could not be read just now.</p>;

  const data = backups.data;
  if (data.state === 'OFF') return <p className="type-body">Backups are switched off.</p>;

  const lastSaved = [data.lastJournalFlush?.at, data.lastSnapshot?.status === 'OK' ? data.lastSnapshot.at : null]
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];
  const used = data.database.bytes / data.database.limitBytes;
  const years = yearsLeft(data.storage);

  return (
    <div className="grid gap-2">
      {data.state === 'OK' ? (
        <p className="type-body">
          {lastSaved ? `Backed up ${formatAgo(lastSaved)}.` : 'Backed up.'} {data.lastSnapshot ? `Full copy at ${formatTimeIst(data.lastSnapshot.at)}.` : ''} Database uses{' '}
          {formatBytes(data.database.bytes)} of {formatBytes(data.database.limitBytes)}.
        </p>
      ) : (
        <p className={ALERT}>
          {problemSentence(data)} See docs/DEPLOYMENT.md section 8.
        </p>
      )}
      {used >= 0.7 && (
        <p className={ALERT}>
          The database is getting full: {formatBytes(data.database.bytes)} of {formatBytes(data.database.limitBytes)}. Plan a bigger Atlas tier or an archive before it reaches{' '}
          {formatBytes(data.database.limitBytes)}.
        </p>
      )}
      {data.fullCopies === 'DAILY' && (
        <p className="type-body">Full copies once a day, to stay inside Atlas&apos;s free limits. Every change is still saved every 5 minutes.</p>
      )}
      {data.storage.estimatedBytes >= NEARLY_FULL_BYTES ? (
        <p className={ALERT}>Backup storage is nearly full. See DEPLOYMENT.md section 8.</p>
      ) : (
        <p className="type-caption text-muted">
          Backup storage: about {formatBytes(data.storage.estimatedBytes)} of {formatDecimalGb(data.storage.freeBytes)} free.
          {years ? ` At this rate, the free ${formatDecimalGb(data.storage.freeBytes)} lasts ${years}.` : ''}
        </p>
      )}
    </div>
  );
}
