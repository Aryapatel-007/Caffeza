/**
 * Copies one restaurant's menu and floor from another database into this one.
 * P62, for bringing a cafe's real setup onto a box.
 *
 *   SOURCE_MONGO_URI="mongodb+srv://..." npm run copy:menu -- --source "Z Chaat" --target-phone 9000000001
 *   SOURCE_MONGO_URI="mongodb+srv://..." npm run copy:menu -- --source "Z Chaat" --target-phone 9000000001 --apply
 *
 * READS ONLY from the source: it runs `find` and nothing else there. The source
 * address comes from the environment, never the command line, so it does not
 * land in the shell history.
 *
 * Copies: stations, categories (with their station), dishes, dish photos, and
 * tables with their sections and floor plan positions, plus the floor's section
 * order. Nothing about money, orders, bills, staff or guests.
 *
 * Writes into the restaurant whose owner signs in with --target-phone, in the
 * database MONGO_URI names, keeping the source's document ids and moving each
 * document onto the target's restaurant and branch. It refuses when the target
 * already has a menu or tables, so it can never mix two menus. Without --apply
 * it only says what it would copy.
 *
 * Written through the driver, as a restore is: the documents are already
 * valid, made by the same code on the source. On a box the change stream sees
 * them, so they reach the cloud copy like any other change.
 */
import { pathToFileURL } from 'node:url';

import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { databaseHost } from './listRestaurants.js';

const COPIED = Object.freeze(['stations', 'categories', 'menuitems', 'menuphotos', 'tables']);
const MUST_BE_EMPTY = Object.freeze(['categories', 'menuitems', 'tables']);

