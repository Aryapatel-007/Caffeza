/**
 * P24, dish photos. docs/API-CONTRACT.md M14 section 5.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';

import { ALL_MODELS } from '../models/index.js';
import { MenuPhoto } from '../models/MenuPhoto.js';
import { createMenuItem, seedTeam } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A real PNG in one flat colour, padded to `padTo` bytes. */
function png(width, height, { padTo = 0 } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x9a)]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', pixels)];
  const size = parts.reduce((total, part) => total + part.length, 0) + 12;
  if (padTo > size) parts.push(chunk('tEXt', Buffer.alloc(padTo - size - 12, 0x61)));
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

const dataUrl = (buffer, type = 'image/png') => `data:${type};base64,${buffer.toString('base64')}`;
const upload = (token, itemId, image) => request('PUT', `/api/v1/menu-items/${itemId}/photo`, { token, body: { image } });

describe('dish photos', () => {
  it('stores a photo, shows it on the item and the public menu, and serves it for a year', async () => {
    const team = await seedTeam();
    const owner = team.tokens.OWNER;
    const item = (await createMenuItem(owner, { name: 'Masala Chai' })).body.data;

    const saved = await upload(team.tokens.MANAGER, item.id, dataUrl(png(800, 600)));
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.data.photo.width, 800);

    const read = await request('GET', `/api/v1/menu-items/${item.id}`, { token: owner });
    assert.match(read.body.data.photo.sha256, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(read.body).includes('base64'), false);

    await request('PATCH', '/api/v1/settings', { token: owner, body: { reason: 'x', features: { online: true }, online: { takeawayEnabled: true } } });
    await request('PATCH', '/api/v1/online/site', { token: owner, body: { publicSlug: 'photo-cafe' } });
    const menu = await request('GET', '/api/v1/public/photo-cafe/menu');
    const photoUrl = menu.body.data[0].items[0].photoUrl;
    assert.match(photoUrl, /^\/api\/v1\/public\/photo-cafe\/photos\/[a-f0-9]{24}\?v=[a-f0-9]{16}$/);

    const served = await request('GET', photoUrl);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');
    assert.match(served.headers.get('cache-control'), /max-age=31536000/);
  });

  it('refuses SVG, a photo too large, and one too small, and the wrong roles', async () => {
    const team = await seedTeam();
    const item = (await createMenuItem(team.tokens.OWNER)).body.data;
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"></svg>');
    assert.equal((await upload(team.tokens.OWNER, item.id, dataUrl(svg, 'image/svg+xml'))).status, 400);
    assert.equal((await upload(team.tokens.OWNER, item.id, dataUrl(png(800, 600, { padTo: 320 * 1024 })))).status, 400);
    assert.equal((await upload(team.tokens.OWNER, item.id, dataUrl(png(200, 200)))).status, 400);
    assert.equal((await upload(team.tokens.CASHIER, item.id, dataUrl(png(800, 600)))).status, 403);
  });

  it('removes a photo and its bytes, and never serves another restaurant\'s', async () => {
    const team = await seedTeam();
    const other = await seedTeam();
    const item = (await createMenuItem(team.tokens.OWNER)).body.data;
    await upload(team.tokens.OWNER, item.id, dataUrl(png(800, 600)));

    assert.equal((await request('GET', `/api/v1/menu-items/${item.id}/photo`, { token: other.tokens.OWNER })).status, 404);
    assert.equal((await upload(other.tokens.OWNER, item.id, dataUrl(png(800, 600)))).status, 404);

    const removed = await request('DELETE', `/api/v1/menu-items/${item.id}/photo`, { token: team.tokens.OWNER, body: {} });
    assert.equal(removed.body.data.photo, null);
    assert.equal(await MenuPhoto.countDocuments({ restaurantId: team.restaurant._id, menuItemId: item.id }), 0);
  });
});
