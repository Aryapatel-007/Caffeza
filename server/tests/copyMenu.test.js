/**
 * P62. Copying a cafe's menu and floor from the live database onto a box.
 * The source is read only; the target must be empty; ids and the floor plan survive.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import mongoose from 'mongoose';

import { ALL_MODELS } from '../models/index.js';
import { copyMenu } from '../scripts/copyMenuFromLive.js';
import { createMenuItem, createTable, seedTeam } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

let sourceDb;
let targetDb;
const quiet = () => {};

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  sourceDb = mongoose.connection.db;
  targetDb = mongoose.connection.client.db('copy-menu-target');
});

after(async () => {
  await targetDb.dropDatabase();
  await stopTestServer();
  await stopTestDatabase();
});

async function emptyTarget() {
  const restaurantId = new mongoose.Types.ObjectId();
  const branchId = new mongoose.Types.ObjectId();
  await targetDb.collection('restaurants').insertOne({ _id: restaurantId, name: 'Box Cafe', settings: {} });
  await targetDb.collection('users').insertOne({ restaurantId, branchId, phone: '9111111111', role: 'OWNER', name: 'Box Owner' });
  return { restaurantId, branchId };
}

describe('copying the menu and floor from the live database', () => {
  it('copies stations, categories, dishes and tables with their places, and reads only from the source', async () => {
    const team = await seedTeam();
    const owner = team.tokens.OWNER;
    const dish = (await createMenuItem(owner, { name: 'Pani Puri', priceInPaise: 6000 })).body.data;
    const table = (await createTable(owner, { name: 'A1', section: 'Garden' })).body.data;
    await request('PATCH', '/api/v1/tables/layout', { token: owner, body: { section: 'Garden', tables: [{ id: table.id, x: 2, y: 1 }] } });
    const before = await sourceDb.collection('menuitems').countDocuments();

    const target = await emptyTarget();
    const name = team.restaurant.name;
    const dry = await copyMenu({ sourceDb, targetDb, source: name, targetPhone: '9111111111', apply: false, log: quiet });
    assert.equal(dry.copied, null);
    assert.equal(await targetDb.collection('menuitems').countDocuments(), 0);

    await copyMenu({ sourceDb, targetDb, source: name, targetPhone: '9111111111', apply: true, log: quiet });
    const copiedDish = await targetDb.collection('menuitems').findOne({ _id: new mongoose.Types.ObjectId(dish.id) });
    assert.equal(copiedDish.name, 'Pani Puri');
    assert.equal(copiedDish.priceInPaise, 6000);
    assert.equal(String(copiedDish.restaurantId), String(target.restaurantId));
    assert.equal(String(copiedDish.branchId), String(target.branchId));
    const category = await targetDb.collection('categories').findOne({ _id: copiedDish.categoryId });
    assert.ok(category, 'the dish keeps its category');
    const copiedTable = await targetDb.collection('tables').findOne({ _id: new mongoose.Types.ObjectId(table.id) });
    assert.equal(copiedTable.section, 'Garden');
    const sourceTable = await sourceDb.collection('tables').findOne({ _id: new mongoose.Types.ObjectId(table.id) });
    assert.deepEqual(copiedTable.layout, sourceTable.layout);
    assert.equal(await sourceDb.collection('menuitems').countDocuments(), before, 'the source is unchanged');

    await assert.rejects(copyMenu({ sourceDb, targetDb, source: name, targetPhone: '9111111111', apply: true, log: quiet }), /already has/);
  });

  it('refuses an unknown restaurant or owner, changing nothing', async () => {
    await assert.rejects(copyMenu({ sourceDb, targetDb, source: 'No Such Cafe', targetPhone: '9111111111', apply: true, log: quiet }), /No restaurant called/);
  });
});
