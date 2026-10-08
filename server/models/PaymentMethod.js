/**
 * A way a bill may be settled. M10, built in P08. Shapes from
 * docs/DB-SCHEMA.md section 20.
 *
 * Configured per restaurant. A payment stores the method's `code` and freezes
 * its name, kind, Tally code and commission, so renaming a method or changing
 * its commission never rewrites a payment already taken.
 *
 * `code` and `kind` never change after creation: payments and reports group by
 * the code, and a method that changed kind would move old money between "in
 * hand" and "platform". Never deleted: a method no longer used is deactivated.
 */
import mongoose from 'mongoose';

import { PLATFORM_CODES } from '../config/platforms.js';
import { MAX_BASIS_POINTS } from '../validators/common.js';
import { ORDER_TYPE_VALUES } from './Order.js';
import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const PAYMENT_METHOD_KINDS = Object.freeze({
  IN_HAND: 'IN_HAND',
  PLATFORM: 'PLATFORM',
});
export const PAYMENT_METHOD_KIND_VALUES = Object.freeze(Object.values(PAYMENT_METHOD_KINDS));

export const PAYMENT_METHOD_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,19}$/;
export const PAYMENT_METHOD_NAME_MAX_LENGTH = 30;
export const TALLY_LEDGER_CODE_MAX_LENGTH = 20;

/**
 * The four every restaurant always has. They keep the codes the old fixed list
 * allowed, so every payment taken before P08 still points at a real method.
 */
export const DEFAULT_PAYMENT_METHODS = Object.freeze([
  Object.freeze({ code: 'CASH', name: 'Cash', displayOrder: 0, isActive: true }),
  Object.freeze({ code: 'CARD', name: 'Card', displayOrder: 1, isActive: true }),
  Object.freeze({ code: 'UPI', name: 'UPI', displayOrder: 2, isActive: true }),
  Object.freeze({ code: 'OTHER', name: 'Other', displayOrder: 3, isActive: false }),
]);

const paymentMethodSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, match: PAYMENT_METHOD_CODE_PATTERN },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: PAYMENT_METHOD_NAME_MAX_LENGTH,
  },
  kind: { type: String, required: true, enum: PAYMENT_METHOD_KIND_VALUES },
  orderTypes: {
    type: [{ type: String, enum: ORDER_TYPE_VALUES }],
    default: () => [...ORDER_TYPE_VALUES],
    validate: {
      validator: (value) => Array.isArray(value) && value.length > 0,
      message: 'At least one order type is required.',
    },
  },
  /** A delivery platform's own payment, like SWIGGY. Null otherwise. */
  platformCode: { type: String, enum: [...PLATFORM_CODES, null], default: null },
  tallyLedgerCode: {
    type: String,
    trim: true,
    maxlength: TALLY_LEDGER_CODE_MAX_LENGTH,
    default: null,
  },
  /**
   * P25 Part I. A method taken on a card machine: `PINE_LABS`, or null. In-hand
   * methods only. `terminalPaymentMode` is Pine Labs' AllowedPaymentMode code
   * (1 card, 10 UPI sale, 11 UPI Bharat QR, 0 every mode the machine has),
   * required with a provider and null without.
   */
  terminalProvider: { type: String, enum: ['PINE_LABS', null], default: null },
  terminalPaymentMode: { type: Number, min: 0, max: 99, default: null },
  /** PLATFORM methods only. Null means "rate not set", and no payout is invented. */
  commissionBps: {
    type: Number,
    min: 0,
    max: MAX_BASIS_POINTS,
    default: null,
    validate: {
      validator: (value) => value === null || Number.isInteger(value),
      message: 'Must be a whole number of basis points.',
    },
  },
  displayOrder: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: { validator: Number.isInteger, message: 'Must be a whole number.' },
  },
  isActive: { type: Boolean, required: true, default: true },
});

paymentMethodSchema.plugin(baseSchemaPlugin);
paymentMethodSchema.plugin(tenantGuardPlugin);

/** Payments refer to a method by code, so one code is one method per restaurant. */
paymentMethodSchema.index({ restaurantId: 1, code: 1 }, { unique: true });

/** The payment panel's list. */
paymentMethodSchema.index({ restaurantId: 1, branchId: 1, isActive: 1, displayOrder: 1 });

applyJsonTransform(paymentMethodSchema);

export const PaymentMethod = mongoose.model('PaymentMethod', paymentMethodSchema);

export default PaymentMethod;
