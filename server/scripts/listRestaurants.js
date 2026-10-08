/**
 * Lists every restaurant in the database the server is configured for. P25 B1.
 *
 *   npm run db:restaurants
 *
 * Reads only. It prints the database host and name first, so nobody mistakes
 * which database they are looking at, then one row per restaurant: id, name,
 * created date, and how many users, orders, bills and day closures it has.
 *
 * It reads through the driver's collections, not the models, because it is the
 * one reader that spans every restaurant on purpose, and it never writes.
 */
import { pathToFileURL } from 'node:url';

import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { config } from '../config/env.js';

/** The host from the connection string, never the credentials in it. */
export function databaseHost(uri = config.MONGO_URI) {
  return new URL(uri.replace('mongodb+srv://', 'https://').replace('mongodb://', 'http://')).hostname;
}

const COUNTED = Object.freeze([
  ['users', 'users'],
  ['orders', 'orders'],
  ['bills', 'bills'],
  ['dayclosures', 'day closures'],
]);

/** One row per restaurant, oldest first. `db` is a native driver database. */
export async function listRestaurants(db) {
  const restaurants = await db
    .collection('restaurants')
    .find({}, { projection: { name: 1, createdAt: 1 } })
    .sort({ createdAt: 1 })
    .toArray();

  const rows = [];
  for (const restaurant of restaurants) {
    const counts = {};
    for (const [collection] of COUNTED) {
      counts[collection] = await db.collection(collection).countDocuments({ restaurantId: restaurant._id });
    }
    rows.push({
      id: String(restaurant._id),
      name: restaurant.name,
      createdAt: restaurant.createdAt ?? null,
      counts,
    });
  }
  return rows;
}

export function describeRestaurant(row) {
  const created = row.createdAt ? row.createdAt.toISOString().slice(0, 10) : 'unknown';
  const counts = COUNTED.map(([collection, label]) => `${row.counts[collection]} ${label}`).join(', ');
  return `${row.id}  ${row.name}  (created ${created})  ${counts}`;
}

async function main() {
  await connectDatabase();
  const db = mongoose.connection.db;
  console.log(`Host: ${databaseHost()}`);
  console.log(`Database: ${db.databaseName}`);
  console.log('');

  const rows = await listRestaurants(db);
  if (rows.length === 0) console.log('No restaurants.');
  for (const row of rows) console.log(describeRestaurant(row));
  console.log('');
  console.log(`${rows.length} restaurant${rows.length === 1 ? '' : 's'}. Nothing was changed.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => disconnectDatabase());
}
