/**
 * The tenant filter, in one place.
 *
 * Every controller builds its database filter by spreading this:
 *
 *   const order = await Order.findOne({ ...scoped(req), _id: orderId });
 *
 * That is shorter to type than the version that leaks data across
 * restaurants, which is the only reliable way to make a convention stick.
 *
 * The values come from `req.restaurantId` and `req.branchId`, which the tenant
 * middleware sets from the verified token and from nowhere else.
 */
import mongoose from 'mongoose';

export function scoped(req) {
  if (!req?.restaurantId) {
    // Fail loud. A missing restaurantId here means the route was wired without
    // the tenant middleware, and every query on it would be unscoped.
    throw new Error(
      'scoped(req) was called before the tenant middleware ran. Check the middleware order on this route.',
    );
  }

  return { restaurantId: req.restaurantId, branchId: req.branchId };
}

/**
 * The same tenant filter, but with real ObjectIds, for an aggregation pipeline.
 *
 * `scoped(req)` is fine for find/update, because Mongoose casts a filter
 * against the schema on the way through. An aggregation pipeline is handed to
 * the server as-is and NOTHING casts it. `req.restaurantId` is a string, taken
 * from the JWT, so a `$match` built from `scoped(req)` compares a string
 * against an ObjectId, matches nothing, and returns zero.
 *
 * That is the worst shape a bug can take here: no error, no empty-state, just a
 * total that is quietly wrong. M3's bill list running total shipped with it for
 * about an hour and a test caught it. Use this in every `$match` that scopes a
 * pipeline by tenant.
 */
export function scopedForAggregate(req) {
  if (!req?.restaurantId || !req?.branchId) {
    throw new Error(
      'scopedForAggregate() called before the tenant middleware set restaurantId and branchId.',
    );
  }

  return {
    restaurantId: new mongoose.Types.ObjectId(String(req.restaurantId)),
    branchId: new mongoose.Types.ObjectId(String(req.branchId)),
  };
}
