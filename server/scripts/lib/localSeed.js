/**
 * What the two local seed scripts share: the guard that keeps them off any
 * real database, and the wipe that makes a re-run start clean. Extracted from
 * seedDemo.js in P18 when loadGoldenDay.js became the second user, so the
 * guard exists once.
 */
import mongoose from 'mongoose';

import { config } from '../../config/env.js';
import { ALL_MODELS } from '../../models/index.js';

/** The database host, from the configured URI. */
export function databaseHost() {
  return new URL(config.MONGO_URI.replace('mongodb+srv://', 'https://').replace('mongodb://', 'http://')).hostname;
}

/**
 * Refuses outside development and test, and against any host that is not
 * localhost unless it is named in SEED_DEMO_ALLOWED_HOSTS. A heuristic could
 * not tell this project's shared cluster from a customer's, so the opt-in is
 * explicit.
 */
export function assertSafeToSeed() {
  if (config.NODE_ENV !== 'development' && config.NODE_ENV !== 'test') {
    throw new Error(`Refusing to run: NODE_ENV is "${config.NODE_ENV}". This script only runs in development or test.`);
  }

  const host = databaseHost();
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  const allowed = (process.env.SEED_DEMO_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

  if (!isLocalhost && !allowed.includes(host)) {
    throw new Error(
      `Refusing to run: "${host}" is not localhost and is not in SEED_DEMO_ALLOWED_HOSTS. ` +
        'Add it there explicitly if you really mean to seed demo data into this cluster.',
    );
  }
}

/** Every collection that carries a restaurantId, from the model registry, so a new model is never missed. */
export const SCOPED_COLLECTIONS = ALL_MODELS.map((model) => model.collection.collectionName).filter(
  (name) => name !== 'restaurants' && name !== 'branches',
);

/**
 * Deletes one restaurant found by its exact name, and every record scoped to
 * it, through the raw collections. Only ever called with a fixed demo name.
 */
export async function wipeRestaurantNamed(name) {
  const db = mongoose.connection.db;
  const restaurant = await db.collection('restaurants').findOne({ name });
  if (!restaurant) return false;

  const restaurantId = restaurant._id;
  for (const collection of SCOPED_COLLECTIONS) {
    await db.collection(collection).deleteMany({ restaurantId });
  }
  await db.collection('branches').deleteMany({ restaurantId });
  await db.collection('restaurants').deleteOne({ _id: restaurantId });
  return true;
}
