/**
 * Reading backups from the bucket: list and download. P54 Part B.
 *
 * ONLY the restore, list, verify and practice restore tools import this file,
 * with the drill key, which B2 lets list and read and never write or delete.
 * The running server never imports it: the server key cannot read anyway, and
 * a test fails if anything the server loads reaches this file.
 */
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

import { config } from '../../config/env.js';
import { s3Client } from './storage.js';

/** The tools' storage: the read-only drill key, from the environment. */
export function drillStorage() {
  const missing = ['BACKUP_S3_ENDPOINT', 'BACKUP_S3_REGION', 'BACKUP_S3_BUCKET', 'BACKUP_DRILL_KEY_ID', 'BACKUP_DRILL_SECRET'].filter((name) => !config[name]);
  if (missing.length) throw new Error(`Set ${missing.join(', ')} to read the backups. See docs/DEPLOYMENT.md section 8.`);
  return {
    bucket: config.BACKUP_S3_BUCKET,
    client: s3Client({ endpoint: config.BACKUP_S3_ENDPOINT, region: config.BACKUP_S3_REGION, keyId: config.BACKUP_DRILL_KEY_ID, secret: config.BACKUP_DRILL_SECRET }),
  };
}

/** Every object under `prefix`: { key, bytes, lastModified }. */
export async function listObjects(storage, prefix) {
  const found = [];
  let token;
  do {
    const page = await storage.client.send(new ListObjectsV2Command({ Bucket: storage.bucket, Prefix: prefix, ContinuationToken: token }));
    for (const item of page.Contents ?? []) found.push({ key: item.Key, bytes: Number(item.Size ?? 0), lastModified: item.LastModified ?? null });
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return found;
}

/** Downloads one object to a local file. */
export async function downloadTo(storage, objectKey, filePath) {
  const answer = await storage.client.send(new GetObjectCommand({ Bucket: storage.bucket, Key: objectKey }));
  await pipeline(answer.Body, createWriteStream(filePath));
}
