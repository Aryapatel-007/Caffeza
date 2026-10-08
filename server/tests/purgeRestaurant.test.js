/**
 * P25 B2 and B9: the purge tool, the one hard delete in the project.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import mongoose from 'mongoose';

import { ALL_MODELS } from '../models/index.js';
import { parseArgs, purgePlan, purgeRestaurant } from '../scripts/purgeRestaurant.js';
import { createMenuItem, createTable, seedTeam } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const { EJSON } = mongoose.mongo.BSON;

let backupRoot;

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  backupRoot = await mkdtemp(path.join(os.tmpdir(), 'purge-test-'));
});

after(async () => {
  await rm(backupRoot, { recursive: true, force: true });
  await stopTestServer();
  await stopTestDatabase();
});

/** A restaurant with staff, a menu, a table and an audit line. */
async function seedRestaurant() {
  const team = await seedTeam();
  await createMenuItem(team.tokens.OWNER, { name: 'Pani Puri', priceInPaise: 27000, taxRateBps: 500 });
  await createTable(team.tokens.OWNER, { name: 'Table 1' });
  await request('PATCH', '/api/v1/settings', { token: team.tokens.OWNER, body: { reason: 'Tidy', receipt: { footerText: 'Thank you' } } });
  return team;
}

async function countsFor(restaurantId) {
  const counts = {};
  for (const step of purgePlan()) counts[step.collection] = await step.model.collection.countDocuments(step.filter(restaurantId));
  return counts;
}

describe('the purge tool', () => {
  it('covers every model in the registry, and refuses one it cannot scope', () => {
    const plan = purgePlan();
    assert.deepEqual(
      plan.map((step) => step.collection).sort(),
      ALL_MODELS.map((model) => model.collection.collectionName).sort(),
    );
    const unscoped = mongoose.model('PurgeTestUnscoped', new mongoose.Schema({ name: String }));
    assert.throws(() => purgePlan([...ALL_MODELS, unscoped]), /has no restaurantId/);
  });

  it('changes nothing on a dry run, and refuses a wrong name', async () => {
    const { restaurant } = await seedRestaurant();
    const before = await countsFor(restaurant._id);

    const dry = await purgeRestaurant({ restaurantId: String(restaurant._id), confirm: restaurant.name, backupRoot });
    assert.equal(dry.backupDir, null);
    assert.deepEqual(await countsFor(restaurant._id), before);
    assert.ok(before.users > 0 && before.menuitems > 0 && before.auditlogs > 0);

    await assert.rejects(
      purgeRestaurant({ restaurantId: String(restaurant._id), confirm: `${restaurant.name} `, apply: true, backupRoot }),
      /exact name/,
    );
    assert.deepEqual(await countsFor(restaurant._id), before);
  });

  it('backs up every document, then removes them all, and leaves another restaurant alone', async () => {
    const { restaurant } = await seedRestaurant();
    const other = await seedRestaurant();
    const before = await countsFor(restaurant._id);
    const otherBefore = await countsFor(other.restaurant._id);

    const result = await purgeRestaurant({
      restaurantId: String(restaurant._id),
      confirm: restaurant.name,
      apply: true,
      backupRoot,
    });

    const after = await countsFor(restaurant._id);
    assert.ok(Object.values(after).every((count) => count === 0), JSON.stringify(after));
    assert.deepEqual(await countsFor(other.restaurant._id), otherBefore);

    const files = await readdir(result.backupDir);
    for (const step of purgePlan()) {
      assert.ok(files.includes(`${step.collection}.json`), step.collection);
      const docs = EJSON.parse(await readFile(path.join(result.backupDir, `${step.collection}.json`), 'utf8'), { relaxed: false });
      assert.equal(docs.length, before[step.collection], step.collection);
    }
    const restaurantBackup = EJSON.parse(await readFile(path.join(result.backupDir, 'restaurants.json'), 'utf8'), { relaxed: false });
    assert.equal(String(restaurantBackup[0]._id), String(restaurant._id));

    await assert.rejects(
      purgeRestaurant({ restaurantId: String(restaurant._id), confirm: restaurant.name, apply: true, backupRoot }),
      /nothing to remove/,
    );
  });

  it('reads its arguments, and refuses one it does not know', () => {
    assert.deepEqual(parseArgs(['--restaurant', 'abc', '--confirm', 'Z Chaat', '--apply']), {
      restaurant: 'abc',
      confirm: 'Z Chaat',
      apply: true,
    });
    assert.throws(() => parseArgs(['--yes']), /Unknown argument/);
  });
});
