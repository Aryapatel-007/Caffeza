/**
 * Parses TRUST_PROXY into the value Express's `trust proxy` setting takes.
 *
 * Behind a cloud host's proxy, every device in the cafe arrives from the
 * proxy's address unless Express is told to believe the forwarded one. Both
 * rate limiters key on `req.ip`, so with this off, one captain mistyping a
 * password locks every device in the cafe out of signing in.
 *
 * The opposite mistake is just as bad. `true` believes any X-Forwarded-For
 * header from anyone, so a client can invent a new address per request and
 * never hit the login limit. It is refused outright.
 *
 * A pure function. It does not read process.env; config/env.js stays the only
 * file that does.
 */
import { isIP } from 'node:net';

const MAX_PROXY_HOPS = 10;
const NAMED_SUBNETS = Object.freeze(['loopback', 'linklocal', 'uniquelocal']);
const MAX_PREFIX = Object.freeze({ 4: 32, 6: 128 });

export const TRUST_PROXY_TRUE_MESSAGE =
  'TRUST_PROXY=true trusts a forwarded address from anyone, which lets any client bypass the ' +
  'login rate limit. Use the number of proxies in front of the server, usually 1.';

export class TrustProxyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TrustProxyError';
  }
}

function acceptedForms(value) {
  return (
    `TRUST_PROXY "${value}" is not valid. Use false, a whole number of proxies from 1 to ` +
    `${MAX_PROXY_HOPS}, or a comma-separated list of loopback, linklocal, uniquelocal, ` +
    'IP addresses, or addresses with a /prefix.'
  );
}

/** One list item: a named subnet, an address, or an address with a prefix in range. */
function isTrustedItem(item) {
  if (NAMED_SUBNETS.includes(item)) return true;

  const slash = item.indexOf('/');
  if (slash === -1) return isIP(item) !== 0;

  const address = item.slice(0, slash);
  const prefix = item.slice(slash + 1);
  const family = isIP(address);
  if (family === 0 || !/^\d+$/.test(prefix)) return false;
  return Number(prefix) <= MAX_PREFIX[family];
}

/**
 * `false`, a hop count, or an array of trusted addresses. Throws a
 * TrustProxyError with a sentence a person can act on for anything else.
 */
export function parseTrustProxy(text) {
  const value = text === undefined || text === null ? '' : String(text).trim();

  if (value === '' || value === 'false') return false;
  if (value === 'true') throw new TrustProxyError(TRUST_PROXY_TRUE_MESSAGE);

  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    if (hops >= 1 && hops <= MAX_PROXY_HOPS) return hops;
    throw new TrustProxyError(acceptedForms(value));
  }

  const items = value.split(',').map((item) => item.trim());
  if (items.length > 0 && items.every((item) => item !== '' && isTrustedItem(item))) {
    return items;
  }

  throw new TrustProxyError(acceptedForms(value));
}

/** The setting in plain words, for the one startup log line. */
export function describeTrustProxy(setting) {
  if (setting === false) return 'Not trusting any proxy.';
  if (typeof setting === 'number') {
    return `Trusting ${setting} ${setting === 1 ? 'proxy' : 'proxies'} in front of the server.`;
  }
  return `Trusting proxies at: ${setting.join(', ')}.`;
}
