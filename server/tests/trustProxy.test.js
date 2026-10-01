/**
 * TRUST_PROXY parsing.
 *
 * Too little trust behind a host's proxy and one mistyped password locks every
 * device in the cafe out of signing in. Too much, and any client can fake its
 * address and skip the login limit. Every accepted and refused form is pinned
 * here, including the exact sentence for `true`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  describeTrustProxy,
  parseTrustProxy,
  TRUST_PROXY_TRUE_MESSAGE,
  TrustProxyError,
} from '../config/trustProxy.js';

describe('parseTrustProxy', () => {
  it('reads empty, absent and false as no trust at all', () => {
    assert.equal(parseTrustProxy(''), false);
    assert.equal(parseTrustProxy('   '), false);
    assert.equal(parseTrustProxy(undefined), false);
    assert.equal(parseTrustProxy('false'), false);
  });

  it('reads a whole number from 1 to 10 as that many proxies', () => {
    assert.equal(parseTrustProxy('1'), 1);
    assert.equal(parseTrustProxy(' 2 '), 2);
    assert.equal(parseTrustProxy('10'), 10);
  });

  it('refuses a hop count outside 1 to 10', () => {
    for (const value of ['0', '11', '100']) {
      assert.throws(() => parseTrustProxy(value), TrustProxyError, value);
    }
  });

  it('reads a list of named subnets, addresses and prefixes as an array of trimmed items', () => {
    assert.deepEqual(parseTrustProxy('loopback'), ['loopback']);
    assert.deepEqual(parseTrustProxy('loopback, linklocal , uniquelocal'), [
      'loopback',
      'linklocal',
      'uniquelocal',
    ]);
    assert.deepEqual(parseTrustProxy('10.0.0.1'), ['10.0.0.1']);
    assert.deepEqual(parseTrustProxy('10.0.0.0/8, 192.168.1.0/24'), ['10.0.0.0/8', '192.168.1.0/24']);
    assert.deepEqual(parseTrustProxy('::1'), ['::1']);
    assert.deepEqual(parseTrustProxy('fd00::/8, 10.0.0.0/32'), ['fd00::/8', '10.0.0.0/32']);
    assert.deepEqual(parseTrustProxy('2001:db8::/128'), ['2001:db8::/128']);
  });

  it('refuses true, with the sentence that says why', () => {
    assert.throws(() => parseTrustProxy('true'), (error) => {
      assert.ok(error instanceof TrustProxyError);
      assert.equal(error.message, TRUST_PROXY_TRUE_MESSAGE);
      assert.equal(
        error.message,
        'TRUST_PROXY=true trusts a forwarded address from anyone, which lets any client bypass ' +
          'the login rate limit. Use the number of proxies in front of the server, usually 1.',
      );
      return true;
    });
  });

  it('refuses an IPv4 prefix above 32 and an IPv6 prefix above 128', () => {
    assert.throws(() => parseTrustProxy('10.0.0.0/33'), TrustProxyError);
    assert.throws(() => parseTrustProxy('fd00::/129'), TrustProxyError);
  });

  it('refuses anything else, naming the value and the accepted forms', () => {
    for (const value of ['yes', 'TRUE', '1.5', '-1', 'loopback,', 'not-an-ip', '10.0.0/8', '10.0.0.0/x']) {
      assert.throws(
        () => parseTrustProxy(value),
        (error) => {
          assert.ok(error instanceof TrustProxyError, value);
          assert.ok(error.message.includes(`"${value}"`), `names the value: ${value}`);
          assert.match(error.message, /false, a whole number of proxies from 1 to 10/);
          assert.match(error.message, /loopback, linklocal, uniquelocal/);
          return true;
        },
      );
    }
  });
});

describe('describeTrustProxy', () => {
  it('says the setting in plain words', () => {
    assert.equal(describeTrustProxy(false), 'Not trusting any proxy.');
    assert.equal(describeTrustProxy(1), 'Trusting 1 proxy in front of the server.');
    assert.equal(describeTrustProxy(2), 'Trusting 2 proxies in front of the server.');
    assert.equal(describeTrustProxy(['loopback', '10.0.0.0/8']), 'Trusting proxies at: loopback, 10.0.0.0/8.');
  });
});
