/**
 * Time display and business dates, both sides.
 *
 * The client keeps a copy of `businessDateFor` so its list screens default to
 * today's BUSINESS date: at 12:30 AM a cafe still billing yesterday's business
 * day must not see an empty bills list. A copy is only safe while it agrees
 * with the original, so the first test runs both against the same instants.
 *
 * The last two read the source from disk so the bugs P01 fixed cannot come
 * back in a new screen: a time formatted in the device's own zone, and a time
 * zone hardcoded somewhere other than the one place that owns it.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { businessDateForIst } from '../../client/src/utils/formatDate.js';
import { businessDateFor } from '../utils/time.js';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_SRC_DIR = path.resolve(SERVER_DIR, '..', 'client', 'src');

/** Every source file under `root`, skipping the named directories. */
function sourceFiles(root, skipDirs = []) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirs.includes(entry.name)) files.push(...sourceFiles(full, skipDirs));
    } else if (/\.(js|jsx|mjs|cjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const relative = (root, file) => path.relative(root, file).split(path.sep).join('/');

/** India times as UTC instants: IST is a fixed UTC+05:30. */
const CASES = [
  { label: '26 Sep 2026, 12:00 PM IST', utc: '2026-09-26T06:30:00Z', at5am: '2026-09-26', atMidnight: '2026-09-26' },
  { label: '26 Sep 2026, 11:59 PM IST', utc: '2026-09-26T18:29:00Z', at5am: '2026-09-26', atMidnight: '2026-09-26' },
  { label: '27 Sep 2026, 12:30 AM IST', utc: '2026-09-26T19:00:00Z', at5am: '2026-09-26', atMidnight: '2026-09-27' },
  { label: '27 Sep 2026, 4:59 AM IST', utc: '2026-09-26T23:29:00Z', at5am: '2026-09-26', atMidnight: '2026-09-27' },
  { label: '27 Sep 2026, 5:00 AM IST', utc: '2026-09-26T23:30:00Z', at5am: '2026-09-27', atMidnight: '2026-09-27' },
];

describe('the client business date mirrors the server exactly', () => {
  for (const { label, utc, at5am, atMidnight } of CASES) {
    it(`${label} is business date ${at5am} with the default 5:00 AM start`, () => {
      const instant = new Date(utc);
      assert.equal(businessDateFor(instant), at5am);
      assert.equal(businessDateForIst(instant), at5am);
    });

    it(`${label} is business date ${atMidnight} with a midnight start`, () => {
      const instant = new Date(utc);
      assert.equal(businessDateFor(instant, 0), atMidnight);
      assert.equal(businessDateForIst(instant, 0), atMidnight);
    });
  }
});

describe('time zones live in one place on each side', () => {
  it('no client file formats a time with the device zone, or names Asia/Kolkata, except utils/formatDate.js', () => {
    const banned = ['toLocaleTimeString(', 'toLocaleDateString(', 'toLocaleString(', 'Asia/Kolkata'];
    const offenders = [];

    for (const file of sourceFiles(CLIENT_SRC_DIR)) {
      const name = relative(CLIENT_SRC_DIR, file);
      if (name === 'utils/formatDate.js') continue;
      const text = readFileSync(file, 'utf8');
      for (const needle of banned) {
        if (text.includes(needle)) offenders.push(`${name}: ${needle}`);
      }
    }

    assert.deepEqual(offenders, [], 'use the helpers in client/src/utils/formatDate.js');
  });

  it('no server file outside tests names Asia/Kolkata, except config/env.js', () => {
    const offenders = sourceFiles(SERVER_DIR, ['node_modules', 'tests'])
      .map((file) => relative(SERVER_DIR, file))
      .filter((name) => name !== 'config/env.js')
      .filter((name) => readFileSync(path.join(SERVER_DIR, name), 'utf8').includes('Asia/Kolkata'));

    assert.deepEqual(offenders, [], 'read config.DISPLAY_TIMEZONE instead');
  });
});
