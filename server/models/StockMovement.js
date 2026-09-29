/**
 * The ledger. Every change to a stock level is one row here, and this
 * collection is the truth about what happened.
 *
 * Shapes come from docs/DB-SCHEMA.md section 16.
 *
 * Three things in this file matter more than the rest of it:
 *
 * 1. APPEND ONLY. There is no update and no delete anywhere for this
 *    collection, and no code path in this project writes to an existing
 *    movement. A correction is a new, compensating movement with its own
 *    reason and its own actor.
 *
 * 2. `eventKey` plus its unique index is the whole idempotency guarantee. A
 *    retried fire, a duplicated event, must not deduct twice, and the second
 *    deduction is invisible: the stock number is simply wrong from then on
 *    and nothing ever flags it. See services/stockMovementService.js for how
 *    a duplicate key is turned into a no-op rather than an error.
 *
 * 3. `qtyInBase` is signed and is never zero. Negative consumes, positive
 *    adds. The base unit itself lives on the ingredient, not repeated here.
 */
import mongoose from 'mongoose';

import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

/**
 * Closed, like the role list.
 *
 * DEDUCTION and CANCELLATION_RETURN are written only by the fire and cancel
 * paths, never accepted from a client -- POST /ingredients/:id/movements
 * refuses both with 400.
 */
export const MOVEMENT_TYPES = Object.freeze({
  DEDUCTION: 'DEDUCTION',
  CANCELLATION_RETURN: 'CANCELLATION_RETURN',
  RECEIVED: 'RECEIVED',
  WASTAGE: 'WASTAGE',
  SPILLAGE: 'SPILLAGE',
  RECOUNT: 'RECOUNT',
  RETURN: 'RETURN',
});
export const MOVEMENT_TYPE_VALUES = Object.freeze(Object.values(MOVEMENT_TYPES));

/** The types a client may request directly. The other two are server-only. */
export const MANUAL_MOVEMENT_TYPES = Object.freeze(
  MOVEMENT_TYPE_VALUES.filter(
    (type) => type !== MOVEMENT_TYPES.DEDUCTION && type !== MOVEMENT_TYPES.CANCELLATION_RETURN,
  ),
);

export const SOURCE_TYPES = Object.freeze({
  ORDER_LINE: 'ORDER_LINE',
  MANUAL: 'MANUAL',
});
export const SOURCE_TYPE_VALUES = Object.freeze(Object.values(SOURCE_TYPES));

export const MOVEMENT_REASON_MAX_LENGTH = 200;

const wholeNumber = {
  validator: Number.isInteger,
  message: 'Must be a whole number.',
};

const nonZeroWholeNumber = {
  validator: (value) => Number.isInteger(value) && value !== 0,
  message: 'Must be a non-zero whole number.',
};

const stockMovementSchema = new mongoose.Schema({
  ingredientId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Ingredient' },

  qtyInBase: { type: Number, required: true, validate: nonZeroWholeNumber },

  type: { type: String, required: true, enum: MOVEMENT_TYPE_VALUES },

  /**
   * The idempotency key.
   *
   *   `${orderLineId}:${type}`  for sourceType ORDER_LINE
   *   `MANUAL:${new ObjectId()}` for sourceType MANUAL
   *
   * Per LINE, not per order, because lines fire in separate tickets at
   * different times. Includes `type` so a CANCELLATION_RETURN can exist
   * alongside the DEDUCTION it reverses without colliding on the same key.
   */
  eventKey: { type: String, required: true },

  sourceType: { type: String, required: true, enum: SOURCE_TYPE_VALUES },

  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  orderLineId: { type: mongoose.Schema.Types.ObjectId, default: null },

  /** Required for every MANUAL movement, enforced in the service, not here. */
  reason: {
    type: String,
    trim: true,
    maxlength: MOVEMENT_REASON_MAX_LENGTH,
    default: null,
  },

  /** The ingredient's quantity after this movement. A running-balance snapshot. */
  resultingQtyInBase: { type: Number, required: true, validate: wholeNumber },

  actorId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  at: { type: Date, required: true },
});

stockMovementSchema.plugin(baseSchemaPlugin);
stockMovementSchema.plugin(tenantGuardPlugin);

/** The idempotency guarantee. An index, not a service-layer check, because a check has a race. */
stockMovementSchema.index({ restaurantId: 1, eventKey: 1 }, { unique: true });

/** One ingredient's ledger, newest first. */
stockMovementSchema.index({ restaurantId: 1, branchId: 1, ingredientId: 1, at: -1 });

/** The consumption read M6 will want. */
stockMovementSchema.index({ restaurantId: 1, branchId: 1, at: -1 });

export const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

export default StockMovement;
