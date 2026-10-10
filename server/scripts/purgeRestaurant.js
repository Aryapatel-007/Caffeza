/**
 * Removes one restaurant and everything it owns, after backing it all up. P25 B2.
 *
 *   npm run purge:restaurant -- --restaurant <id> --confirm "<exact name>"
 *   npm run purge:restaurant -- --restaurant <id> --confirm "<exact name>" --apply
 *
 * THE ONLY TOOL IN THIS PROJECT THAT HARD DELETES. It exists for restaurants
 * that were mock or test data, named by a person, and must never be run on a
 * restaurant that has traded for real. "Never hard delete a bill" still holds
 * for everything else. The decision log records the exception.
 *
 * Without --apply it changes nothing: it prints the database, then how many
 * documents of each collection belong to the restaurant, and its stored files.
 *
 * With --apply it first exports every one of those documents, collection by
 * collection, as Extended JSON into backups/<name>-<time>/, reads each file
 * back to check it, and stops if any export fails. Only then does it delete,
 * collection by collection, the restaurant document last. Run again after a
 * failure, it finds what is left and finishes the job.
 *
 * Every collection comes from the model registry, so a model added later is
 * covered without editing this file; a test holds that. It reads and deletes
 * through the driver, below the tenant guard and the audit log's append-only
 * guard, because removing a whole tenant is exactly what both exist to stop
 * anywhere else.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { ALL_MODELS, SERVER_MODELS } from '../models/index.js';
import { Restaurant } from '../models/Restaurant.js';
import { databaseHost } from './listRestaurants.js';

const { EJSON } = mongoose.mongo.BSON;

/** Where backups go: `backups/` at the repository root, ignored by git. */
export const DEFAULT_BACKUP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'backups');

/**
 * Which documents of each model belong to a restaurant. Every model but the
 * restaurant itself is matched on `restaurantId`. A model with neither is a
 * model this tool does not know how to scope, and it refuses to guess.
 */
export function purgePlan(models = ALL_MODELS) {
  // P30. The server's own records belong to no restaurant, so a purge never touches them.
  return models.filter((model) => !SERVER_MODELS.includes(model)).map((model) => {
    if (model === Restaurant || model.modelName === Restaurant.modelName) {
      return { model, collection: model.collection.collectionName, filter: (id) => ({ _id: id }), isRestaurant: true };
    }
    if (!model.schema.path('restaurantId')) {
      throw new Error(`${model.modelName} has no restaurantId, so the purge tool cannot tell whose documents are whose.`);
    }
    return { model, collection: model.collection.collectionName, filter: (id) => ({ restaurantId: id }), isRestaurant: false };
  });
}

/** Restaurant last, everything else in registry order. */
const inDeleteOrder = (plan) => [...plan.filter((step) => !step.isRestaurant), ...plan.filter((step) => step.isRestaurant)];

export function parseArgs(argv) {
  const args = { restaurant: null, confirm: null, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--restaurant') args.restaurant = argv[++i] ?? null;
    else if (argv[i] === '--confirm') args.confirm = argv[++i] ?? null;
    else if (argv[i] === '--apply') args.apply = true;
    else throw new Error(`Unknown argument ${argv[i]}.`);
  }
  return args;
}

const safeName = (name) => name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'restaurant';
const stamp = (date) => date.toISOString().replace(/\.\d{3}Z$/, '').replace(/:/g, '-');

/**
 * Counts, exports and (with `apply`) deletes. `log` takes one line at a time.
 * Returns `{ restaurant, counts, files, backupDir, deleted }`.
 */
export async function purgeRestaurant({
  restaurantId,
  confirm,
  apply = false,
  backupRoot = DEFAULT_BACKUP_ROOT,
  models = ALL_MODELS,
  log = () => {},
  now = new Date(),
}) {
  if (!restaurantId || !mongoose.isValidObjectId(restaurantId)) {
    throw new Error('Give the restaurant id with --restaurant <id>.');
  }
  const id = new mongoose.Types.ObjectId(String(restaurantId));
  const plan = purgePlan(models);

  const restaurant = await Restaurant.collection.findOne({ _id: id });
  if (!restaurant) {
    // A rerun after the restaurant document went: anything still scoped to it is finished off.
    const leftovers = await countAll(plan, id);
    if (Object.values(leftovers).every((count) => count === 0)) {
      throw new Error(`No restaurant ${id} and nothing belonging to it. There is nothing to remove.`);
    }
    throw new Error(`Restaurant ${id} is gone but ${JSON.stringify(leftovers)} remain. Remove them by hand after checking.`);
  }
  if (confirm !== restaurant.name) {
    throw new Error(`--confirm must be the restaurant's exact name, "${restaurant.name}". Nothing was changed.`);
  }

  const counts = await countAll(plan, id);
  const files = {
    logos: Object.values(restaurant.brandLogos ?? {}).filter((slot) => slot?.sha256).length,
    dishPhotos: counts.menuphotos ?? 0,
  };

  log(`Restaurant: ${restaurant.name} (${id})`);
  for (const step of plan) log(`  ${step.collection}: ${counts[step.collection]}`);
  log(`Stored files: ${files.logos} logo${files.logos === 1 ? '' : 's'} on the restaurant, ${files.dishPhotos} dish photo${files.dishPhotos === 1 ? '' : 's'}.`);

  if (!apply) {
    log('Dry run. Nothing was changed. Add --apply to back up and remove.');
    return { restaurant, counts, files, backupDir: null, deleted: null };
  }

  const backupDir = path.join(backupRoot, `${safeName(restaurant.name)}-${stamp(now)}`);
  await mkdir(backupDir, { recursive: true });
  for (const step of plan) {
    const docs = await step.model.collection.find(step.filter(id)).toArray();
    const file = path.join(backupDir, `${step.collection}.json`);
    await writeFile(file, EJSON.stringify(docs, null, 0, { relaxed: false }));
    const readBack = EJSON.parse(await readFile(file, 'utf8'), { relaxed: false });
    if (!Array.isArray(readBack) || readBack.length !== docs.length) {
      throw new Error(`The backup of ${step.collection} did not read back whole. Nothing was deleted.`);
    }
    log(`  backed up ${step.collection}: ${docs.length}`);
  }
  await writeFile(
    path.join(backupDir, 'manifest.json'),
    JSON.stringify({ restaurantId: String(id), name: restaurant.name, at: now.toISOString(), counts }, null, 2),
  );
  log(`Backup written to ${backupDir}`);

  const deleted = {};
  for (const step of inDeleteOrder(plan)) {
    const result = await step.model.collection.deleteMany(step.filter(id));
    deleted[step.collection] = result.deletedCount;
    log(`  removed ${step.collection}: ${result.deletedCount}`);
  }
  log(`${restaurant.name} removed.`);
  return { restaurant, counts, files, backupDir, deleted };
}

async function countAll(plan, id) {
  const counts = {};
  for (const step of plan) counts[step.collection] = await step.model.collection.countDocuments(step.filter(id));
  return counts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await connectDatabase();
  console.log(`Host: ${databaseHost()}`);
  console.log(`Database: ${mongoose.connection.db.databaseName}`);
  console.log('');
  await purgeRestaurant({ restaurantId: args.restaurant, confirm: args.confirm, apply: args.apply, log: (line) => console.log(line) });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => disconnectDatabase());
}
