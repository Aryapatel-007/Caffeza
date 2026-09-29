/**
 * The soft delete plugin. Optional, opted into per model.
 *
 * A bill, an order or a stock entry is never removed from the database. It is
 * marked voided, with a reason and the user who did it, and the row stays
 * forever. That audit trail is the feature that sells this product to an owner
 * who suspects a cashier.
 *
 * Models that can be cancelled apply this. Models that cannot, do not.
 *
 *   schema.plugin(softDeletePlugin);
 *   const openOrders = await Order.find(scoped(req)).notVoided();
 *
 * Watch the other half of this trade. Once nothing is hard deleted, every list
 * query has to exclude voided rows, and forgetting once puts a cancelled order
 * back into a sales total. That is what notVoided() is for.
 */
import mongoose from 'mongoose';

export function softDeletePlugin(schema) {
  schema.add({
    isVoided: { type: Boolean, default: false },
    voidedAt: { type: Date, default: null },

    /** TODO(M0-B): add `ref: 'User'` once the User model exists. */
    voidedBy: { type: mongoose.Schema.Types.ObjectId, default: null },

    voidReason: {
      type: String,
      trim: true,
      default: null,
      // A void without a reason is not an audit trail, it is a hole in one.
      required: function requiredWhenVoided() {
        return this.isVoided === true;
      },
    },
  });

  /** Excludes voided rows. Use on every list query on a voidable model. */
  schema.query.notVoided = function notVoided() {
    return this.where({ isVoided: false });
  };
}

export default softDeletePlugin;
