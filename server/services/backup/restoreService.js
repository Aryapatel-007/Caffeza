/**
 * Rebuilding the database from the bucket. P54 Part E.
 *
 * Run by a developer, or the weekly practice restore, never by the server: it
 * reads with the drill key through readStorage.js. It writes only into an
 * empty database that is not the live one, and only after every file it needs
 * has been downloaded and proved, so a wrong key or a changed byte writes
 * nothing at all.
 *
 * The plan: the newest full copy that started before the time asked, then the
 * diary from that copy's own cluster time up to the time asked, in cluster
 * time order. Insert, update and replace become replaceOne with upsert, using
 * the full document; delete becomes deleteOne; so a change replayed twice, or
 * one already inside the copy, changes nothing. A transaction is all in or all
 * out. A time inside a gap is refused, naming the nearest times that work.
 */
import { rm } from 'node:fs/promises';

import mongoose from 'mongoose';

import { ALL_MODELS } from '../../models/index.js';
import { toIst } from '../../utils/time.js';
import { openPacked, tempPath } from './pack.js';
import { downloadTo, listObjects } from './readStorage.js';
import { parseKeyTime } from './snapshotService.js';

const { EJSON } = mongoose.mongo.BSON;
const BATCH = 500;
const JOURNAL_MARGIN_MS = 60_000;

export class RestoreRefused extends Error {}

const SNAPSHOT_KEY = /^snapshots\/(monthly|daily|6h)\/.*\/([0-9T:.Z-]+)\.snap\.gz\.enc$/;
const JOURNAL_KEY = /^journal\/.*\/([0-9T.Z-]+)_([0-9T.Z-]+)\.jrn\.gz\.enc$/;
const GAP_KEY = /^journal\/.*\/([0-9T.Z-]+)\.gap\.enc$/;

/** The bucket's objects as copies, diary files and gaps, each with its times. */
export function parseListing(objects) {
  const snapshots = [];
  const journals = [];
  const gaps = [];
  for (const object of objects) {
    let match = SNAPSHOT_KEY.exec(object.key);
    if (match) {
      snapshots.push({ key: object.key, folder: match[1], at: parseKeyTime(match[2]), bytes: object.bytes });
      continue;
    }
    match = JOURNAL_KEY.exec(object.key);
    if (match) {
      journals.push({ key: object.key, first: parseKeyTime(match[1]), last: parseKeyTime(match[2]), bytes: object.bytes });
      continue;
    }
    match = GAP_KEY.exec(object.key);
    if (match) gaps.push({ key: object.key, since: parseKeyTime(match[1]) });
  }
  const byTime = (field) => (a, b) => a[field] - b[field];
  return { snapshots: snapshots.sort(byTime('at')), journals: journals.sort(byTime('first')), gaps: gaps.sort(byTime('since')) };
}

/** Each gap with its end: the first full copy that started at or after it, or null while none has. */
export function gapWindows(listing) {
  return listing.gaps.map((gap) => ({ since: gap.since, until: listing.snapshots.find((copy) => copy.at >= gap.since)?.at ?? null }));
}

/** What a restore to `at` (a Date, or null for the newest moment) would read, or why it cannot. Pure. */
export function planRestore(listing, at) {
  const target = at ? at.getTime() : Infinity;
  for (const gap of gapWindows(listing)) {
    if (target >= gap.since.getTime() && (gap.until === null || target < gap.until.getTime())) {
      const after = gap.until ? `, or from ${toIst(gap.until)} on` : '';
      throw new RestoreRefused(
        `The change diary has a gap from ${toIst(gap.since)}${gap.until ? ` to ${toIst(gap.until)}` : ' that no full copy has closed yet'}, so ${at ? toIst(at) : 'the newest moment'} cannot be rebuilt. ` +
          `The nearest times it can restore to: just before ${toIst(gap.since)}${after}.`,
      );
    }
  }
  const snapshot = [...listing.snapshots].reverse().find((copy) => copy.at.getTime() <= target);
  if (!snapshot) throw new RestoreRefused(`There is no full copy from before ${at ? toIst(at) : 'now'}, so there is nothing to restore from.`);
  const journals = listing.journals.filter((file) => file.last.getTime() >= snapshot.at.getTime() - JOURNAL_MARGIN_MS && file.first.getTime() <= target);
  return { snapshot, journals };
}

/** "host1,host2/db" of a connection string, to tell two databases apart. */
export function databaseOf(uri) {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)(?:\/([^?]*))?/i.exec(String(uri ?? ''));
  if (!match) return null;
  const hosts = match[1].toLowerCase().split(',').sort().join(',');
  return `${hosts}/${match[2] || 'test'}`;
}

const compareTimestamps = (a, b) => a.t - b.t || a.i - b.i;
const eventAt = (event) => (event.wallTime ? event.wallTime.getTime() : event.clusterTime.t * 1000);
const txnOf = (event) => (event.lsid && event.txnNumber !== null && event.txnNumber !== undefined ? `${EJSON.stringify(event.lsid)}:${String(event.txnNumber)}` : null);
const idKey = (id) => EJSON.stringify(id, { relaxed: false });

/**
 * The changes to replay, in order, and the transactions left out because the
 * time asked falls inside them. Pure.
 */
