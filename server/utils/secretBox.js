/**
 * Encrypts a cafe's payment secrets at rest. P24.
 *
 * AES-256-GCM under PAYMENT_SECRETS_KEY, a fresh 12-byte IV every time, stored
 * as "iv.tag.ciphertext" in base64. GCM's tag means a tampered value, or one
 * encrypted under another key, fails to open instead of opening as rubbish.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { config } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';

/** Tests only: a key to use instead of the environment's, or `undefined` to go back. */
let keyForTests;

export function setSecretsKeyForTests(key) {
  if (!config.isTest) throw new Error('setSecretsKeyForTests is for tests only.');
  keyForTests = key;
}

const currentKey = () => (keyForTests === undefined ? config.PAYMENT_SECRETS_KEY : keyForTests);

/** Whether this server can store payment secrets at all. */
export function canStoreSecrets(key = currentKey()) {
  return Boolean(key);
}

const keyBytes = (key) => Buffer.from(key, 'base64');

export function sealSecret(plaintext, key = currentKey()) {
  if (!key) throw new Error('PAYMENT_SECRETS_KEY is not set.');
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyBytes(key), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64')).join('.');
}

export function openSecret(sealed, key = currentKey()) {
  if (!key) throw new Error('PAYMENT_SECRETS_KEY is not set.');
  const [iv, tag, ciphertext] = String(sealed).split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv(ALGORITHM, keyBytes(key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
