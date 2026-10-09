/**
 * The cash drawer's non-sale entries: the opening float, cash paid in, and cash
 * paid out. M16, built in P10. Shapes from docs/DB-SCHEMA.md section 24.
 *
 * The business date is always the business day of the moment the entry was
 * written. No request can set it, so nothing can be back-dated into a day.
 * Voided, never deleted.
 */
import mongoose from 'mongoose';

import { MAX_PAISE } from '../utils/money.js';
import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const CASH_MOVEMENT_TYPES = Object.freeze({
  OPENING_FLOAT: 'OPENING_FLOAT',
  PAID_IN: 'PAID_IN',
  PAID_OUT: 'PAID_OUT',
});
export const CASH_MOVEMENT_TYPE_VALUES = Object.freeze(Object.values(CASH_MOVEMENT_TYPES));

/** One row of a count by notes and coins. P25 Part F. Shared with dayclosures. */
export const cashCountRowSchema = new mongoose.Schema(
  {
    valueInPaise: { type: Number, required: true, min: 1 },
    kind: { type: String, required: true, enum: ['NOTE', 'COIN'] },
    count: { type: Number, required: true, min: 0, max: 10_000, validate: { validator: Number.isInteger, message: 'Must be a whole number.' } },
  },
  { _id: false },
);

const cashMovementSchema = new mongoose.Schema({
  type: { type: String, required: true, enum: CASH_MOVEMENT_TYPE_VALUES },
  amountInPaise: {
    type: Number,
    required: true,
    min: 1,
    max: MAX_PAISE,
    validate: { validator: Number.isInteger, message: 'Must be a whole number of paise.' },
  },
  reason: { type: String, trim: true, maxlength: 200, default: null },
  businessDate: { type: String, required: true },
  at: { type: Date, required: true },
  by: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  // P28. The owner or manager who typed their PIN for a cashier's paid in or paid out.
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  isVoided: { type: Boolean, required: true, default: false },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  voidReason: { type: String, trim: true, maxlength: 200, default: null },

  /** P25 Part F. An opening float counted by notes and coins: [{ valueInPaise, kind, count }]. */
  cashCount: { type: [cashCountRowSchema], default: undefined },
});

cashMovementSchema.plugin(baseSchemaPlugin);
cashMovementSchema.plugin(tenantGuardPlugin);

/**
 * One live opening float per business date. Partial on equality only, as
 * MongoDB requires: a voided float leaves the filter and frees the slot.
 */
cashMovementSchema.index(
  { restaurantId: 1, branchId: 1, businessDate: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: 'OPENING_FLOAT', isVoided: false } },
);

/** A day's drawer. */
cashMovementSchema.index({ restaurantId: 1, branchId: 1, businessDate: 1, at: 1 });

applyJsonTransform(cashMovementSchema);

export const CashMovement = mongoose.model('CashMovement', cashMovementSchema);

export default CashMovement;
