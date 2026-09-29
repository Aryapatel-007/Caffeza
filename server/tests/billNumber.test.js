/**
 * Bill number allocation.
 *
 * CLAUDE.md: bill numbers are generated on the server, are sequential, and are
 * never reused. BUILD-PLAN section 8 names the gap problem specifically: if the
 * server dies between reserving a number and saving the bill, a number is lost
 * and an auditor has a question nobody can answer.
 *
 * These tests exercise the allocator directly, without going through an
 * endpoint, because the guarantee lives in how it interacts with a transaction
 * rather than in any HTTP behaviour.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { Bill } from '../models/Bill.js';
import { Counter, COUNTER_NAMES } from '../models/Counter.js';
import { formatBillNumber, reserveBillNumber } from '../services/billNumberService.js';
import { TransactionRequiredError } from '../utils/errors.js';
import {
  clearTestDatabase,
  startTestDatabase,
  stopTestDatabase,
  supportsTransactions,
} from './helpers/testDatabase.js';

const restaurantId = new mongoose.Types.ObjectId();
const branchId = new mongoose.Types.ObjectId();
const otherBranchId = new mongoose.Types.ObjectId();

/** Runs `work` in a real transaction, the way the billing service will. */
async function inTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

before(async () => {
  await startTestDatabase();

  /**
   * Build the indexes before anything races.
   *
   * The concurrency test below depends on the unique index on
   * { restaurantId, branchId, name, scope }: when two transactions both find no
   * counter and both try to upsert one, the index is what makes the second fail
   * with a duplicate key, which withTransaction then retries. Without the index
   * both inserts succeed and both callers are handed sequence 1.
   *
   * This bit the test itself. It passed when run alone and failed under the
   * full suite, because index creation is asynchronous and had not finished in
   * time. Production builds indexes during a deploy (autoIndex is off), so the
   * index is there; the test has to be explicit about waiting for it.
   */
  await Counter.init();
  await Bill.init();
});

after(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
});

describe('formatBillNumber', () => {
  it('zero-pads to six so the series reads and sorts', () => {
    assert.equal(formatBillNumber('2026-27', 1), '2026-27/000001');
    assert.equal(formatBillNumber('2026-27', 148), '2026-27/000148');
    assert.equal(formatBillNumber('2026-27', 999999), '2026-27/999999');
  });
});

