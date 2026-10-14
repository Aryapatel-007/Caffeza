/**
 * Encrypted backup files. P54 Part B.
 *
 * A file is a header, the ciphertext, then GCM's 16-byte tag:
 *
 *   "CZBK" (4 bytes)  format version (1 byte)  key id (4 bytes)  IV (12 bytes)
 *
 * AES-256-GCM, with `node:crypto`, in streams, so a full copy never sits in
 * memory. The key id is the first 8 hex characters of the key's SHA-256, so a
 * restore can say a file was made with a different key, and pick the right
 * retired one from BACKUP_OLD_KEYS. Decrypting checks the tag before anything
 * is handed on: `decryptFile` writes to a temp file and gives it back only
 * once the whole file is proved, so a changed byte never reaches a database.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MAGIC = Buffer.from('CZBK', 'ascii');
export const HEADER_BYTES = 4 + 1 + 4 + 12;
const TAG_BYTES = 16;
const CIPHER = 'aes-256-gcm';
export const CRYPTO_VERSION = 1;

export class BackupKeyError extends Error {}
export class BackupFileError extends Error {}

const keyBytes = (key) => Buffer.from(key, 'base64');

/** "a1b2c3d4": who a key is, without saying what it is. */
export function keyIdOf(key) {
  return createHash('sha256').update(keyBytes(key)).digest('hex').slice(0, 8);
}

/** A stream that turns plaintext into a backup file. */
export function encryptStream(key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER, keyBytes(key), iv);
  const header = Buffer.concat([MAGIC, Buffer.from([CRYPTO_VERSION]), Buffer.from(keyIdOf(key), 'hex'), iv]);
  let wroteHeader = false;
  return new Transform({
    transform(chunk, _encoding, done) {
      if (!wroteHeader) {
        this.push(header);
        wroteHeader = true;
      }
      done(null, cipher.update(chunk));
    },
    flush(done) {
      if (!wroteHeader) this.push(header);
      this.push(cipher.final());
      done(null, cipher.getAuthTag());
    },
  });
}

/** The header's version, key id and IV, or a plain refusal. */
export function readHeader(buffer) {
  if (buffer.length < HEADER_BYTES || !buffer.subarray(0, 4).equals(MAGIC)) throw new BackupFileError('This is not a backup file, or it is cut short.');
  const version = buffer[4];
  if (version !== CRYPTO_VERSION) throw new BackupFileError(`This backup file is format ${version}; this tool reads format ${CRYPTO_VERSION}.`);
  return { keyId: buffer.subarray(5, 9).toString('hex'), iv: buffer.subarray(9, HEADER_BYTES) };
}

/** The key, of those given, that made a file with this id. */
export function keyFor(keyId, keys) {
  const found = keys.find((key) => key && keyIdOf(key) === keyId);
  if (!found) {
    throw new BackupKeyError(
      `This file was made with a different key (key id ${keyId}). Put that key in BACKUP_ENCRYPTION_KEY, or in BACKUP_OLD_KEYS if it was retired.`,
    );
  }
  return found;
}

/**
 * Decrypts `inPath` into `outPath`, proving the tag before returning. A wrong
 * key fails at once, from the header, before reading on; a changed byte fails
 * at the end, and `outPath` must then be thrown away by the caller.
 */
export async function decryptFile(inPath, outPath, keys) {
  const { size } = await stat(inPath);
  if (size < HEADER_BYTES + TAG_BYTES) throw new BackupFileError('This backup file is cut short.');
  const handle = await open(inPath, 'r');
  const header = Buffer.alloc(HEADER_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    await handle.read(header, 0, HEADER_BYTES, 0);
    await handle.read(tag, 0, TAG_BYTES, size - TAG_BYTES);
  } finally {
    await handle.close();
  }
  const { keyId, iv } = readHeader(header);
  const decipher = createDecipheriv(CIPHER, keyBytes(keyFor(keyId, keys)), iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(createReadStream(inPath, { start: HEADER_BYTES, end: size - TAG_BYTES - 1 }), decipher, createWriteStream(outPath));
  } catch (error) {
    if (/auth|unsupported state/i.test(error.message)) throw new BackupFileError('This backup file has been changed or damaged: it fails its check.');
    throw error;
  }
}

/** The same, for a small file already in memory. */
export function decryptBuffer(buffer, keys) {
  const { keyId, iv } = readHeader(buffer);
  if (buffer.length < HEADER_BYTES + TAG_BYTES) throw new BackupFileError('This backup file is cut short.');
  const decipher = createDecipheriv(CIPHER, keyBytes(keyFor(keyId, keys)), iv);
  decipher.setAuthTag(buffer.subarray(buffer.length - TAG_BYTES));
  try {
    return Buffer.concat([decipher.update(buffer.subarray(HEADER_BYTES, buffer.length - TAG_BYTES)), decipher.final()]);
  } catch {
    throw new BackupFileError('This backup file has been changed or damaged: it fails its check.');
  }
}

/** A small file, encrypted in memory: a gap marker. */
export function encryptBuffer(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER, keyBytes(key), iv);
  const header = Buffer.concat([MAGIC, Buffer.from([CRYPTO_VERSION]), Buffer.from(keyIdOf(key), 'hex'), iv]);
  return Buffer.concat([header, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
}
