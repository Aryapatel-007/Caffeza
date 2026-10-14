/**
 * Lines of EJSON in, an encrypted file out, and back. P54 Part B.
 *
 * Packing streams the lines through gzip and encryption into a temp file,
 * hashing as it goes (SHA-256 for `backupruns`, MD5 for the upload's
 * Content-MD5), so nothing larger than one batch is ever in memory.
 * Unpacking proves the whole file first (crypto.js), then reads its lines.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';

import { decryptFile, encryptStream } from './crypto.js';

export const tempPath = (suffix) => path.join(tmpdir(), `erp-backup-${randomUUID()}${suffix}`);

/** Lines to an encrypted, gzipped temp file: { path, bytes, sha256, md5Base64 }. */
export async function packLines(lines, key) {
  const out = tempPath('.enc');
  const sha256 = createHash('sha256');
  const md5 = createHash('md5');
  let bytes = 0;
  const tap = new Transform({
    transform(chunk, _encoding, done) {
      sha256.update(chunk);
      md5.update(chunk);
      bytes += chunk.length;
      done(null, chunk);
    },
  });
  async function* asText() {
    for await (const line of lines) yield `${line}\n`;
  }
  try {
    await pipeline(Readable.from(asText()), createGzip(), encryptStream(key), tap, createWriteStream(out));
  } catch (error) {
    await rm(out, { force: true });
    throw error;
  }
  return { path: out, bytes, sha256: sha256.digest('hex'), md5Base64: md5.digest('base64') };
}

/**
 * Proves an encrypted file with `keys`, and gives back a temp file of its
 * plain gzip and a way to read its lines. Throws before any line is read if
 * the key is wrong or a byte has changed.
 */
export async function openPacked(encryptedPath, keys) {
  const plain = tempPath('.gz');
  try {
    await decryptFile(encryptedPath, plain, keys);
  } catch (error) {
    await rm(plain, { force: true });
    throw error;
  }
  return {
    path: plain,
    async *lines() {
      const reader = createInterface({ input: createReadStream(plain).pipe(createGunzip()), crlfDelay: Infinity });
      for await (const line of reader) if (line) yield line;
    },
    remove: () => rm(plain, { force: true }),
  };
}
