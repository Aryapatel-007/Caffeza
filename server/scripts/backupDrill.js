/**
 * The practice restore. P54 Part F.
 *
 *   npm run backup:drill
 *
 * Starts a throwaway in-memory MongoDB, restores the newest backed-up moment
 * into it with the drill key, and verifies it: counts, the invoice series,
 * and C12 for the last 7 closed days. Exits 1 on any failure, which fails the
 * weekly GitHub run (.github/workflows/backup-drill.yml), so GitHub emails
 * the repository's owner. Never touches the live database.
 */
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** On GitHub there is no .env: the server's own settings the tools load need stand-ins. */
function standIns() {
  process.env.MONGO_URI ??= 'mongodb://127.0.0.1:1/practice-restore-stand-in';
  process.env.JWT_ACCESS_SECRET ??= randomBytes(48).toString('base64');
  process.env.JWT_REFRESH_SECRET ??= randomBytes(48).toString('base64');
  process.env.CLIENT_ORIGIN ??= 'http://localhost:5173';
}

async function main() {
  if (process.argv.length > 2) throw new Error(`Unknown argument ${process.argv[2]}. backup:drill takes none.`);
  standIns();
  const { config, backupKeyProblem } = await import('../config/env.js');
  const mongoose = (await import('mongoose')).default;
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const { drillStorage } = await import('../services/backup/readStorage.js');
  const { restoreBackup } = await import('../services/backup/restoreService.js');
  const { verifyDatabase } = await import('../services/backup/verifyService.js');
  const { printVerification } = await import('./backupVerify.js');
  const { toIst } = await import('../utils/time.js');

  const keys = [config.BACKUP_ENCRYPTION_KEY, ...config.BACKUP_OLD_KEYS].filter(Boolean);
  const problem = keys.map((key) => backupKeyProblem('BACKUP_ENCRYPTION_KEY', key)).find(Boolean);
  if (keys.length === 0 || problem) throw new Error(problem ?? 'Set BACKUP_ENCRYPTION_KEY to read the backups.');

  const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  try {
    const target = replicaSet.getUri('practice-restore');
    const report = await restoreBackup({ storage: drillStorage(), keys, targetUri: target, liveUri: config.MONGO_URI, at: null, log: (line) => console.log(line) });
    console.log(`Restored to ${toIst(new Date(report.restoredTo))} in ${report.seconds} seconds: ${Object.values(report.counts).reduce((a, b) => a + b, 0)} documents in ${Object.keys(report.counts).length} collections.\n`);
    await mongoose.connect(target);
    const result = await verifyDatabase({ expected: report.expected });
    printVerification(result);
    await mongoose.disconnect();
    return result.ok;
  } finally {
    await replicaSet.stop();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (ok) => process.exit(ok ? 0 : 1),
    (error) => {
      console.error(`\n${error.message}\n`);
      process.exit(1);
    },
  );
}
