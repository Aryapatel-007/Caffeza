/**
 * P33. The live channel: the handshake makes authenticate's checks, rooms come
 * from the verified token, announcements follow committed writes only, and a
 * socket is never counted by the rate limiters. docs/API-CONTRACT.md "P33".
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import jwt from 'jsonwebtoken';
import { io as connect } from 'socket.io-client';

import { config } from '../config/env.js';
import { Table } from '../models/Table.js';
import { User } from '../models/User.js';
import { announce } from '../services/live/bus.js';
import { attachLiveChannel, closeLiveChannel, LIVE_PATH, MAX_CONNECTIONS_PER_USER } from '../services/live/socketServer.js';
import { withOptionalTransaction } from '../utils/transaction.js';
import { addLines, fireOrder, openOrder, seedFloor, seedTeam } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer, testHttpServer } from './helpers/testServer.js';

const HEARTBEAT_MS = 300;
let baseUrl;
let live;
const sockets = [];

before(async () => {
  await startTestDatabase();
  baseUrl = await startTestServer();
  live = attachLiveChannel(testHttpServer(), { heartbeatMs: HEARTBEAT_MS, enabled: true });
});

after(async () => {
  for (const socket of sockets) socket.close();
  closeLiveChannel(live);
  await stopTestServer();
  await stopTestDatabase();
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Opens a socket and resolves once it is connected, or rejects with the refusal. */
function open(auth, query = {}) {
  return new Promise((resolve, reject) => {
    const socket = connect(baseUrl, { path: LIVE_PATH, transports: ['websocket'], auth, query, reconnection: false, forceNew: true });
    sockets.push(socket);
    socket.messages = [];
    socket.on('changed', (message) => socket.messages.push(message));
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => reject(error));
  });
}

/** Resolves with the first message for `topic` on a socket, or null after `ms`. */
async function nextMessage(socket, topic, ms = 1500) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const found = socket.messages.find((message) => message.topic === topic);
    if (found) return found;
    await wait(25);
  }
  return null;
}

describe('the live channel handshake', () => {
  it('refuses no token, a bad token and an expired token', async () => {
    await assert.rejects(open({}), /UNAUTHENTICATED/);
    await assert.rejects(open({ token: 'not-a-token' }), /UNAUTHENTICATED/);

    const team = await seedTeam();
    const owner = await User.findOne({ restaurantId: team.restaurant._id, role: 'OWNER' });
    const expired = jwt.sign(
      { role: owner.role, restaurantId: String(owner.restaurantId), branchId: String(owner.branchId), exp: Math.floor(Date.now() / 1000) - 60 },
      config.JWT_ACCESS_SECRET,
      { algorithm: 'HS256', subject: String(owner._id) },
    );
    await assert.rejects(open({ token: expired }), /TOKEN_EXPIRED/);
  });

  it("never delivers restaurant B's announcements to a socket of restaurant A, whatever A sends", async () => {
    const a = await seedTeam();
    const b = await seedTeam();
    const bId = String(b.restaurant._id);
    // A names B's restaurant and room every way it can. If a room were ever
    // built from a client-sent value, A would hear B below.
    const socketA = await open({ token: a.tokens.OWNER, restaurantId: bId, room: `restaurant:${bId}` }, { restaurantId: bId });
    const socketB = await open({ token: b.tokens.OWNER });

    const created = await request('POST', '/api/v1/tables', { token: b.tokens.OWNER, body: { name: 'B1' } });
    assert.equal(created.status, 201);
    announce('kots', bId);

    assert.deepEqual(await nextMessage(socketB, 'tables'), { topic: 'tables', restaurantId: bId, branchId: String(b.branch._id) });
    assert.ok(await nextMessage(socketB, 'kots'));
    assert.equal(socketA.messages.length, 0, 'restaurant A heard restaurant B');
  });

  it('drops a socket on its next heartbeat once its user is deactivated', async () => {
    const team = await seedTeam();
    const socket = await open({ token: team.tokens.CASHIER });
    const heard = new Promise((resolve) => socket.once('heartbeat', resolve));
    await heard;
    const dropped = new Promise((resolve) => socket.once('disconnect', resolve));
    const cashier = await User.findOne({ restaurantId: team.restaurant._id, role: 'CASHIER' });
    await User.updateOne({ _id: cashier._id, restaurantId: team.restaurant._id }, { $set: { isActive: false } });
    const outcome = await Promise.race([dropped.then(() => 'dropped'), wait(HEARTBEAT_MS * 5).then(() => 'still open')]);
    assert.equal(outcome, 'dropped');
  });

  it(`refuses a user's connection past ${MAX_CONNECTIONS_PER_USER}`, async () => {
    const team = await seedTeam();
    for (let index = 0; index < MAX_CONNECTIONS_PER_USER; index += 1) await open({ token: team.tokens.WAITER });
    await assert.rejects(open({ token: team.tokens.WAITER }), /TOO_MANY_CONNECTIONS/);
  });
});

