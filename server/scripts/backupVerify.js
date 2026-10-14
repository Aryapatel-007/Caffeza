/**
 * Checks a restored database. P54 Part E.
 *
 *   npm run backup:verify -- --uri <RESTORED_MONGO_URI> --expect <report file>
 *
 * Counts against the restore's report, the invoice series, and C12 for the
 * last 7 closed days. Reads only. Exits 1 on any failure.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { ArgumentError } from './backupRestore.js';

export function parseArgs(argv) {
  const args = { uri: null, expect: null };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = argv[index].split(/=(.*)/s);
    const value = () => {
      const next = inline ?? argv[(index += 1)];
      if (next === undefined) throw new ArgumentError(`${flag} needs a value.`);
      return next;
    };
    if (flag === '--uri') args.uri = value();
    else if (flag === '--expect') args.expect = value();
    else throw new ArgumentError(`Unknown argument ${argv[index]}. Use --uri and --expect.`);
  }
  if (!args.uri) throw new ArgumentError('Say which database to check with --uri.');
  return args;
}

/** Prints a verification's sections. */
export function printVerification(result) {
  for (const section of result.sections) {
    console.log(`${section.problems.length === 0 ? 'ok  ' : 'FAIL'} ${section.name}`);
    for (const problem of section.problems) console.log(`       ${problem}`);
  }
  console.log(result.ok ? '\nThe restored database checks out.' : '\nThe restored database does NOT check out.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mongoose = (await import('mongoose')).default;
  const { verifyDatabase } = await import('../services/backup/verifyService.js');
  const expected = args.expect ? JSON.parse(readFileSync(args.expect, 'utf8')).expected : null;
  await mongoose.connect(args.uri, { serverSelectionTimeoutMS: 15_000 });
  try {
    const result = await verifyDatabase({ expected });
    printVerification(result);
    return result.ok;
  } finally {
    await mongoose.disconnect();
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
