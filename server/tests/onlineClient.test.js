/**
 * P23. Two guards on the client side of M14, with no database.
 *
 * 1. The decline reasons on the client match the server's, codes and both
 *    labels, in the same order, like the cancel reason mirror.
 * 2. The guest's page imports nothing from the staff screens, the staff API
 *    client or the sign-in context, so it can never start the staff sign-in
 *    or call a staff endpoint.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import * as clientReasons from '../../client/src/features/online/onlineReasons.js';
import { DECLINE_REASONS } from '../config/onlineReasons.js';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/src/features/public');
const PUBLIC_API = path.resolve(PUBLIC_DIR, '../../api/publicSite.js');

/** What a guest's page may import, relative to client/src. Anything else fails. */
const ALLOWED = [/^react$/, /^react-router-dom$/, /^@tanstack\/react-query$/, /^\.\/[A-Za-z]+(\.jsx?)?$/, /^\.\.\/\.\.\/components\/ui\//, /^\.\.\/\.\.\/utils\/formatDate\.js$/, /^\.\.\/\.\.\/api\/publicSite\.js$/];

const importsOf = (code) => [...code.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((match) => match[1]);

describe('the client side of online orders', () => {
  it('holds the same decline reasons as the server, in the same order', () => {
    assert.deepEqual(clientReasons.DECLINE_REASONS, DECLINE_REASONS.map((reason) => ({ ...reason })));
  });

  it('keeps the guest page away from the staff screens, client and sign-in', () => {
    const found = [];
    for (const name of readdirSync(PUBLIC_DIR)) {
      for (const source of importsOf(readFileSync(path.join(PUBLIC_DIR, name), 'utf8'))) {
        if (!ALLOWED.some((pattern) => pattern.test(source))) found.push(`${name}: ${source}`);
      }
    }
    assert.deepEqual(found, []);
    assert.deepEqual(importsOf(readFileSync(PUBLIC_API, 'utf8')), []);
  });

  it('would catch a planted import of the sign-in context', () => {
    const planted = "import { useAuth } from '../../context/AuthContext.jsx';";
    assert.equal(importsOf(planted).some((source) => !ALLOWED.some((pattern) => pattern.test(source))), true);
  });
});
