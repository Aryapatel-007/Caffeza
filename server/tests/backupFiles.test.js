/**
 * P54 Part B: encrypted backup files and the storage client, against a fake
 * B2. No test reaches a real bucket.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import { decryptBuffer, encryptBuffer, keyIdOf } from '../services/backup/crypto.js';
import { openPacked, packLines, tempPath } from '../services/backup/pack.js';
import { downloadTo, listObjects } from '../services/backup/readStorage.js';
import { s3Client, uploadFile } from '../services/backup/storage.js';
import { FAKE_BUCKET, READ_KEY, startFakeS3, WRITE_KEY } from './helpers/fakeS3.js';

const SERVER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const newKey = () => randomBytes(32).toString('base64');

let fake;
const storageWith = (key) => ({ bucket: FAKE_BUCKET, client: s3Client({ endpoint: fake.endpoint, region: 'us-west-004', ...key }) });

before(async () => {
  fake = await startFakeS3();
});
after(async () => {
  await fake.stop();
});

async function linesOf(packedPath, keys) {
  const opened = await openPacked(packedPath, keys);
  const lines = [];
  for await (const line of opened.lines()) lines.push(line);
  await opened.remove();
  return lines;
}

describe('encrypted backup files', () => {
  it('round-trip their lines, and say which key a file needs', async () => {
    const key = newKey();
    const packed = await packLines(['{"a":1}', '{"b":2}'], key);
    assert.match(packed.sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(await linesOf(packed.path, [key]), ['{"a":1}', '{"b":2}']);
    assert.equal(readFileSync(packed.path).subarray(5, 9).toString('hex'), keyIdOf(key));
    await rm(packed.path);
  });

  it('refuse a wrong key by name, and a changed byte, writing nothing', async () => {
    const key = newKey();
    const packed = await packLines(['{"secret":"bill 2026-27/000001"}'], key);
    await assert.rejects(linesOf(packed.path, [newKey()]), /made with a different key/);
    const bytes = readFileSync(packed.path);
    bytes[30] ^= 1;
    const changed = tempPath('.enc');
    writeFileSync(changed, bytes);
    await assert.rejects(linesOf(changed, [key]), /changed or damaged/);
    await rm(packed.path);
    await rm(changed);
  });

  it('read a file made with a retired key, only when that key is given', async () => {
    const retired = newKey();
    const current = newKey();
    const packed = await packLines(['{"old":true}'], retired);
    assert.deepEqual(await linesOf(packed.path, [current, retired]), ['{"old":true}']);
    await assert.rejects(linesOf(packed.path, [current]), /made with a different key/);
    await rm(packed.path);
    const small = encryptBuffer(Buffer.from('gap'), retired);
    assert.equal(decryptBuffer(small, [current, retired]).toString(), 'gap');
    assert.throws(() => decryptBuffer(small, [current]), /made with a different key/);
  });
});

describe('the storage client', () => {
  it('uploads with the server key, without the checksum headers B2 refuses, and reads back with the drill key', async () => {
    const key = newKey();
    const packed = await packLines(['{"x":1}'], key);
    await uploadFile(storageWith(WRITE_KEY), 'journal/2026/10/14/a.jrn.gz.enc', packed);
    const put = fake.state.requests.find((request) => request.method === 'PUT');
    assert.equal(Object.keys(put.headers).some((name) => name.startsWith('x-amz-checksum') || name === 'x-amz-sdk-checksum-algorithm'), false);
    assert.ok(put.headers['content-md5']);

    const listed = await listObjects(storageWith(READ_KEY), 'journal/');
    assert.deepEqual(listed.map((item) => item.key), ['journal/2026/10/14/a.jrn.gz.enc']);
    const local = tempPath('.enc');
    await downloadTo(storageWith(READ_KEY), listed[0].key, local);
    assert.deepEqual(await linesOf(local, [key]), ['{"x":1}']);
    await rm(local);
    await rm(packed.path);
  });

  it('keeps each key to its job: the server key cannot list, the drill key cannot write', async () => {
    await assert.rejects(listObjects(storageWith(WRITE_KEY), ''), /cannot list/);
    const packed = await packLines(['{}'], newKey());
    await assert.rejects(uploadFile(storageWith(READ_KEY), 'x', packed), /cannot write/);
    await rm(packed.path);
  });
});

describe('the running server', () => {
  it('never imports readStorage.js', () => {
    const seen = new Set();
    const reached = [];
    const visit = (file) => {
      // A path inside a comment may name no file.
      if (seen.has(file) || !existsSync(file)) return;
      seen.add(file);
      reached.push(file);
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const target = path.resolve(path.dirname(file), match[1]);
        visit(target.endsWith('.js') ? target : `${target}.js`);
      }
    };
    visit(path.join(SERVER_DIR, 'server.js'));
    assert.ok(reached.length > 50, 'the walk reached the server');
    const bad = reached.filter((file) => file.endsWith(`${path.sep}readStorage.js`));
    assert.deepEqual(bad, [], 'the server reaches readStorage.js');
  });
});