describe('announcements', () => {
  it('does nothing and throws nothing for a topic nobody hears, an unknown topic, or no restaurant', () => {
    assert.doesNotThrow(() => announce('online', '652f00000000000000000001'));
    assert.doesNotThrow(() => announce('not-a-topic', '652f00000000000000000001'));
    assert.doesNotThrow(() => announce('kots', null));
  });

  it('announces a committed transaction once it commits, and a rolled-back one never', async () => {
    const team = await seedTeam();
    const id = String(team.restaurant._id);
    const socket = await open({ token: team.tokens.OWNER });
    const base = { restaurantId: team.restaurant._id, branchId: team.branch._id, seats: 2 };

    await assert.rejects(
      withOptionalTransaction(async (session) => {
        await Table.create([{ ...base, name: 'Rolled back' }], { session });
        throw new Error('roll it back');
      }),
      /roll it back/,
    );
    assert.equal(await nextMessage(socket, 'tables', 800), null, 'a rolled-back write was announced');

    await withOptionalTransaction(async (session) => {
      await Table.create([{ ...base, name: 'Committed' }], { session });
    });
    assert.equal((await nextMessage(socket, 'tables')).restaurantId, id);
  });

  it('announces kots and tables when a captain fires an order', async () => {
    const floor = await seedFloor();
    const socket = await open({ token: floor.tokens.KITCHEN });
    const opened = (await openOrder(floor.tokens.WAITER, { tableId: floor.table.id })).body.data;
    const added = (await addLines(floor.tokens.WAITER, opened.id, { version: opened.version, lines: [{ menuItemId: floor.item.id, quantity: 1 }] })).body.data;
    const fired = await fireOrder(floor.tokens.WAITER, opened.id, added.version);
    assert.equal(fired.status, 200, JSON.stringify(fired.body));
    assert.ok(await nextMessage(socket, 'kots'), 'no kots announcement');
    assert.ok(await nextMessage(socket, 'tables'), 'no tables announcement');
  });

  it('never reaches Express, so no rate limiter can count it', async () => {
    // Rate limiting is off under NODE_ENV=test, so there is no header to read.
    // Stronger: a socket's handshake and every heartbeat after it make no HTTP
    // request at all, so neither the general nor the per-user limiter sees one.
    const team = await seedTeam();
    let requests = 0;
    const count = () => {
      requests += 1;
    };
    testHttpServer().on('request', count);
    try {
      const socket = await open({ token: team.tokens.MANAGER });
      for (let index = 0; index < 3; index += 1) await new Promise((resolve) => socket.once('heartbeat', resolve));
    } finally {
      testHttpServer().off('request', count);
    }
    assert.equal(requests, 0, 'the socket made HTTP requests');
  });
});

describe('switched off', () => {
  it('attaches nothing and announces nothing with LIVE_CHANNEL off', () => {
    assert.equal(attachLiveChannel(testHttpServer(), { enabled: false }), null);
    assert.doesNotThrow(() => announce('kots', '652f00000000000000000001'));
    // Back on for anything after this.
    live = attachLiveChannel(testHttpServer(), { heartbeatMs: HEARTBEAT_MS, enabled: true });
  });
});
