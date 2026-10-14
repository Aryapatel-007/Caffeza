/**
 * Uploading backups to Backblaze B2, through its S3 API. P54 Part B.
 *
 * Upload only, with the server key, which B2 lets write and never read, list
 * or delete. Listing and downloading are in `readStorage.js`, which only the
 * restore tools import, with the drill key; the running server never does, and
 * a test fails if it ever starts to.
 *
 * Two settings for B2. The SDK's newer default checksum headers are ones B2
 * rejects, so both checksum options are WHEN_REQUIRED. And each file is one
 * PutObject from a temp file with its Content-MD5, which B2 checks: a backup
 * here is a few MB, far under PutObject's 5 GB, so multipart is never needed.
 */
import { createReadStream } from 'node:fs';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { config } from '../../config/env.js';

/** An S3 client for B2, or for a test's fake. */
export function s3Client({ endpoint, region, keyId, secret }) {
  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: keyId, secretAccessKey: secret },
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

let writeStorage = null;

/** The server's own storage: the write-only key, from the environment. */
export function serverStorage() {
  if (!writeStorage) {
    writeStorage = {
      bucket: config.BACKUP_S3_BUCKET,
      client: s3Client({ endpoint: config.BACKUP_S3_ENDPOINT, region: config.BACKUP_S3_REGION, keyId: config.BACKUP_S3_KEY_ID, secret: config.BACKUP_S3_SECRET }),
    };
  }
  return writeStorage;
}

/** Uploads a packed file. `packed` is what `pack.packLines` returned. */
export async function uploadFile(storage, objectKey, packed) {
  await storage.client.send(
    new PutObjectCommand({
      Bucket: storage.bucket,
      Key: objectKey,
      Body: createReadStream(packed.path),
      ContentLength: packed.bytes,
      ContentMD5: packed.md5Base64,
      ContentType: 'application/octet-stream',
    }),
  );
}

/** Uploads a small file from memory: a gap marker. */
export async function uploadBuffer(storage, objectKey, buffer, md5Base64) {
  await storage.client.send(
    new PutObjectCommand({ Bucket: storage.bucket, Key: objectKey, Body: buffer, ContentLength: buffer.length, ContentMD5: md5Base64, ContentType: 'application/octet-stream' }),
  );
}
