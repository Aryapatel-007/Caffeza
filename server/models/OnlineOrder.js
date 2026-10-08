/**
 * A takeaway request from a restaurant's public page. P23 (M14),
 * docs/DB-SCHEMA.md section 26.
 *
 * It is a request, not an order. Nothing here reaches the kitchen or a bill
 * until a staff member accepts it, and accepting creates an ordinary order
 * through services/orderOpenService.js, with prices copied at that moment.
 *
 * `lines` and `estimate` are the quote the guest saw: a display record. No
 * report reads them, and they are never used to price anything.
 */
import mongoose from 'mongoose';

import { DECLINE_REASON_CODES } from '../config/onlineReasons.js';
import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const ONLINE_ORDER_STATUSES = Object.freeze({
  /** P24. Placed, not yet paid. Invisible to staff. */
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  /** P24. The payment link closed unpaid. Derived on read, too. */
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
  /** P24. The gateway could not make a payment link. */
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  WAITING: 'WAITING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED',
  /** Also derived on read for a WAITING request past `answerBy`. No scheduler writes it. */
  EXPIRED: 'EXPIRED',
});
export const ONLINE_ORDER_STATUS_VALUES = Object.freeze(Object.values(ONLINE_ORDER_STATUSES));

export const GUEST_NAME_MAX_LENGTH = 60;
export const REQUEST_NOTE_MAX_LENGTH = 200;

const quoteAddOnSchema = new mongoose.Schema(
  {
    addOnId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
    priceInPaise: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const quoteLineSchema = new mongoose.Schema(
  {
    menuItemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    itemName: { type: String, required: true, trim: true },
    variantName: { type: String, trim: true, default: null },
    unitPriceInPaise: { type: Number, required: true, min: 0 },
    addOns: { type: [quoteAddOnSchema], default: [] },
    quantity: { type: Number, required: true, min: 1 },
    notes: { type: String, trim: true, default: null },
    lineTotalInPaise: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

export const estimateSchema = new mongoose.Schema(
  {
    itemTotalInPaise: { type: Number, required: true },
    gstInPaise: { type: Number, required: true },
    roundOffInPaise: { type: Number, required: true },
    billTotalInPaise: { type: Number, required: true },
  },
  { _id: false },
);

export const consentSchema = new mongoose.Schema(
  {
    given: { type: Boolean, required: true, default: false },
    textVersion: { type: String, trim: true, default: null },
    at: { type: Date, default: null },
  },
  { _id: false },
);

const onlineOrderSchema = new mongoose.Schema({
  reference: { type: String, required: true, trim: true },
  idempotencyKey: { type: String, required: true, trim: true },

  customerName: { type: String, required: true, trim: true, maxlength: GUEST_NAME_MAX_LENGTH },
  customerPhone: { type: String, required: true, trim: true },

  lines: { type: [quoteLineSchema], default: [] },
  estimate: { type: estimateSchema, required: true },
  note: { type: String, trim: true, maxlength: REQUEST_NOTE_MAX_LENGTH, default: null },

  pickupAt: { type: Date, required: true },
  pickupWasAsap: { type: Boolean, required: true, default: false },
  businessDate: { type: String, required: true },

  status: {
    type: String,
    required: true,
    enum: ONLINE_ORDER_STATUS_VALUES,
    default: ONLINE_ORDER_STATUSES.WAITING,
  },
  /** Null while waiting for payment: the cafe's clock starts when the money arrives. */
  answerBy: { type: Date, default: null },

  /** P24. The advance in `onlinepayments`, or null when the page took no payment. */
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'OnlinePayment', default: null },

  /** SHA-256 of the guest's status token. Stripped from every response. */
  statusTokenHash: { type: String, required: true },

  marketingConsent: { type: consentSchema, default: () => ({}) },

  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  declineReasonCode: { type: String, enum: [...DECLINE_REASON_CODES, null], default: null },
  declineNote: { type: String, trim: true, maxlength: REQUEST_NOTE_MAX_LENGTH, default: null },
  acceptedChangedPrices: { type: Boolean, default: null },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  cancelledAt: { type: Date, default: null },
});

onlineOrderSchema.plugin(baseSchemaPlugin);
onlineOrderSchema.plugin(tenantGuardPlugin);

onlineOrderSchema.index({ restaurantId: 1, branchId: 1, status: 1, createdAt: 1 });
onlineOrderSchema.index({ restaurantId: 1, reference: 1 }, { unique: true });
onlineOrderSchema.index({ restaurantId: 1, branchId: 1, idempotencyKey: 1 }, { unique: true });
onlineOrderSchema.index({ restaurantId: 1, branchId: 1, customerPhone: 1, status: 1 });

applyJsonTransform(onlineOrderSchema, { strip: ['statusTokenHash'] });

export const OnlineOrder = mongoose.model('OnlineOrder', onlineOrderSchema);

export default OnlineOrder;
