/**
 * A delivery platform's order, from arrival to delivery. P25 Part H,
 * docs/DB-SCHEMA.md section 36. Not `onlineorders`, which P23 uses for the
 * restaurant's own page.
 */
import mongoose from 'mongoose';

import { INTEGRATION_PROVIDERS } from './IntegrationConnection.js';
import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const PLATFORM_ORDER_STATUSES = Object.freeze({
  RECEIVED: 'RECEIVED',
  NEEDS_ATTENTION: 'NEEDS_ATTENTION',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  CANCELLED_BY_PLATFORM: 'CANCELLED_BY_PLATFORM',
  PICKED_UP: 'PICKED_UP',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
});

export const ATTENTION_REASONS = Object.freeze({
  UNMAPPED_ITEMS: 'UNMAPPED_ITEMS',
  CASH_ON_DELIVERY: 'CASH_ON_DELIVERY',
  RESTAURANT_DELIVERY: 'RESTAURANT_DELIVERY',
  NO_PLATFORM_PAYMENT_METHOD: 'NO_PLATFORM_PAYMENT_METHOD',
  PACKAGING_NOT_MAPPED: 'PACKAGING_NOT_MAPPED',
  DAY_CLOSED: 'DAY_CLOSED',
});

const historySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, trim: true, maxlength: 300, default: null },
  },
  { _id: false },
);

const platformOrderSchema = new mongoose.Schema({
  connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntegrationConnection', required: true },
  provider: { type: String, required: true, enum: INTEGRATION_PROVIDERS },
  platformCode: { type: String, required: true, enum: ['ZOMATO', 'SWIGGY'] },
  platformOrderId: { type: String, required: true, trim: true, maxlength: 60 },
  status: { type: String, required: true, enum: Object.values(PLATFORM_ORDER_STATUSES) },
  attentionReasons: { type: [String], enum: Object.values(ATTENTION_REASONS), default: [] },
  order: { type: mongoose.Schema.Types.Mixed, required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', default: null },
  acceptBy: { type: Date, default: null },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  rejectReasonCode: { type: String, trim: true, default: null },
  rejectNote: { type: String, trim: true, maxlength: 200, default: null },
  prepMinutes: { type: Number, default: null },
  amountMismatch: { type: mongoose.Schema.Types.Mixed, default: null },
  failure: { type: String, trim: true, maxlength: 500, default: null },
  receivedAt: { type: Date, required: true },
  businessDate: { type: String, required: true },
  history: { type: [historySchema], default: [] },
  acknowledgedAt: { type: Date, default: null },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { minimize: false });

platformOrderSchema.plugin(baseSchemaPlugin);
platformOrderSchema.plugin(tenantGuardPlugin);

/** A duplicate ORDER_PLACED hits this and changes nothing. */
platformOrderSchema.index({ restaurantId: 1, connectionId: 1, platformOrderId: 1 }, { unique: true });
/** The inbox and the list. */
platformOrderSchema.index({ restaurantId: 1, branchId: 1, status: 1, receivedAt: -1 });
/** Day Close blockers. */
platformOrderSchema.index({ restaurantId: 1, branchId: 1, businessDate: 1, status: 1 });

applyJsonTransform(platformOrderSchema);

export const PlatformOrder = mongoose.model('PlatformOrder', platformOrderSchema);
