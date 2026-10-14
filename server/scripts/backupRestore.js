/**
 * Rebuilds the database as it was at a minute. P54 Part E.
 *
 *   npm run backup:restore -- --at "2026-10-14 15:30" --to <TARGET_MONGO_URI>
 *   npm run backup:restore -- --at latest --to <TARGET_MONGO_URI>
 *
 * `--at` is India time, or `latest` for the newest moment backed up. `--to` is
 * a NEW, EMPTY database: it is refused if it has any document, or if it is the
 * live database in MONGO_URI. There is no default target. Reads with the drill
 * key (BACKUP_DRILL_KEY_ID, BACKUP_DRILL_SECRET) and the keys in
 * BACKUP_ENCRYPTION_KEY and BACKUP_OLD_KEYS. Writes a report of the expected
 * counts for `npm run backup:verify -- --expect <file>`.
 * docs/DEPLOYMENT.md section 8, "Restoring for real".
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const REPORT_FILE = path.join(tmpdir(), 'caffeza-restore-report.json');

export class ArgumentError extends Error {}

/** "2026-10-14 15:30" in India time as an instant, or null for `latest`. */
export function parseAt(text) {
  if (text === 'latest') return null;
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})$/.exec(String(text ?? '').trim());
  if (!match) throw new ArgumentError('--at must be an India time like "2026-10-14 15:30", or latest.');
  return new Date(`${match[1]}T${match[2]}:${match[3]}:00+05:30`);
}

/** The arguments, or a plain refusal. Unknown ones are refused, not ignored. */
export function parseArgs(argv) {
  const args = { at: undefined, to: null, report: REPORT_FILE };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = argv[index].split(/=(.*)/s);
    const value = () => {
      const next = inline ?? argv[(index += 1)];
      if (next === undefined) throw new ArgumentError(`${flag} needs a value.`);
      return next;
    };
    if (flag === '--at') args.at = parseAt(value());
    else if (flag === '--to') args.to = value();
    else if (flag === '--report') args.report = value();
    else throw new ArgumentError(`Unknown argument ${argv[index]}. Use --at, --to and, if you like, --report.`);
  }
  if (args.at === undefined) throw new ArgumentError('Say when to restore to with --at "2026-10-14 15:30" (India time), or --at latest.');
  if (!args.to) throw new ArgumentError('Say where to restore to with --to <a new, empty database>. There is no default target.');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { config, backupKeyProblem } = await import('../config/env.js');
  const { drillStorage } = await import('../services/backup/readStorage.js');
  const { restoreBackup } = await import('../services/backup/restoreService.js');
  const { toIst } = await import('../utils/time.js');

  const keys = [config.BACKUP_ENCRYPTION_KEY, ...config.BACKUP_OLD_KEYS].filter(Boolean);
  const problem = keys.map((key) => backupKeyProblem('BACKUP_ENCRYPTION_KEY', key)).find(Boolean);
  if (keys.length === 0 || problem) throw new ArgumentError(problem ?? 'Set BACKUP_ENCRYPTION_KEY to read the backups.');

  const report = await restoreBackup({
    storage: drillStorage(),
    keys,
    targetUri: args.to,
    liveUri: config.MONGO_URI,
    at: args.at,
    log: (line) => console.log(line),
  });
  writeFileSync(args.report, JSON.stringify(report, null, 2));
  console.log('');
  console.log(`Restored to ${toIst(new Date(report.restoredTo))}, in ${report.seconds} seconds.`);
  for (const [name, count] of Object.entries(report.counts)) console.log(`  ${name.padEnd(28)} ${count}`);
  console.log(`\nThe expected counts are in ${args.report}. Next: npm run backup:verify -- --uri <the same URI> --expect ${args.report}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(0),
    (error) => {
      console.error(`\n${error.message}\n`);
      process.exit(1);
    },
  );
}
