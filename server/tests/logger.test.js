/**
 * Logger redaction tests.
 *
 * Logs get shipped, searched, and kept. A password or a phone number that
 * reaches one is there permanently, and personal data in a log is a legal
 * problem for us under the DPDP Act, not just an untidy one.
 *
 * These tests build a logger from the same factory the application uses, point
 * it at an in-memory stream, and check that no secret comes out the other end.
 */
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { describe, it } from 'node:test';

import { createLogger, REDACTION_CENSOR, SENSITIVE_KEYS } from '../config/logger.js';

/** Distinctive values, so a substring search cannot match by accident. */
const SECRETS = {
  password: 'SECRET-VALUE-password-8f21',
  pin: 'SECRET-VALUE-pin-8f22',
  token: 'SECRET-VALUE-token-8f23',
  accessToken: 'SECRET-VALUE-accessToken-8f24',
  refreshToken: 'SECRET-VALUE-refreshToken-8f25',
  authorization: 'SECRET-VALUE-authorization-8f26',
  phone: 'SECRET-VALUE-phone-8f27',
};

function captureLog(write) {
  let output = '';
  const sink = new Writable({
    write(chunk, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });

  const logger = createLogger({ level: 'trace', destination: sink, pretty: false });
  write(logger);
  return output;
}

describe('the redaction list', () => {
  it('covers every key the conventions name', () => {
    for (const key of Object.keys(SECRETS)) {
      assert.ok(SENSITIVE_KEYS.includes(key), `${key} is missing from SENSITIVE_KEYS`);
    }
  });
});

describe('redaction', () => {
  it('hides every sensitive value at the top level', () => {
    const output = captureLog((logger) => logger.info({ ...SECRETS }, 'login attempt'));

    for (const [key, value] of Object.entries(SECRETS)) {
      assert.equal(output.includes(value), false, `${key} leaked into the log`);
      assert.ok(output.includes(`"${key}":"${REDACTION_CENSOR}"`), `${key} was not censored`);
    }
  });

  it('hides them one level down as well', () => {
    const output = captureLog((logger) => logger.info({ user: { ...SECRETS } }, 'user loaded'));

    for (const [key, value] of Object.entries(SECRETS)) {
      assert.equal(output.includes(value), false, `nested ${key} leaked into the log`);
    }
  });

  it('hides them on a request object', () => {
    const output = captureLog((logger) =>
      logger.warn(
        {
          req: {
            method: 'POST',
            url: '/api/v1/auth/login',
            headers: { authorization: SECRETS.authorization, cookie: 'session=abc123' },
            body: { phone: SECRETS.phone, pin: SECRETS.pin },
          },
        },
        'request rejected',
      ),
    );

    assert.equal(output.includes(SECRETS.authorization), false);
    assert.equal(output.includes(SECRETS.phone), false);
    assert.equal(output.includes(SECRETS.pin), false);
    assert.equal(output.includes('session=abc123'), false);
    // The parts that are safe are still there, otherwise the log is useless.
    assert.ok(output.includes('/api/v1/auth/login'));
  });

  it('leaves everything else alone', () => {
    const output = captureLog((logger) =>
      logger.info({ ...SECRETS, restaurantId: 'rest-123', orderId: 'order-456' }, 'order fired'),
    );

    assert.ok(output.includes('rest-123'));
    assert.ok(output.includes('order-456'));
    assert.ok(output.includes('order fired'));
  });

  it('does not leak through an error object', () => {
    const error = new Error('login failed');
    error.phone = SECRETS.phone;
    error.token = SECRETS.token;

    const output = captureLog((logger) => logger.error({ err: error }, 'auth error'));

    assert.equal(output.includes(SECRETS.phone), false);
    assert.equal(output.includes(SECRETS.token), false);
  });
});
