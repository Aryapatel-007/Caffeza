/**
 * A raw material with a stock level. Paneer, oil, a soft-drink bottle.
 *
 * Shapes come from docs/DB-SCHEMA.md section 14.
 *
 * Two things in this file matter more than the rest of it:
 *
 * 1. `currentQtyInBase` is a CACHE, not the truth. The ledger in
 *    `stockmovements` is the truth. This field exists only so a stock list
 *    does not aggregate the whole ledger on every read, and it is written
 *    only by `$inc` inside the same transaction as the movement that changes
 *    it. Never assign it directly; `PATCH /ingredients/:id` refuses it with
 *    400 for exactly this reason.
 *
 * 2. It has no `min: 0`. Negative stock is allowed on purpose — the kitchen
 *    made the dish whether the system agreed there was paneer left, and a
 *    system that blocks a sale over a wrong number gets worked around within a
 *    week. See services/ingredientService.js for how that reads on screen.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

/**
 * Exactly three. Decision D11: this is the factor-of-1000 bug from
 * BUILD-PLAN section 8 designed out rather than guarded against. A stock
 * level and a recipe quantity are always integers in one of these.
 */
export const BASE_UNITS = Object.freeze({
  G: 'G',
  ML: 'ML',
  PIECE: 'PIECE',
});
export const BASE_UNIT_VALUES = Object.freeze(Object.values(BASE_UNITS));

export const INGREDIENT_NAME_MAX_LENGTH = 80;
export const PURCHASE_UNIT_NAME_MAX_LENGTH = 20;

const wholeNumber = {
  validator: Number.isInteger,
  message: 'Must be a whole number.',
};

const ingredientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: INGREDIENT_NAME_MAX_LENGTH,
  },

  /** Internal, derived. Never in a response. Same technique as M1, M2. */
  nameLower: { type: String, required: true },

  /** Immutable once any stockmovements document references this ingredient. */
  baseUnit: { type: String, required: true, enum: BASE_UNIT_VALUES },

  /** A cache. The ledger is the truth. May be negative. See the file note. */
  currentQtyInBase: {
    type: Number,
    required: true,
    default: 0,
    validate: wholeNumber,
  },

  lowStockThresholdInBase: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: wholeNumber,
  },

  /** Display only. "kg", "litre", "packet". Null means the base unit is also how it is bought. */
  purchaseUnitName: {
    type: String,
    trim: true,
    maxlength: PURCHASE_UNIT_NAME_MAX_LENGTH,
    default: null,
  },

  /** How many base units are in one purchase unit. 1 kg of paneer is 1000 with baseUnit G. */
  unitsPerBase: {
    type: Number,
    required: true,
    default: 1,
    min: 1,
    validate: wholeNumber,
  },

  isActive: { type: Boolean, required: true, default: true },
});

ingredientSchema.plugin(baseSchemaPlugin);
ingredientSchema.plugin(tenantGuardPlugin);

ingredientSchema.index({ restaurantId: 1, branchId: 1, nameLower: 1 }, { unique: true });
ingredientSchema.index({ restaurantId: 1, branchId: 1, isActive: 1, name: 1 });

/** Same derived-lowercase technique as categories, menu items and tables. */
ingredientSchema.pre('validate', function deriveNameLower() {
  if (typeof this.name === 'string') this.nameLower = this.name.trim().toLowerCase();
});

applyJsonTransform(ingredientSchema, { strip: ['nameLower'] });

export const Ingredient = mongoose.model('Ingredient', ingredientSchema);

export default Ingredient;
