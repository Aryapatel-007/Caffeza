/**
 * Tenant guard tests.
 *
 * Tenant isolation is the whole product. This file proves that a query which
 * forgets its restaurantId filter throws instead of quietly returning another
 * restaurant data.
 *
 * No database is needed. The guard runs as a pre hook, so it fires before the
 * driver is ever called. A query that gets past the guard fails later with a
 * buffering timeout, and that difference is exactly what these tests measure.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import mongoose from 'mongoose';

import { baseSchemaPlugin } from '../models/plugins/baseSchema.js';
import { hasRestaurantIdFilter, tenantGuardPlugin } from '../models/plugins/tenantGuard.js';

// Without a connection, anything that reaches the driver is buffered. Keep
// that wait short: these tests are about what happens before it.
mongoose.set('bufferTimeoutMS', 200);

/** A throwaway model that exists only in this file. */
const guardedSchema = new mongoose.Schema({ name: String });
guardedSchema.plugin(baseSchemaPlugin);
guardedSchema.plugin(tenantGuardPlugin);
const Guarded = mongoose.model('TenantGuardTestModel', guardedSchema);

let restaurantId;

before(() => {
  restaurantId = new mongoose.Types.ObjectId();
});

/** Runs a query and reports which wall it hit. */
async function outcome(run) {
  try {
    await run();
    return 'reached the database';
  } catch (error) {
    return error?.name === 'TenantFilterMissingError' ? 'blocked' : 'passed the guard';
  }
}

describe('every guarded operation blocks a query with no restaurantId', () => {
  const cases = {
    find: () => Guarded.find({}),
    findOne: () => Guarded.findOne({ name: 'paneer tikka' }),
    findOneAndUpdate: () => Guarded.findOneAndUpdate({ name: 'a' }, { name: 'b' }),
    findOneAndDelete: () => Guarded.findOneAndDelete({ name: 'a' }),
    countDocuments: () => Guarded.countDocuments({}),
    updateOne: () => Guarded.updateOne({ name: 'a' }, { name: 'b' }),
    updateMany: () => Guarded.updateMany({}, { name: 'b' }),
    deleteOne: () => Guarded.deleteOne({ name: 'a' }),
    deleteMany: () => Guarded.deleteMany({}),
    aggregate: () => Guarded.aggregate([{ $group: { _id: null, total: { $sum: 1 } } }]),
  };

  for (const [operation, run] of Object.entries(cases)) {
    it(`blocks ${operation}`, async () => {
      assert.equal(await outcome(run), 'blocked');
    });
  }
});

describe('the error says what went wrong and where', () => {
  it('names the model and the operation', async () => {
    await assert.rejects(
      () => Guarded.find({}),
      (error) => {
        assert.equal(error.name, 'TenantFilterMissingError');
        assert.equal(error.statusCode, 500);
        assert.equal(error.modelName, 'TenantGuardTestModel');
        assert.equal(error.operation, 'find');
        assert.match(error.message, /TenantGuardTestModel\.find/);
        return true;
      },
    );
  });
});

describe('a scoped query is allowed through', () => {
  it('allows a plain restaurantId filter', async () => {
    assert.equal(await outcome(() => Guarded.find({ restaurantId })), 'passed the guard');
  });

  it('allows an $and where one branch is scoped', async () => {
    assert.equal(
      await outcome(() => Guarded.find({ $and: [{ restaurantId }, { name: 'a' }] })),
      'passed the guard',
    );
  });

  it('allows an $or where every branch is scoped', async () => {
    assert.equal(
      await outcome(() =>
        Guarded.find({ $or: [{ restaurantId, name: 'a' }, { restaurantId, name: 'b' }] }),
      ),
      'passed the guard',
    );
  });

  it('allows an aggregate whose first stage is a scoped $match', async () => {
    assert.equal(
      await outcome(() => Guarded.aggregate([{ $match: { restaurantId } }, { $count: 'total' }])),
      'passed the guard',
    );
  });
});

describe('mentioning restaurantId is not the same as filtering by it', () => {
  it('blocks an $or where one branch is unscoped, because that branch widens the query', async () => {
    assert.equal(
      await outcome(() => Guarded.find({ $or: [{ restaurantId }, { name: 'a' }] })),
      'blocked',
    );
  });

  it('blocks a $nor, which means every restaurant except this one', async () => {
    assert.equal(await outcome(() => Guarded.find({ $nor: [{ restaurantId }] })), 'blocked');
  });

  it('blocks restaurantId set to undefined', async () => {
    assert.equal(await outcome(() => Guarded.find({ restaurantId: undefined })), 'blocked');
  });

  it('blocks an aggregate whose $match comes after another stage', async () => {
    assert.equal(
      await outcome(() =>
        Guarded.aggregate([{ $sort: { createdAt: -1 } }, { $match: { restaurantId } }]),
      ),
      'blocked',
    );
  });
});

describe('the escape hatch', () => {
  it('lets a query through when skipTenantGuard is set', async () => {
    assert.equal(
      // Test only: proving the documented hatch works. Real uses need a comment
      // on the line above saying why the operation is genuinely global.
      await outcome(() => Guarded.find({}).setOptions({ skipTenantGuard: true })),
      'passed the guard',
    );
  });

  it('lets an aggregate through when skipTenantGuard is set', async () => {
    assert.equal(
      // Test only: see the note above.
      await outcome(() => Guarded.aggregate([{ $count: 'total' }]).option({ skipTenantGuard: true })),
      'passed the guard',
    );
  });

  it('removes the flag so it never travels on to the driver', async () => {
    // Test only: see the note above.
    const query = Guarded.find({}).setOptions({ skipTenantGuard: true });
    await outcome(() => query);
    assert.equal('skipTenantGuard' in query.getOptions(), false);
  });

  it('is opt-in only, so an ordinary query is still blocked', async () => {
    assert.equal(await outcome(() => Guarded.find({})), 'blocked');
  });
});

describe('hasRestaurantIdFilter', () => {
  it('reads a filter without needing a query object', () => {
    assert.equal(hasRestaurantIdFilter({ restaurantId: 'x' }), true);
    assert.equal(hasRestaurantIdFilter({}), false);
    assert.equal(hasRestaurantIdFilter(null), false);
    assert.equal(hasRestaurantIdFilter(undefined), false);
    assert.equal(hasRestaurantIdFilter({ $and: [] }), false);
    assert.equal(hasRestaurantIdFilter({ $or: [] }), false);
  });
});
