/**
 * The test clock. P08.
 *
 * The golden day happens at fixed times on 26 September 2026, including a
 * payment at 12:02 AM that still belongs to the 26th. Services read the time
 * only through `nowUtc()`, which a test can set. The guard below reads the
 * source from disk, so a new `new Date()` in a service cannot slip back in.
 * tokenService is the one exception: token times stay real, or signed tokens
 * break in tests.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';

import { businessDateFor, nowUtc, resetClockForTests, setClockForTests } from '../utils/time.js';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

afterEach(() => resetClockForTests());

describe('the test clock', () => {
  it('nowUtc reads the clock a test sets, and the real one after a reset', () => {
    setClockForTests('2026-09-26T18:25:00Z');
    assert.equal(nowUtc().toISOString(), '2026-09-26T18:25:00.000Z');
    // A fixed instant stays fixed, and callers cannot mutate it for the next one.
    nowUtc().setTime(0);
    assert.equal(nowUtc().toISOString(), '2026-09-26T18:25:00.000Z');

    resetClockForTests();
    assert.ok(Math.abs(nowUtc().getTime() - Date.now()) < 5000);
  });

  it('accepts a function, for a clock that moves', () => {
    let at = new Date('2026-09-26T06:30:00Z');
    setClockForTests(() => at);
    assert.equal(nowUtc().toISOString(), '2026-09-26T06:30:00.000Z');
    at = new Date('2026-09-26T06:31:00Z');
    assert.equal(nowUtc().toISOString(), '2026-09-26T06:31:00.000Z');
  });

  it('refuses an invalid date', () => {
    assert.throws(() => setClockForTests('not a date'), TypeError);
  });

  it('refuses to run outside NODE_ENV=test', () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.throws(() => setClockForTests('2026-09-26T00:00:00Z'), /NODE_ENV is test/);
      assert.throws(() => resetClockForTests(), /NODE_ENV is test/);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });

  it('11:55 PM and 12:02 AM India time both belong to business date 26 September', () => {
    setClockForTests('2026-09-26T18:25:00Z'); // 11:55 PM IST, 26 Sep
    assert.equal(businessDateFor(nowUtc()), '2026-09-26');
    setClockForTests('2026-09-26T18:32:00Z'); // 12:02 AM IST, 27 Sep
    assert.equal(businessDateFor(nowUtc()), '2026-09-26');
  });
});

describe('services and controllers read the time only through nowUtc', () => {
  it('no new Date() with no argument, except in tokenService.js', () => {
    const offenders = [];
    for (const dir of ['services', 'controllers']) {
      const root = path.join(SERVER_DIR, dir);
      const walk = (folder) => {
        for (const entry of readdirSync(folder, { withFileTypes: true })) {
          const full = path.join(folder, entry.name);
          if (entry.isDirectory()) {
            walk(full);
            continue;
          }
          if (!entry.name.endsWith('.js') || entry.name === 'tokenService.js') continue;
          readFileSync(full, 'utf8')
            .split('\n')
            .forEach((line, index) => {
              if (/new Date\(\s*\)/.test(line)) {
                offenders.push(`${dir}/${path.relative(root, full)}:${index + 1}`);
              }
            });
        }
      };
      walk(root);
    }
    assert.deepEqual(offenders, [], `Read the time through nowUtc():\n${offenders.join('\n')}`);
  });
});