export function parseArgs(argv) {
  const args = { source: null, targetPhone: null, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source') args.source = argv[++i] ?? null;
    else if (argv[i] === '--target-phone') args.targetPhone = argv[++i] ?? null;
    else if (argv[i] === '--apply') args.apply = true;
    else throw new Error(`Unknown argument ${argv[i]}.`);
  }
  if (!args.source) throw new Error('Give the source restaurant\'s name with --source "Z Chaat".');
  if (!args.targetPhone) throw new Error("Give this database's owner phone with --target-phone.");
  return args;
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The source restaurant and its first branch, by exact name, case ignored. */
async function findSource(db, name) {
  const matches = await db.collection('restaurants').find({ name: { $regex: `^${escape(name.trim())}$`, $options: 'i' } }).toArray();
  if (matches.length === 0) throw new Error(`No restaurant called "${name}" in the source.`);
  if (matches.length > 1) {
    throw new Error(`${matches.length} restaurants called "${name}" in the source: ${matches.map((r) => String(r._id)).join(', ')}. Rename one, or ask for --source-id.`);
  }
  const restaurant = matches[0];
  const branch = await db.collection('branches').findOne({ restaurantId: restaurant._id }, { sort: { createdAt: 1 } });
  if (!branch) throw new Error(`"${restaurant.name}" has no branch in the source.`);
  return { restaurant, branch };
}

export async function copyMenu({ sourceDb, targetDb, source, targetPhone, apply, log = console.log }) {
  const from = await findSource(sourceDb, source);
  const owner = await targetDb.collection('users').findOne({ phone: targetPhone, role: 'OWNER' });
  if (!owner) throw new Error(`No owner with phone ${targetPhone} in this database.`);
  const to = { restaurantId: owner.restaurantId, branchId: owner.branchId, ownerId: owner._id };
  const target = await targetDb.collection('restaurants').findOne({ _id: to.restaurantId });

  log(`From: ${from.restaurant.name} (${from.restaurant._id}), branch ${from.branch.name ?? from.branch._id}`);
  log(`To:   ${target.name} (${to.restaurantId})`);

  for (const coll of MUST_BE_EMPTY) {
    const already = await targetDb.collection(coll).countDocuments({ restaurantId: to.restaurantId });
    if (already > 0) throw new Error(`"${target.name}" already has ${already} ${coll}. This copies into an empty restaurant only. Nothing was changed.`);
  }

  const scope = { restaurantId: from.restaurant._id, branchId: from.branch._id };
  const docs = {};
  for (const coll of COPIED) docs[coll] = await sourceDb.collection(coll).find(scope).toArray();
  const sectionOrder = from.restaurant.settings?.floor?.sectionOrder ?? [];

  const activeItems = docs.menuitems.filter((item) => item.isActive !== false).length;
  log(`  stations   ${docs.stations.length}`);
  log(`  categories ${docs.categories.length}`);
  log(`  dishes     ${docs.menuitems.length} (${activeItems} on the menu)`);
  log(`  photos     ${docs.menuphotos.length}`);
  log(`  tables     ${docs.tables.length}, sections: ${[...new Set(docs.tables.map((table) => table.section ?? 'none'))].join(', ')}`);

  if (!apply) {
    log('Dry run. Nothing was changed. Add --apply to copy.');
    return { copied: null, counts: Object.fromEntries(COPIED.map((coll) => [coll, docs[coll].length])) };
  }

  const move = (doc) => ({ ...doc, restaurantId: to.restaurantId, branchId: to.branchId });
  const existingStations = await targetDb.collection('stations').find({ restaurantId: to.restaurantId }).toArray();
  const stationIdFor = new Map();
  const newStations = [];
  for (const station of docs.stations) {
    // A station with the same name made at setup is reused, so there are never two "Kitchen"s.
    const same = existingStations.find((mine) => mine.name?.toLowerCase() === station.name?.toLowerCase());
    if (same) stationIdFor.set(String(station._id), same._id);
    else newStations.push(move(station));
  }
  const mapStation = (id) => (id ? (stationIdFor.get(String(id)) ?? id) : id);

  const copied = {};
  const insert = async (coll, list) => {
    if (list.length) await targetDb.collection(coll).insertMany(list, { ordered: true });
    copied[coll] = list.length;
  };
  await insert('stations', newStations);
  await insert('categories', docs.categories.map((category) => ({ ...move(category), stationId: mapStation(category.stationId) })));
  await insert('menuitems', docs.menuitems.map((item) => ({ ...move(item), ...(item.stationId !== undefined ? { stationId: mapStation(item.stationId) } : {}) })));
  await insert('menuphotos', docs.menuphotos.map((photo) => ({ ...move(photo), setBy: to.ownerId })));
  await insert('tables', docs.tables.map(move));
  if (sectionOrder.length) {
    await targetDb.collection('restaurants').updateOne({ _id: to.restaurantId }, { $set: { 'settings.floor.sectionOrder': sectionOrder } });
  }
  log(`Copied: ${Object.entries(copied).map(([coll, count]) => `${count} ${coll}`).join(', ')}${sectionOrder.length ? ', and the floor\'s section order' : ''}.`);
  return { copied };
}

const isDirectRun = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirectRun) {
  let sourceConnection = null;
  try {
    const args = parseArgs(process.argv.slice(2));
    const sourceUri = process.env.SOURCE_MONGO_URI;
    if (!sourceUri) throw new Error('Set SOURCE_MONGO_URI to the live database address first (it is never taken from the command line).');
    sourceConnection = await mongoose.createConnection(sourceUri, { serverSelectionTimeoutMS: 15_000 }).asPromise();
    console.log(`Reading from ${databaseHost(sourceUri)} / ${sourceConnection.db.databaseName} (read only)`);
    await connectDatabase();
    console.log(`Writing into ${databaseHost()} / ${mongoose.connection.db.databaseName}`);
    await copyMenu({ sourceDb: sourceConnection.db, targetDb: mongoose.connection.db, ...args });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await sourceConnection?.close().catch(() => {});
    await disconnectDatabase().catch(() => {});
  }
}
