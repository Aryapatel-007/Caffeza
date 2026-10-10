/**
 * P30 Part B: the client's cold start rules, tested here because the client
 * has no test runner (the same way timeDisplay.test.js tests the business
 * date mirror). API-CONTRACT P30 section 5.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RETRY_DELAYS_MS, shouldRetry, withinWorkingHours } from '../../client/src/api/coldStart.js';

const WRITES = ['POST', 'PUT', 'PATCH', 'DELETE'];
const NEVER = [400, 401, 403, 404, 409, 422];
const COLD = [
  { status: 502 },
  { status: 503 },
  { status: 504 },
  { status: 200, contentType: 'text/html; charset=utf-8' },
  { isTimeout: true },
];

describe('shouldRetry', () => {
  it('retries a GET in a cold start at 3, 6, 12, 20 and 30 seconds, then gives up', () => {
    assert.deepEqual(RETRY_DELAYS_MS, [3000, 6000, 12000, 20000, 30000]);
    for (const failure of COLD) {
      const delays = [0, 1, 2, 3, 4, 5].map((attempt) => shouldRetry({ method: 'GET', ...failure, attempt }));
      assert.deepEqual(delays, [3000, 6000, 12000, 20000, 30000, null], JSON.stringify(failure));
    }
  });

  it('never retries a write, whatever the error', () => {
    for (const method of WRITES) {
      for (const failure of [...COLD, ...NEVER.map((status) => ({ status }))]) {
        assert.equal(shouldRetry({ method, ...failure, attempt: 0 }), null, `${method} ${JSON.stringify(failure)}`);
      }
    }
  });

  it('never retries an answer the server gave: 400, 401, 403, 404, 409 or 422', () => {
    for (const status of NEVER) {
      assert.equal(shouldRetry({ method: 'GET', status, contentType: 'application/json', attempt: 0 }), null, String(status));
    }
    assert.equal(shouldRetry({ method: 'GET', status: 500, contentType: 'application/json', attempt: 0 }), null);
  });
});

describe('withinWorkingHours', () => {
  // 10:00 AM to 11:00 PM India time is 04:30 to 17:30 UTC.
  const hours = { opensAtMinutes: 600, closesAtMinutes: 1380 };
  const at = (iso) => Date.parse(iso);

  it('keeps 30 minutes either side of the opening hours', () => {
    assert.equal(withinWorkingHours(at('2026-10-10T03:59:00Z'), hours), false); // 9:29 AM
    assert.equal(withinWorkingHours(at('2026-10-10T04:00:00Z'), hours), true); // 9:30 AM
    assert.equal(withinWorkingHours(at('2026-10-10T17:59:00Z'), hours), true); // 11:29 PM
    assert.equal(withinWorkingHours(at('2026-10-10T18:00:00Z'), hours), false); // 11:30 PM
  });

  it('follows a closing time after midnight', () => {
    const late = { opensAtMinutes: 600, closesAtMinutes: 120 }; // 10:00 AM to 2:00 AM
    assert.equal(withinWorkingHours(at('2026-10-10T20:50:00Z'), late), true); // 2:20 AM
    assert.equal(withinWorkingHours(at('2026-10-10T21:00:00Z'), late), false); // 2:30 AM
    assert.equal(withinWorkingHours(at('2026-10-10T12:00:00Z'), late), true); // 5:30 PM
  });

  it('counts every hour when no hours are given', () => {
    assert.equal(withinWorkingHours(at('2026-10-10T21:00:00Z'), null), true);
  });
});