describe('reserveBillNumber', () => {
  it('refuses to run without a transaction', async () => {
    /**
     * The point of the whole file. Every other write in this project degrades
     * gracefully on a standalone mongod; this one must not, because a gap-free
     * sequence has no degraded mode.
     */
    await assert.rejects(
      () => reserveBillNumber({ restaurantId, branchId, at: new Date() }, null),
      TransactionRequiredError,
    );
  });

  it('starts at 1 and counts up', async (t) => {
    if (!supportsTransactions()) return t.skip('needs a replica set');

    const at = new Date('2026-08-30T10:00:00Z');
    const first = await inTransaction((s) => reserveBillNumber({ restaurantId, branchId, at }, s));
    const second = await inTransaction((s) => reserveBillNumber({ restaurantId, branchId, at }, s));

    assert.deepEqual(first, {
      billNumber: '2026-27/000001',
      financialYear: '2026-27',
      billSequence: 1,
    });
    assert.equal(second.billSequence, 2);
    assert.equal(second.billNumber, '2026-27/000002');
  });

  it('restarts the sequence in a new financial year', async (t) => {
    if (!supportsTransactions()) return t.skip('needs a replica set');

    const march = new Date('2027-03-31T10:00:00Z');
    const april = new Date('2027-04-01T10:00:00Z');

    const last = await inTransaction((s) =>
      reserveBillNumber({ restaurantId, branchId, at: march }, s),
    );
    const first = await inTransaction((s) =>
      reserveBillNumber({ restaurantId, branchId, at: april }, s),
    );

    assert.equal(last.billNumber, '2026-27/000001');
    assert.equal(first.billNumber, '2027-28/000001', 'April starts a fresh series');

    // Two counter documents, not one that got reset. The old year's value is
    // still readable, which is what makes last year's series auditable.
    const counters = await Counter.find({ restaurantId, name: COUNTER_NAMES.BILL }).sort({
      scope: 1,
    });
    assert.deepEqual(
      counters.map((c) => [c.scope, c.value]),
      [
        ['2026-27', 1],
        ['2027-28', 1],
      ],
    );
  });

  it('keeps a separate sequence per branch', async (t) => {
    if (!supportsTransactions()) return t.skip('needs a replica set');

    const at = new Date('2026-08-30T10:00:00Z');
    await inTransaction((s) => reserveBillNumber({ restaurantId, branchId, at }, s));
    const other = await inTransaction((s) =>
      reserveBillNumber({ restaurantId, branchId: otherBranchId, at }, s),
    );

    assert.equal(other.billSequence, 1, 'a second branch starts its own series');
  });

  it('never hands the same number to two concurrent callers', async (t) => {
    if (!supportsTransactions()) return t.skip('needs a replica set');

    const at = new Date('2026-08-30T10:00:00Z');
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        inTransaction((s) => reserveBillNumber({ restaurantId, branchId, at }, s)),
      ),
    );

    const sequences = results.map((r) => r.billSequence).sort((a, b) => a - b);
    assert.deepEqual(
      sequences,
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      'ten concurrent callers got ten distinct consecutive numbers',
    );
  });

  it('rolls the number back when the transaction that reserved it aborts', async (t) => {
    if (!supportsTransactions()) return t.skip('needs a replica set');

    /**
     * THE GAP TEST. This is why the number is reserved inside the caller's
     * transaction rather than before it.
     *
     * A reservation followed by a failed write must leave no hole: the next
     * bill to succeed takes the number the failed one was going to have.
     */
    const at = new Date('2026-08-30T10:00:00Z');

    await assert.rejects(
      () =>
        inTransaction(async (session) => {
          await reserveBillNumber({ restaurantId, branchId, at }, session);
          throw new Error('the bill insert failed after the number was taken');
        }),
      /the bill insert failed/,
    );

    const next = await inTransaction((s) => reserveBillNumber({ restaurantId, branchId, at }, s));
    assert.equal(next.billSequence, 1, 'no number was burned by the failed attempt');
    assert.equal(next.billNumber, '2026-27/000001');
  });
});

describe('the bill uniqueness indexes', () => {
  const baseBill = (overrides = {}) => ({
    restaurantId,
    branchId,
    billNumber: '2026-27/000001',
    financialYear: '2026-27',
    billSequence: 1,
    orderId: new mongoose.Types.ObjectId(),
    orderNumber: 1,
    orderType: 'DINE_IN',
    businessDate: '2026-08-30',
    lines: [],
    subtotalInPaise: 0,
    grandTotalInPaise: 0,
    billedBy: new mongoose.Types.ObjectId(),
    billedAt: new Date(),
    ...overrides,
  });

  it('refuses two bills with the same number in one restaurant', async () => {
    await Bill.create(baseBill());

    await assert.rejects(
      () => Bill.create(baseBill({ billSequence: 2 })),
      (error) => error.code === 11000,
    );
  });

  it('allows one live bill per order, and a second only after the first is voided', async () => {
    /**
     * The partial unique index on { restaurantId, orderId } filtered to
     * isVoided:false. Voiding a bill has to leave the order billable again,
     * or a mis-billed table can never be corrected.
     */
    const orderId = new mongoose.Types.ObjectId();

    const first = await Bill.create(baseBill({ orderId }));

    await assert.rejects(
      () => Bill.create(baseBill({ orderId, billNumber: '2026-27/000002', billSequence: 2 })),
      (error) => error.code === 11000,
      'a second live bill on one order is refused by the database, not by a controller',
    );

    first.isVoided = true;
    first.voidedAt = new Date();
    first.voidReason = 'Wrong table';
    await first.save();

    const replacement = await Bill.create(
      baseBill({ orderId, billNumber: '2026-27/000002', billSequence: 2 }),
    );
    assert.equal(replacement.billSequence, 2, 'the replacement takes a fresh number');

    // And the voided one keeps its number: it is spent, never reissued.
    // Scoped, not findById: the tenant guard refuses an unfiltered read, which
    // is the whole point of it and it caught this line when it was written
    // without the filter.
    const kept = await Bill.findOne({ _id: first._id, restaurantId });
    assert.equal(kept.billNumber, '2026-27/000001');
  });
});
