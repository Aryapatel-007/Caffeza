/**
 * An in-process MongoDB for tests.
 *
 * The Atlas cluster is not reachable from a developer machine whose IP is not
 * on its Network Access list, and waiting on that would block every test in
 * M0-B. This gives a real mongod, in process, over a unix socket or loopback,
 * with no network and no shared state between runs.
 *
 * It runs as a one-member replica set rather than a standalone, because
 * transactions need one and the provisioning script has a transaction path
 * that is worth testing rather than assuming.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let replicaSet = null;

export async function startTestDatabase() {
  if (replicaSet) return mongoose.connection;

  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  await mongoose.connect(replicaSet.getUri(), { dbName: 'restaurant-erp-test' });
  return mongoose.connection;
}

export async function stopTestDatabase() {
  await mongoose.disconnect();
  if (replicaSet) await replicaSet.stop();
  replicaSet = null;
}

/** Wipes every collection between tests, without dropping indexes. */
export async function clearTestDatabase() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}

/** True when the connection can run a transaction. */
export function supportsTransactions() {
  return Boolean(replicaSet);
}
