/**
 * What one sellable thing consumes. The join between M1's menu and M4's stock.
 *
 * Shapes come from docs/DB-SCHEMA.md section 15.
 *
 * The one thing worth understanding before editing this file is the variant
 * fallback: when a line sells, deduction looks for a recipe on this exact
 * `variantId` first, then for the item-level recipe (`variantId: null`), then
 * gives up and deducts nothing. `services/recipeService.js` is where that
 * order lives; this file only shapes the record.
 */
import mongoose from 'mongoose';

import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const MAX_RECIPE_ITEMS = 50;

const wholeNumber = {
  validator: Number.isInteger,
  message: 'Must be a whole number.',
};

/**
 * `_id: false`. A recipe line is identified by its `ingredientId`, which is
 * unique within the recipe (enforced in services/recipeService.js, not by the
 * schema, because Mongoose has no built-in "unique within this array"), so it
 * needs no id of its own.
 */
const recipeItemSchema = new mongoose.Schema(
  {
    ingredientId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Ingredient' },
    /** In that ingredient's own base unit, per one unit of the dish. */
    qtyInBase: { type: Number, required: true, min: 1, validate: wholeNumber },
  },
  { _id: false },
);

const recipeSchema = new mongoose.Schema({
  menuItemId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'MenuItem' },

  /** Null means this is the item-level recipe. */
  variantId: { type: mongoose.Schema.Types.ObjectId, default: null },

  items: {
    type: [recipeItemSchema],
    default: [],
    validate: {
      validator: (items) => items.length <= MAX_RECIPE_ITEMS,
      message: `A recipe cannot have more than ${MAX_RECIPE_ITEMS} ingredients.`,
    },
  },

  isActive: { type: Boolean, required: true, default: true },
});

recipeSchema.plugin(baseSchemaPlugin);
recipeSchema.plugin(tenantGuardPlugin);

/** One recipe per item, and one per variant. */
recipeSchema.index(
  { restaurantId: 1, branchId: 1, menuItemId: 1, variantId: 1 },
  { unique: true },
);

/** "What uses this ingredient" -- also the lookup that guards deactivating one. */
recipeSchema.index({ restaurantId: 1, 'items.ingredientId': 1 });

export const Recipe = mongoose.model('Recipe', recipeSchema);

export default Recipe;
