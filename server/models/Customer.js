/**
 * One guest at one restaurant, known by their mobile number. P27 (M22),
 * docs/DB-SCHEMA.md section 41. Built from orders; nothing else creates one.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';
import { CUSTOMER_NAME_MAX_LENGTH } from './Order.js';

export const CONSENT_SOURCES = Object.freeze({ STAFF: 'STAFF', ONLINE: 'ONLINE' });
/** P39. How the restaurant first knew this guest: an order, or a WhatsApp message. */
export const CUSTOMER_SOURCES = Object.freeze({ ORDER: 'ORDER', WHATSAPP: 'WHATSAPP' });

const offersSchema = new mongoose.Schema(
  {
    given: { type: Boolean, required: true, default: false },
    textVersion: { type: String, trim: true, default: null },
    at: { type: Date, default: null },
    source: { type: String, enum: [...Object.values(CONSENT_SOURCES), null], default: null },
  },
  { _id: false },
);

const historySchema = new mongoose.Schema(
  {
    given: { type: Boolean, required: true },
    textVersion: { type: String, trim: true, default: null },
    at: { type: Date, required: true },
    source: { type: String, required: true, enum: Object.values(CONSENT_SOURCES) },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, trim: true, maxlength: 200, default: null },
  },
  { _id: false },
);

const customerSchema = new mongoose.Schema({
  phone: { type: String, required: true, trim: true, match: /^\d{10}$/ },
  name: { type: String, trim: true, maxlength: CUSTOMER_NAME_MAX_LENGTH, default: null },
  // P39. Not required: a guest known only from writing on WhatsApp has had no visit. Every guest from an order has both.
  firstVisitAt: { type: Date, default: null },
  lastVisitAt: { type: Date, default: null },
  source: { type: String, enum: Object.values(CUSTOMER_SOURCES), default: CUSTOMER_SOURCES.ORDER },
  lastOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  visitCount: { type: Number, required: true, default: 0, min: 0 },
  offers: { type: offersSchema, default: () => ({}) },
  offersHistory: { type: [historySchema], default: [] },
  /** P37. When Meta said this number is not on WhatsApp. Nothing more is sent to it. */
  whatsappUnreachableAt: { type: Date, default: null },
  /** P39. The guest asked for no messages at all on WhatsApp. Nothing is sent, bills included, until staff clear it. */
  whatsappStoppedAt: { type: Date, default: null },
});

customerSchema.plugin(baseSchemaPlugin);
customerSchema.plugin(tenantGuardPlugin);

customerSchema.index({ restaurantId: 1, phone: 1 }, { unique: true });
customerSchema.index({ restaurantId: 1, lastVisitAt: -1 });

applyJsonTransform(customerSchema);

export const Customer = mongoose.model('Customer', customerSchema);

export default Customer;
