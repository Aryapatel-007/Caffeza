/**
 * P24. The box that keeps a cafe's payment secrets encrypted at rest.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';

import { canStoreSecrets, openSecret, sealSecret } from '../utils/secretBox.js';

const KEY = randomBytes(32).toString('base64');
const OTHER_KEY = randomBytes(32).toString('base64');

describe('secretBox', () => {
  it('opens what it sealed, and never stores the plaintext', () => {
    const sealed = sealSecret('SECRET-VALUE-123', KEY);
    assert.equal(sealed.includes('SECRET-VALUE-123'), false);
    assert.equal(openSecret(sealed, KEY), 'SECRET-VALUE-123');
  });

  it('seals the same value differently every time', () => {
    assert.notEqual(sealSecret('same', KEY), sealSecret('same', KEY));
  });

  it('refuses to open with another key', () => {
    const sealed = sealSecret('SECRET-VALUE-123', KEY);
    assert.throws(() => openSecret(sealed, OTHER_KEY));
  });

  it('refuses to open a changed ciphertext', () => {
    const [iv, tag, ciphertext] = sealSecret('SECRET-VALUE-123', KEY).split('.');
    const bytes = Buffer.from(ciphertext, 'base64');
    bytes[0] ^= 1;
    assert.throws(() => openSecret([iv, tag, bytes.toString('base64')].join('.'), KEY));
  });

  it('refuses to seal or open without a key', () => {
    assert.equal(canStoreSecrets(null), false);
    assert.throws(() => sealSecret('x', null), /PAYMENT_SECRETS_KEY is not set/);
    assert.throws(() => openSecret('a.b.c', null), /PAYMENT_SECRETS_KEY is not set/);
  });
});
