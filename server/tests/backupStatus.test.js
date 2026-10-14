/**
 * P54 Part G: GET /system/backups, its four states, the storage estimate,
 * and the owner's Today alert.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { BACKUP_KINDS, BACKUP_STATUSES, BackupRun } from '../models/BackupRun.js';
import { BACKUP_STATE_IDS, BackupState } from '../models/BackupState.js';
import { ALL_MODELS } from '../models/index.js';
import { backupStatus, setBackupsEnabledForTests, storageEstimate } from '../services/backup/statusService.js';
import { seedTeam } from './helpers/m2Fixtures.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const NOW = new Date('2026-10-14T10:00:00Z');
const ago = (minutes) => new Date(NOW.getTime() - minutes * 60_000);
const quiet = { waiting: 0, waitingBytes: 0, oldestWaitingAt: null, watching: true };

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
});
after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});
beforeEach(async () => {
  await clearTestDatabase();
  await BackupRun.collection.deleteMany({});
  await BackupState.collection.deleteMany({});
});
afterEach(() => setBackupsEnabledForTests(null));

const copy = (minutes, extra = {}) => ({ kind: BACKUP_KINDS.SNAPSHOT, status: BACKUP_STATUSES.OK, startedAt: ago(minutes + 2), finishedAt: ago(minutes), objectKey: `snapshots/6h/${minutes}`, folder: '6h', bytes: 1000, databaseBytes: 18 * 1024 ** 2, ...extra });
const flush = (minutes, extra = {}) => ({ kind: BACKUP_KINDS.JOURNAL, status: BACKUP_STATUSES.OK, startedAt: ago(minutes), finishedAt: ago(minutes), objectKey: `journal/${minutes}`, folder: 'journal', bytes: 10, eventCount: 3, ...extra });

describe('GET /system/backups', () => {
  it('answers the owner, and refuses every other role', async () => {
    const team = await seedTeam();
    const answer = await request('GET', '/api/v1/system/backups', { token: team.tokens.OWNER });
    assert.equal(answer.status, 200);
    assert.equal(answer.body.data.state, 'OFF', 'backups are off under test');
    for (const role of ['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'STOREKEEPER']) {
      assert.equal((await request('GET', '/api/v1/system/backups', { token: team.tokens[role] })).status, 403, role);
    }
    assert.equal((await request('GET', '/api/v1/system/backups')).status, 401);
  });
});

describe('the backup state', () => {
  it('is OK with a recent copy and diary, and OFF when backups are off', async () => {
    await BackupRun.create([copy(60), flush(2)]);
    const status = await backupStatus({ now: NOW, enabled: true, diary: quiet });
    assert.equal(status.state, 'OK');
    assert.equal(status.database.limitBytes, 512 * 1024 ** 2);
    assert.equal(status.lastJournalFlush.eventCount, 3);
    assert.equal((await backupStatus({ now: NOW, enabled: false, diary: quiet })).state, 'OFF');
  });

  it('is LATE with no copy in 7 hours, or a change waiting over 15 minutes', async () => {
    await BackupRun.create([copy(8 * 60), flush(2)]);
    assert.equal((await backupStatus({ now: NOW, enabled: true, diary: quiet })).state, 'LATE');
    await BackupRun.create(copy(30));
    assert.equal((await backupStatus({ now: NOW, enabled: true, diary: { ...quiet, waiting: 4, oldestWaitingAt: ago(16) } })).state, 'LATE');
    const fine = await backupStatus({ now: NOW, enabled: true, diary: { ...quiet, waiting: 4, oldestWaitingAt: ago(2) } });
    assert.equal(fine.state, 'OK');
    assert.equal(fine.behindSeconds, 120);
  });

  it('is LATE only after 25 hours when copies are once a day', async () => {
    await BackupState.collection.insertOne({ _id: BACKUP_STATE_IDS.SNAPSHOTS, fullCopies: 'DAILY' });
    await BackupRun.create([copy(20 * 60), flush(2)]);
    const status = await backupStatus({ now: NOW, enabled: true, diary: quiet });
    assert.equal(status.state, 'OK');
    assert.equal(status.fullCopies, 'DAILY');
  });

  it('is FAILING when the last run of either kind failed, or the diary has a gap', async () => {
    await BackupRun.create([copy(60), flush(5), { kind: BACKUP_KINDS.JOURNAL, status: BACKUP_STATUSES.FAILED, startedAt: ago(1), error: 'Upload failed' }]);
    const failing = await backupStatus({ now: NOW, enabled: true, diary: quiet });
    assert.equal(failing.state, 'FAILING');
    assert.equal(failing.failuresLast7Days, 1);
    await BackupRun.create(flush(0));
    assert.equal((await backupStatus({ now: NOW, enabled: true, diary: quiet })).state, 'OK');
    await BackupState.collection.insertOne({ _id: BACKUP_STATE_IDS.JOURNAL, gapSince: ago(10) });
    assert.equal((await backupStatus({ now: NOW, enabled: true, diary: quiet })).state, 'FAILING');
  });

  it('counts storage only inside each folder keep time, and monthly copies and the diary forever', async () => {
    const day = 24 * 60;
    await BackupRun.create([
      copy(12 * day, { folder: '6h', bytes: 1 }), // gone: 6-hour copies are kept 10 days
      copy(5 * day, { folder: '6h', bytes: 10 }),
      copy(100 * day, { folder: 'daily', bytes: 100 }), // gone: daily copies are kept 90 days
      copy(30 * day, { folder: 'daily', bytes: 1000 }),
      copy(20 * day, { folder: 'monthly', bytes: 10000 }),
      flush(3 * day, { bytes: 100000 }),
    ]);
    // Every monthly copy and diary file ever, including those whose runs have expired.
    await BackupState.collection.insertOne({ _id: BACKUP_STATE_IDS.STORAGE, foreverBytes: 5_000_000 });
    const storage = await storageEstimate(NOW);
    assert.equal(storage.estimatedBytes, 10 + 1000 + 5_000_000);
    assert.equal(storage.last30DaysBytes, 10000 + 100000);
    assert.equal(storage.freeBytes, 10_000_000_000);
  });
});

describe("Today's backup alert", () => {
  it('shows for the owner only, and only when backups are LATE or FAILING', async () => {
    const team = await seedTeam();
    const alerts = async (token) => (await request('GET', '/api/v1/reports/v2/today', { token })).body.data.sections.find((entry) => entry.key === 'alerts').rows;
    setBackupsEnabledForTests(true);
    await BackupRun.create([copy(30, { finishedAt: new Date(Date.now() - 30 * 60_000), startedAt: new Date(Date.now() - 32 * 60_000) }), flush(0, { startedAt: new Date(), finishedAt: new Date() })]);
    assert.deepEqual((await alerts(team.tokens.OWNER)).filter((row) => row.kind === 'Backup'), [], 'nothing while OK');

    await BackupRun.create({ kind: BACKUP_KINDS.JOURNAL, status: BACKUP_STATUSES.FAILED, startedAt: new Date(), error: 'Upload failed' });
    const owner = (await alerts(team.tokens.OWNER)).filter((row) => row.kind === 'Backup');
    assert.equal(owner.length, 1);
    assert.match(owner[0].detail, /^Backups have stopped since \d{1,2}:\d{2} [AP]M\.$/);
    assert.equal(owner[0].link, '/settings');
    assert.deepEqual((await alerts(team.tokens.MANAGER)).filter((row) => row.kind === 'Backup'), [], 'not for a manager');
  });
});
