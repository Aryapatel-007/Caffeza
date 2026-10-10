/**
 * Copies the whole database to another cluster, for a move between regions.
 * 2026-10-10: Z Chaat's database moved from Atlas Mumbai to Atlas Singapore,
 * next to the server (docs/DEPLOYMENT.md section 15).
 *
 *   SOURCE_MONGO_URI=... TARGET_MONGO_URI=... npm run db:copy -- copy
 *   SOURCE_MONGO_URI=... TARGET_MONGO_URI=... npm run db:copy -- sync
 *   SOURCE_MONGO_URI=... TARGET_MONGO_URI=... npm run db:copy -- verify
 *
 * `copy`   into an empty target: every document of every collection, with its
 *          own _id. Refuses if the target already holds documents.
 * `sync`   the catch-up after the server has moved: inserts what the target
 *          lacks, replaces a document whose source copy is newer by `updatedAt`,
 *          and for `counters` keeps whichever `value` is higher, so a bill
 *          number can never be issued twice. Safe to run again and again.
 * `verify` counts every collection on both sides, and lists the _ids either
 *          side has that the other does not.
 *
 * The source is only ever read. Nothing is deleted anywhere. Indexes are not
 * copied: run `npm run db:indexes` against the target first, so it has exactly
 * the indexes the models declare.
 */
import { MongoClient } from 'mongodb';

const MODES = ['copy', 'sync', 'verify'];
const BATCH = 500;

const hostOf = (uri) => new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'https://')).hostname;
const databaseOf = (uri) => new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'https://')).pathname.replace(/^\//, '') || null;

async function collectionsOf(db) {
  return (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((collection) => collection.name)
    .filter((name) => !name.startsWith('system.'))
    .sort();
}

async function copy(source, target) {
  const lines = [];
  for (const name of await collectionsOf(source)) {
    const existing = await target.collection(name).estimatedDocumentCount();
    if (existing > 0) throw new Error(`The target's ${name} already has ${existing} documents. Use sync, or start from an empty target.`);
  }
  for (const name of await collectionsOf(source)) {
    let copied = 0;
    let batch = [];
    for await (const document of source.collection(name).find({})) {
      batch.push(document);
      if (batch.length === BATCH) {
        await target.collection(name).insertMany(batch, { ordered: true });
        copied += batch.length;
        batch = [];
      }
    }
    if (batch.length > 0) {
      await target.collection(name).insertMany(batch, { ordered: true });
      copied += batch.length;
    }
    lines.push(`${name}: ${copied} copied`);
  }
  return lines;
}

/** Which of two copies of one document should stand on the target. */
export function newerSide(name, sourceDocument, targetDocument) {
  if (name === 'counters') return (sourceDocument.value ?? 0) > (targetDocument.value ?? 0) ? 'source' : 'target';
  const sourceTime = sourceDocument.updatedAt instanceof Date ? sourceDocument.updatedAt.getTime() : null;
  const targetTime = targetDocument.updatedAt instanceof Date ? targetDocument.updatedAt.getTime() : null;
  if (sourceTime !== null && targetTime !== null) return sourceTime > targetTime ? 'source' : 'target';
  return 'target';
}

async function sync(source, target) {
  const lines = [];
  for (const name of await collectionsOf(source)) {
    // What the target holds, read once per collection: only what deciding needs.
    const held = new Map(
      (await target.collection(name).find({}, { projection: { _id: 1, updatedAt: 1, value: 1 } }).toArray()).map((document) => [String(document._id), document]),
    );
    let inserted = 0;
    let replaced = 0;
    for await (const document of source.collection(name).find({})) {
      const current = held.get(String(document._id));
      if (!current) {
        await target.collection(name).insertOne(document);
        inserted += 1;
      } else if (newerSide(name, document, current) === 'source') {
        await target.collection(name).replaceOne({ _id: document._id }, document);
        replaced += 1;
      }
    }
    if (inserted || replaced) lines.push(`${name}: ${inserted} inserted, ${replaced} replaced`);
  }
  return lines.length > 0 ? lines : ['nothing to catch up'];
}

async function verify(source, target) {
  const lines = [];
  let differences = 0;
  const names = [...new Set([...(await collectionsOf(source)), ...(await collectionsOf(target))])].sort();
  for (const name of names) {
    const ids = async (db) => new Set((await db.collection(name).find({}, { projection: { _id: 1 } }).toArray()).map((document) => String(document._id)));
    const [onSource, onTarget] = await Promise.all([ids(source), ids(target)]);
    const missing = [...onSource].filter((id) => !onTarget.has(id));
    const extra = [...onTarget].filter((id) => !onSource.has(id));
    differences += missing.length + extra.length;
    const note = [missing.length ? `${missing.length} missing on the target` : '', extra.length ? `${extra.length} only on the target` : ''].filter(Boolean).join(', ');
    lines.push(`${name}: source ${onSource.size}, target ${onTarget.size}${note ? ` (${note})` : ''}`);
  }
  lines.push(differences === 0 ? 'Every document is on both sides.' : `${differences} documents differ between the two sides.`);
  return lines;
}

async function main() {
  const mode = process.argv[2];
  const { SOURCE_MONGO_URI: sourceUri, TARGET_MONGO_URI: targetUri } = process.env;
  if (!MODES.includes(mode)) throw new Error(`Say what to do: ${MODES.join(', ')}.`);
  if (!sourceUri || !targetUri) throw new Error('Set SOURCE_MONGO_URI and TARGET_MONGO_URI.');
  if (hostOf(sourceUri) === hostOf(targetUri)) throw new Error('The source and the target are the same cluster.');
  const sourceDatabase = databaseOf(sourceUri);
  const targetDatabase = databaseOf(targetUri);
  if (!sourceDatabase || !targetDatabase) throw new Error('Both addresses must name the database, like .../restaurant-erp?...');

  const sourceClient = await MongoClient.connect(sourceUri);
  const targetClient = await MongoClient.connect(targetUri);
  try {
    const source = sourceClient.db(sourceDatabase);
    const target = targetClient.db(targetDatabase);
    console.log(`${mode}: ${hostOf(sourceUri)}/${sourceDatabase} to ${hostOf(targetUri)}/${targetDatabase}`);
    const run = { copy, sync, verify }[mode];
    for (const line of await run(source, target)) console.log(`  ${line}`);
  } finally {
    await sourceClient.close();
    await targetClient.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
