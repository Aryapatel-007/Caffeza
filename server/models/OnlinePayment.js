/**
 * An advance paid online through the cafe's own Razorpay account. P24,
 * docs/DB-SCHEMA.md section 29.
 *
 * The one record of that money, from the payment link to the last refund.
 * Money that arrived is always accounted for here: applied to a bill,
 * refunded, or forfeited. Never deleted.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const ONLINE_PAYMENT_KINDS = Object.freeze({ TAKEAWAY: 'TAKEAWAY', DEPOSIT: 'DEPOSIT' });

export const ONLINE_PAYMENT_STATUSES = Object.freeze({
  CREATED: 'CREATED',
  PAID: 'PAID',
  EXPIRED: 'EXPIRED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTLY_REFUNDED: 'PARTLY_REFUNDED',
  REFUND_FAILED: 'REFUND_FAILED',
  FORFEITED: 'FORFEITED',
});

export const REFUND_STATUSES = Object.freeze({ PROCESSED: 'PROCESSED', PENDING: 'PENDING', FAILED: 'FAILED' });

const paise = { type: Number, min: 0, validate: { validator: Number.isInteger, message: 'Must be whole paise.' } };

const refundSchema = new mongoose.Schema(
  {
    gatewayRefundId: { type: String, default: null },
    amountInPaise: { ...paise, required: true },
    reason: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: Object.values(REFUND_STATUSES) },
    failureMessage: { type: String, default: null },
    at: { type: Date, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false },
);

const onlinePaymentSchema = new mongoose.Schema({
  kind: { type: String, required: true, enum: Object.values(ONLINE_PAYMENT_KINDS) },
  onlineOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'OnlineOrder', default: null },
  reservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', default: null },
  amountInPaise: { ...paise, required: true },
  status: { type: String, required: true, enum: Object.values(ONLINE_PAYMENT_STATUSES) },
  provider: { type: String, required: true, enum: ['RAZORPAY'], default: 'RAZORPAY' },

  gatewayLinkId: { type: String, default: null },
  payUrl: { type: String, default: null },
  expiresAt: { type: Date, required: true },
  gatewayPaymentId: { type: String, default: null },
  paidAt: { type: Date, default: null },
  lastCheckedAt: { type: Date, default: null },

  refunds: { type: [refundSchema], default: [] },
  refundedInPaise: { ...paise, required: true, default: 0 },

  appliedInPaise: { ...paise, required: true, default: 0 },
  appliedToBillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', default: null },
  appliedAt: { type: Date, default: null },
  appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  forfeitedAt: { type: Date, default: null },
});

onlinePaymentSchema.plugin(baseSchemaPlugin);
onlinePaymentSchema.plugin(tenantGuardPlugin);

onlinePaymentSchema.index(
  { restaurantId: 1, gatewayLinkId: 1 },
  { unique: true, partialFilterExpression: { gatewayLinkId: { $type: 'string' } } },
);
onlinePaymentSchema.index({ restaurantId: 1, onlineOrderId: 1 });
onlinePaymentSchema.index({ restaurantId: 1, reservationId: 1 });
onlinePaymentSchema.index({ restaurantId: 1, branchId: 1, status: 1 });

// The pay URL is the guest's; staff never need it in a list.
applyJsonTransform(onlinePaymentSchema);

export const OnlinePayment = mongoose.model('OnlinePayment', onlinePaymentSchema);

export default OnlinePayment;
