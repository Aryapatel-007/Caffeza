/**
 * A menu section. "Starters", "Main Course", "Beverages".
 *
 * An ordinary tenant collection: it is not a tenancy root, so it applies both
 * plugins in full and every query against it is forced to carry a restaurantId.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const CATEGORY_NAME_MAX_LENGTH = 60;

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: CATEGORY_NAME_MAX_LENGTH,
  },

  /**
   * Derived from `name`, maintained here and never by a caller.
   *
   * Case-insensitive uniqueness in Mongo otherwise needs a collation-aware
   * index, and a query written without the matching collation silently misses
   * that index and answers case-sensitively. A lowercase field makes the
   * uniqueness ordinary and visible in the index definition below.
   *
   * Stripped in toJSON. It serves an index and is not part of the contract.
   */
  nameLower: { type: String, required: true },

  displayOrder: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'Must be a whole number.',
    },
  },

  /**
   * The delete. There is no DELETE route.
   *
   * Switching this off does not cascade to the items in the category. They keep
   * their own isActive and simply stop being visible while their category is
   * off, so reactivating brings them back exactly as they were.
   */
  isActive: { type: Boolean, required: true, default: true },
});

categorySchema.plugin(baseSchemaPlugin);
categorySchema.plugin(tenantGuardPlugin);

/**
 * Runs before validation so the `required` above is satisfied by a value this
 * model derived, not by one a caller sent. `name` is already trimmed by the
 * schema setter at this point.
 */
categorySchema.pre('validate', function deriveNameLower() {
  if (typeof this.name === 'string') this.nameLower = this.name.trim().toLowerCase();
});

/** Two categories in one branch cannot share a name, case-insensitively. */
categorySchema.index({ restaurantId: 1, branchId: 1, nameLower: 1 }, { unique: true });

/** The ordered list read. */
categorySchema.index({ restaurantId: 1, branchId: 1, displayOrder: 1 });

// After the plugins, so the strip wins over the plain transform baseSchema set.
applyJsonTransform(categorySchema, { strip: ['nameLower'] });

export const Category = mongoose.model('Category', categorySchema);

export default Category;
