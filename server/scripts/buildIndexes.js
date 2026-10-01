/**
 * Builds every index the models declare and the database is missing.
 *
 *   npm run db:indexes
 *
 * Run on every deploy, before the server starts. In production the server
 * refuses to start while any declared index is missing (see startServer in
 * server.js), because `autoIndex` is off there and nothing else builds them.
 *
 * It only ever creates. It never drops, renames or rebuilds an index. An index
 * the schemas do not declare is reported and left alone, and an index that
 * cannot be built (duplicates in the data, or a conflicting index of the same
 * name) is reported with what to do about it, by hand.
 *
 * Exit code 0 when everything is in place, 1 when anything failed.
 */
import { pathToFileURL } from 'node:url';

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { config } from '../config/env.js';
import { buildIndexes } from '../services/indexService.js';

function databaseHost() {
  return new URL(
    config.MONGO_URI.replace('mongodb+srv://', 'https://').replace('mongodb://', 'http://'),
  ).hostname;
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 'es'}`;
const pluralS = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** One plain line per collection. */
export function describeRow(row) {
  if (row.error) return `${row.collection}: FAILED. ${row.error}`;

  const parts = [];
  parts.push(row.created.length > 0 ? `created ${row.created.join(', ')}.` : 'nothing to do.');
  parts.push(`${row.alreadyPresent} already present.`);
  if (row.extra.length > 0) parts.push(`Extra index left alone: ${row.extra.join(', ')}.`);
  return `${row.collection}: ${parts.join(' ')}`;
}

export function describeSummary(report) {
  const created = report.reduce((sum, row) => sum + row.created.length, 0);
  const present = report.reduce((sum, row) => sum + row.alreadyPresent, 0);
  const extra = report.reduce((sum, row) => sum + row.extra.length, 0);
  const failures = report.filter((row) => row.error).length;

  return (
    `${pluralS(report.length, 'collection')} checked. ` +
    `${plural(created, 'index')} created. ` +
    `${present} already present. ` +
    `${extra} extra left alone. ` +
    `${pluralS(failures, 'failure')}.`
  );
}

async function main() {
  console.log(`Building indexes against ${databaseHost()}, NODE_ENV=${config.NODE_ENV}`);
  console.log('');

  await connectDatabase();

  try {
    const report = await buildIndexes();
    for (const row of report) console.log(describeRow(row));
    console.log('');
    console.log(describeSummary(report));

    if (report.some((row) => row.error)) process.exitCode = 1;
  } catch (error) {
    console.error('');
    console.error(`Index build failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) await main();