export function eventsToReplay(events, fromClusterTime, at) {
  const target = at ? at.getTime() : Infinity;
  const after = events.filter((event) => compareTimestamps(event.clusterTime, fromClusterTime) >= 0);
  const beyond = new Set(after.filter((event) => eventAt(event) > target && txnOf(event)).map(txnOf));
  const kept = after
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => eventAt(event) <= target && !beyond.has(txnOf(event)))
    .sort((a, b) => compareTimestamps(a.event.clusterTime, b.event.clusterTime) || a.index - b.index)
    .map(({ event }) => event);
  const leftOut = [...beyond].filter((txn) => after.some((event) => txnOf(event) === txn && eventAt(event) <= target));
  return { events: kept, transactionsLeftOut: leftOut.length };
}

/** Applies changes to `db`, updating `ids` (a Map of collection to a Set of ids). */
export async function applyEvents(db, events, ids) {
  let applied = 0;
  for (const event of events) {
    if (!event.coll) continue;
    const set = ids.get(event.coll) ?? new Set();
    ids.set(event.coll, set);
    const collection = db.collection(event.coll);
    if (event.op === 'delete') {
      await collection.deleteOne({ _id: event._id });
      set.delete(idKey(event._id));
      applied += 1;
    } else if (['insert', 'update', 'replace'].includes(event.op) && event.doc) {
      await collection.replaceOne({ _id: event._id }, event.doc, { upsert: true });
      set.add(idKey(event._id));
      applied += 1;
    }
  }
  return applied;
}

async function assertEmpty(db) {
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith('system.')) continue;
    if ((await db.collection(name).countDocuments({}, { limit: 1 })) > 0) {
      throw new RestoreRefused(`The target database is not empty: ${name} has documents. Restore only into a new, empty database.`);
    }
  }
}

/** Builds every declared index on `connection`, as `npm run db:indexes` does. It only ever creates. */
export async function buildIndexesOn(connection) {
  for (const model of ALL_MODELS) {
    await connection.model(model.modelName, model.schema, model.collection.collectionName).createIndexes();
  }
}

/**
 * Restores into `targetUri`. Options: storage (the drill storage), keys (the
 * current and retired keys), at (a Date, or null for the newest moment),
 * liveUri (refused as a target), indexes (build them, default true), log.
 * Gives back a report: the time restored to, counts and the expected counts.
 */
export async function restoreBackup({ storage, keys, targetUri, liveUri, at = null, indexes = true, log = () => {} }) {
  const started = Date.now();
  if (!targetUri) throw new RestoreRefused('Say where to restore to with --to. There is no default target.');
  if (liveUri && databaseOf(targetUri) && databaseOf(targetUri) === databaseOf(liveUri)) {
    throw new RestoreRefused('The target is the live database (the same host and database as MONGO_URI). Never restore into the live database: make a new, empty one.');
  }

  const listing = parseListing([...(await listObjects(storage, 'snapshots/')), ...(await listObjects(storage, 'journal/'))]);
  const plan = planRestore(listing, at);

  const connection = await mongoose.createConnection(targetUri, { serverSelectionTimeoutMS: 15_000 }).asPromise();
  const downloads = [];
  const opened = [];
  try {
    const db = connection.db;
    await assertEmpty(db);

    // Every file, downloaded and proved, before anything is written.
    for (const file of [plan.snapshot, ...plan.journals]) {
      const local = tempPath('.enc');
      downloads.push(local);
      await downloadTo(storage, file.key, local);
      opened.push(await openPacked(local, keys));
    }
    log(`Full copy ${plan.snapshot.key}, and ${plan.journals.length} diary file(s).`);

    const ids = new Map();
    let manifest = null;
    const pending = new Map();
    const flushCollection = async (name) => {
      const batch = pending.get(name);
      if (batch?.length) await db.collection(name).insertMany(batch, { ordered: false });
      pending.set(name, []);
    };
    for await (const line of opened[0].lines()) {
      const record = EJSON.parse(line, { relaxed: false });
      if (record.manifest) {
        manifest = record.manifest;
        continue;
      }
      const batch = pending.get(record.c) ?? [];
      batch.push(record.d);
      pending.set(record.c, batch);
      const set = ids.get(record.c) ?? new Set();
      set.add(idKey(record.d._id));
      ids.set(record.c, set);
      if (batch.length >= BATCH) await flushCollection(record.c);
    }
    for (const name of pending.keys()) await flushCollection(name);
    if (!manifest) throw new RestoreRefused(`${plan.snapshot.key} has no manifest: the copy is incomplete.`);
    for (const { name } of manifest.collections) {
      if (!ids.has(name)) {
        ids.set(name, new Set());
        await db.createCollection(name).catch(() => {});
      }
    }

    const events = [];
    for (const file of opened.slice(1)) {
      for await (const line of file.lines()) events.push(EJSON.parse(line, { relaxed: false }));
    }
    const replay = eventsToReplay(events, manifest.fromClusterTime, at);
    const applied = await applyEvents(db, replay.events, ids);
    if (replay.transactionsLeftOut) log(`${replay.transactionsLeftOut} transaction(s) straddle the time asked and were left out whole.`);

    if (indexes) await buildIndexesOn(connection);

    const counts = {};
    const expected = {};
    for (const [name, set] of [...ids.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      counts[name] = await db.collection(name).countDocuments();
      expected[name] = set.size;
    }
    const lastApplied = replay.events.at(-1);
    return {
      restoredTo: at ?? (lastApplied ? new Date(eventAt(lastApplied)) : plan.snapshot.at),
      snapshot: plan.snapshot.key,
      journalFiles: plan.journals.length,
      eventsApplied: applied,
      transactionsLeftOut: replay.transactionsLeftOut,
      counts,
      expected,
      seconds: Math.round((Date.now() - started) / 100) / 10,
    };
  } finally {
    for (const file of opened) await file.remove();
    for (const local of downloads) await rm(local, { force: true });
    await connection.close();
  }
}
