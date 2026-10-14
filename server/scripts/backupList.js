/**
 * Lists what is in the backup bucket. P54 Part E.
 *
 *   npm run backup:list
 *
 * Full copies and diary files, newest first, in India time, with sizes, and
 * every gap the diary could not cover. Reads with the drill key.
 */
import { pathToFileURL } from 'node:url';

const size = (bytes) => (bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

async function main() {
  if (process.argv.length > 2) throw new Error(`Unknown argument ${process.argv[2]}. backup:list takes none.`);
  const { drillStorage, listObjects } = await import('../services/backup/readStorage.js');
  const { gapWindows, parseListing } = await import('../services/backup/restoreService.js');
  const { toIst } = await import('../utils/time.js');
  const storage = drillStorage();
  const listing = parseListing([...(await listObjects(storage, 'snapshots/')), ...(await listObjects(storage, 'journal/'))]);

  console.log(`\nFull copies (${listing.snapshots.length}), newest first:`);
  for (const copy of [...listing.snapshots].reverse()) console.log(`  ${toIst(copy.at)}  ${copy.folder.padEnd(7)} ${size(copy.bytes).padStart(9)}`);
  const total = listing.journals.reduce((sum, file) => sum + file.bytes, 0);
  console.log(`\nDiary files (${listing.journals.length}, ${size(total)} in all), newest first:`);
  for (const file of [...listing.journals].reverse().slice(0, 30)) console.log(`  ${toIst(file.first)} to ${toIst(file.last)}  ${size(file.bytes).padStart(9)}`);
  if (listing.journals.length > 30) console.log(`  ... and ${listing.journals.length - 30} older`);
  const gaps = gapWindows(listing);
  console.log(gaps.length ? '\nGaps the diary could not cover:' : '\nNo gaps.');
  for (const gap of gaps) console.log(`  from ${toIst(gap.since)} to ${gap.until ? toIst(gap.until) : 'not yet closed by a full copy'}`);
  console.log('');
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
