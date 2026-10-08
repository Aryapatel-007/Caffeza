/**
 * Money owed back to a guest. P25 Part E, docs/DB-SCHEMA.md section 31.
 *
 * Written when an item is cancelled on a bill already paid by card, UPI or a
 * platform, and the re-issued bill comes to less than was paid. It records
 * money returned outside this system, on the card machine or by UPI, and
 * moves none inside it. A manager marks it done with a reference.
 */
import mongoose from 'mongoose';

import { MAX_PAISE } from '../utils/money.js';
import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const REFUND_STATUSES = Object.freeze({ OWED: 'OWED', REFUNDED: 'REFUNDED' });
export const REFUND_STATUS_VALUES = Object.freeze(Object.values(REFUND_STATUSES));
export const REFUND_REFERENCE_MAX_LENGTH = 100;

const refundSchema = new mongoose.Schema({
  billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', default: null },
  billNumber: { type: String, trim: true, default: null },
  voidedBillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', required: true },
  voidedBillNumber: { type: String, trim: true, required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  method: { type: String, trim: true, required: true },
  methodName: { type: String, trim: true, required: true },
  methodKind: { type: String, trim: true, required: true },
  amountInPaise: {
    type: Number,
    required: true,
    min: 1,
    max: MAX_PAISE,
    validate: { validator: Number.isInteger, message: 'Must be a whole number of paise.' },
  },
  businessDate: { type: String, required: true },
  status: { type: String, required: true, enum: REFUND_STATUS_VALUES, default: REFUND_STATUSES.OWED },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  refundedAt: { type: Date, default: null },
  refundedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reference: { type: String, trim: true, maxlength: REFUND_REFERENCE_MAX_LENGTH, default: null },
});

refundSchema.plugin(baseSchemaPlugin);
refundSchema.plugin(tenantGuardPlugin);

/** Day Close and R2's "Refunds owed" line. */
refundSchema.index({ restaurantId: 1, branchId: 1, businessDate: 1, status: 1 });
/** What is still owed, newest first. */
refundSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });

applyJsonTransform(refundSchema);

export const Refund = mongoose.model('Refund', refundSchema);
