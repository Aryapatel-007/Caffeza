/**
 * How the backups are doing, for the owner. P54 Part G, API-CONTRACT "P54".
 *
 * Read from the server's own records: the server key cannot list the bucket,
 * so the storage figure is counted from what was uploaded. Nothing here is
 * about any restaurant.
 */
import { config } from '../../config/env.js';
import { BACKUP_FOLDERS, BACKUP_KINDS, BACKUP_STATUSES, BackupRun } from '../../models/BackupRun.js';
import { BACKUP_STATE_IDS, BackupState, FULL_COPIES } from '../../models/BackupState.js';
import { nowUtc } from '../../utils/time.js';
import { diaryStatus } from './backupService.js';
import { ATLAS_M0_LIMIT_BYTES, B2_FREE_BYTES, KEEP_DAYS, LATE_SNAPSHOT_MS, LATE_WAITING_MS } from './constants.js';

const DAY_MS = 24 * 3600_000;

// Tests only: backups are always off under NODE_ENV=test, and the owner's alert needs them on.
let enabledForTests = null;
export function setBackupsEnabledForTests(value) {
  if (!config.isTest) throw new Error('setBackupsEnabledForTests is for tests only.');
  enabledForTests = value;
}

async function sumBytes(match) {
  const [row] = await BackupRun.aggregate([{ $match: match }, { $group: { _id: null, bytes: { $sum: '$bytes' } } }]);
  return row?.bytes ?? 0;
}

/** The storage estimate: rolling folders inside their keep time, plus everything kept forever. */
export async function storageEstimate(now) {
  const ok = { status: BACKUP_STATUSES.OK, objectKey: { $ne: null } };
  const [sixHour, daily, state, last30DaysBytes] = await Promise.all([
    sumBytes({ ...ok, folder: BACKUP_FOLDERS.SIX_HOURS, startedAt: { $gte: new Date(now - KEEP_DAYS['6h'] * DAY_MS) } }),
    sumBytes({ ...ok, folder: BACKUP_FOLDERS.DAILY, startedAt: { $gte: new Date(now - KEEP_DAYS.daily * DAY_MS) } }),
    BackupState.findById(BACKUP_STATE_IDS.STORAGE).lean(),
    sumBytes({ ...ok, folder: { $in: [BACKUP_FOLDERS.MONTHLY, BACKUP_FOLDERS.JOURNAL] }, startedAt: { $gte: new Date(now - 30 * DAY_MS) } }),
  ]);
  return { estimatedBytes: sixHour + daily + (state?.foreverBytes ?? 0), freeBytes: B2_FREE_BYTES, last30DaysBytes };
}

/** GET /system/backups. `enabled` and `diary` are for the tests. */
export async function backupStatus({ now = nowUtc(), enabled = enabledForTests ?? config.backupsOn, diary = diaryStatus() } = {}) {
  const off = {
    enabled: false,
    lastSnapshot: null,
    lastJournalFlush: null,
    behindSeconds: null,
    gapSince: null,
    failuresLast7Days: 0,
    database: { bytes: 0, limitBytes: ATLAS_M0_LIMIT_BYTES },
    fullCopies: FULL_COPIES.EVERY_6_HOURS,
    storage: { estimatedBytes: 0, freeBytes: B2_FREE_BYTES, last30DaysBytes: 0 },
    state: 'OFF',
  };
  if (!enabled) return off;

  // A slow-down note is a row with no file; it is not a copy.
  const copies = { kind: BACKUP_KINDS.SNAPSHOT, $or: [{ objectKey: { $ne: null } }, { status: { $ne: BACKUP_STATUSES.OK } }] };
  const [lastSnapshot, lastGood, lastFlush, lastJournal, journal, snapshots, failures, storage] = await Promise.all([
    BackupRun.findOne(copies).sort({ startedAt: -1 }).lean(),
    BackupRun.findOne({ kind: BACKUP_KINDS.SNAPSHOT, status: BACKUP_STATUSES.OK, objectKey: { $ne: null } }).sort({ startedAt: -1 }).lean(),
    BackupRun.findOne({ kind: BACKUP_KINDS.JOURNAL, status: BACKUP_STATUSES.OK }).sort({ startedAt: -1 }).lean(),
    BackupRun.findOne({ kind: BACKUP_KINDS.JOURNAL }).sort({ startedAt: -1 }).lean(),
    BackupState.findById(BACKUP_STATE_IDS.JOURNAL).lean(),
    BackupState.findById(BACKUP_STATE_IDS.SNAPSHOTS).lean(),
    BackupRun.countDocuments({ status: BACKUP_STATUSES.FAILED, startedAt: { $gte: new Date(now - 7 * DAY_MS) } }),
    storageEstimate(now),
  ]);

  const fullCopies = snapshots?.fullCopies ?? FULL_COPIES.EVERY_6_HOURS;
  const oldestWaiting = diary.oldestWaitingAt ? new Date(diary.oldestWaitingAt) : null;
  const copyRunning = lastSnapshot?.status === BACKUP_STATUSES.RUNNING;
  const goodAt = lastGood ? new Date(lastGood.finishedAt ?? lastGood.startedAt) : null;

  let state = 'OK';
  if (lastSnapshot?.status === BACKUP_STATUSES.FAILED || lastJournal?.status === BACKUP_STATUSES.FAILED || journal?.gapSince) state = 'FAILING';
  else if ((oldestWaiting && now - oldestWaiting > LATE_WAITING_MS) || (!copyRunning && (!goodAt || now - goodAt > LATE_SNAPSHOT_MS[fullCopies]))) state = 'LATE';

  return {
    enabled: true,
    lastSnapshot: lastSnapshot ? { at: lastSnapshot.finishedAt ?? lastSnapshot.startedAt, status: lastSnapshot.status, bytes: lastSnapshot.bytes } : null,
    lastJournalFlush: lastFlush ? { at: lastFlush.finishedAt ?? lastFlush.startedAt, eventCount: lastFlush.eventCount } : null,
    behindSeconds: oldestWaiting ? Math.max(0, Math.round((now - oldestWaiting) / 1000)) : 0,
    gapSince: journal?.gapSince ?? null,
    failuresLast7Days: failures,
    database: { bytes: lastGood?.databaseBytes ?? 0, limitBytes: ATLAS_M0_LIMIT_BYTES },
    fullCopies,
    storage,
    state,
  };
}

/** For R1 Today: since when backups have been behind, or null when they are fine. */
export async function backupAlert(now = nowUtc()) {
  const status = await backupStatus({ now });
  if (status.state !== 'LATE' && status.state !== 'FAILING') return null;
  const times = [status.lastJournalFlush?.at, status.lastSnapshot?.status === 'OK' ? status.lastSnapshot.at : null].filter(Boolean).map((at) => new Date(at));
  return { state: status.state, since: times.length ? new Date(Math.max(...times)) : null };
}
