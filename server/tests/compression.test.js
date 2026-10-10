/**
 * P31. Responses are compressed when the client asks, and only then; images
 * are never compressed twice. docs/PERFORMANCE-BASELINE.md has the sizes.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { deflateSync, gunzipSync } from 'node:zlib';

import { createMenuItem, seedTeam } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

let baseUrl;

before(async () => {
  await startTestDatabase();
  baseUrl = await startTestServer();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

/** A raw GET, so the test decides the Accept-Encoding header and sees the bytes as sent. */
function rawGet(path, headers = {}) {
  return new Promise((resolve, reject) => {
    http
      .get(`${baseUrl}${path}`, { headers }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(chunks) }));
      })
      .on('error', reject);
  });
}

/** A real PNG over 1 kB: a flat colour, padded with a text chunk of one letter, which would compress very well. */
function png() {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(800, 0);
  header.writeUInt32BE(600, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(800 * 3, 0x9a)]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: 600 }, () => row)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('tEXt', Buffer.alloc(8000, 0x61)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('compression', () => {
  it('gzips a JSON read over 1 kB when asked, and sends it plain and identical when not', async () => {
    const team = await seedTeam();
    for (let index = 0; index < 8; index += 1) await createMenuItem(team.tokens.OWNER, { name: `Dish number ${index}` });
    const headers = { authorization: `Bearer ${team.tokens.OWNER}` };

    const plain = await rawGet('/api/v1/menu', headers);
    assert.equal(plain.status, 200);
    assert.ok(plain.bytes.length > 1024, `the read must be over the 1 kB threshold, was ${plain.bytes.length}`);
    assert.equal(plain.headers['content-encoding'], undefined);

    const zipped = await rawGet('/api/v1/menu', { ...headers, 'accept-encoding': 'gzip' });
    assert.equal(zipped.status, 200);
    assert.equal(zipped.headers['content-encoding'], 'gzip');
    assert.ok(zipped.bytes.length < plain.bytes.length / 2, `${zipped.bytes.length} of ${plain.bytes.length}`);
    assert.deepEqual(JSON.parse(gunzipSync(zipped.bytes)), JSON.parse(plain.bytes));
  });

  it('never compresses an image again', async () => {
    const team = await seedTeam();
    const item = (await createMenuItem(team.tokens.OWNER, { name: 'Masala Chai' })).body.data;
    const image = png();
    const saved = await request('PUT', `/api/v1/menu-items/${item.id}/photo`, {
      token: team.tokens.OWNER,
      body: { image: `data:image/png;base64,${image.toString('base64')}` },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));

    const served = await rawGet(`/api/v1/menu-items/${item.id}/photo`, { authorization: `Bearer ${team.tokens.OWNER}`, 'accept-encoding': 'gzip, br' });
    assert.equal(served.status, 200);
    assert.equal(served.headers['content-type'], 'image/png');
    assert.equal(served.headers['content-encoding'], undefined);
    assert.ok(served.bytes.equals(image), 'the bytes stored are the bytes served');
  });
});
