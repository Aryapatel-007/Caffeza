/**
 * Encrypts a cafe's payment secrets at rest. P24.
 *
 * AES-256-GCM under PAYMENT_SECRETS_KEY, a fresh 12-byte IV every time, stored
 * as "iv.tag.ciphertext" in base64. GCM's tag means a tampered value, or one
 * encrypted under another key, fails to open instead of opening as rubbish.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

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

/* --------------------------------------------------------------------------
 * Partner credentials. P25 Part G, API-CONTRACT M21 section 2.
 * ----------------------------------------------------------------------- */

/**
 * Development and test only, never production (config/env.js refuses to
 * start without a real key there). Known to everyone, so a box sealed under
 * it is no secret: fine for a laptop, never for a restaurant.
 */
const DEVELOPMENT_INTEGRATION_KEY = Buffer.alloc(32, 'restaurant-erp-development-only').toString('base64');

let integrationKeyForTests;
let warnedAboutDevelopmentKey = false;

export function setIntegrationKeyForTests(key) {
  if (!config.isTest) throw new Error('setIntegrationKeyForTests is for tests only.');
  integrationKeyForTests = key;
}

function integrationKey() {
  if (integrationKeyForTests !== undefined) return integrationKeyForTests;
  if (config.INTEGRATION_SECRETS_KEY) return config.INTEGRATION_SECRETS_KEY;
  if (config.isProduction) throw new Error('INTEGRATION_SECRETS_KEY is not set.');
  if (!warnedAboutDevelopmentKey && !config.isTest) {
    warnedAboutDevelopmentKey = true;
    console.warn('INTEGRATION_SECRETS_KEY is not set: partner credentials are sealed with the development key. Never in production.');
  }
  return DEVELOPMENT_INTEGRATION_KEY;
}

/** The first 8 hex characters of the key's SHA-256: which key sealed a box, never the key. */
export function keyIdOf(key) {
  return createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 8);
}

/**
 * Seals any JSON value: AES-256-GCM, a fresh 12-byte IV every time, the tag
 * beside the ciphertext, and the key's id, so a box sealed under another key
 * is recognised and refused rather than opened as rubbish.
 */
export function encryptJson(value, key = integrationKey()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyBytes(key), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { keyId: keyIdOf(key), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}

/** Opens a box from `encryptJson`. Throws for another key's box or a changed one. */
export function decryptJson(box, key = integrationKey()) {
  if (!box || box.keyId !== keyIdOf(key)) {
    throw new Error('These credentials were saved under another key. Enter them again.');
  }
  const decipher = createDecipheriv(ALGORITHM, keyBytes(key), Buffer.from(box.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
  const text = Buffer.concat([decipher.update(Buffer.from(box.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(text);
}

