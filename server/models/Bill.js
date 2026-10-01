/**
 * One bill for one order. The document a customer is handed and an auditor
 * asks about.
 *
 * Shapes come from docs/DB-SCHEMA.md section 12.
 *
 * Three things in this file matter more than the rest:
 *
 * 1. Every line here is a snapshot of a snapshot. The order line already copied
 *    name, price and tax rate out of `menuitems`; this copies them again and
 *    freezes them. Nothing in M3 reads `menuitems`.
 *
 * 2. `billNumber` is sequential per restaurant, branch and financial year, and
 *    is never reused. The unique indexes below are the guarantee, not a check
 *    in a controller.
 *
 * 3. A bill is never edited. There is no endpoint that changes a line. A wrong
 *    bill is voided, with a reason, and re-issued under a new number.
 */
import mongoose from 'mongoose';

import { MAX_PAISE } from '../utils/money.js';
import { MAX_BASIS_POINTS } from '../validators/common.js';
import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

/**
 * `PAID` is reached when the payments add up to the grand total, not when the
 * bill is created. A voided bill keeps whichever status it had and sets
 * `isVoided`, because "was it paid before it was voided" is a real question.
 */
export const BILL_STATUSES = Object.freeze({
  UNPAID: 'UNPAID',
  PAID: 'PAID',
});
export const BILL_STATUS_VALUES = Object.freeze(Object.values(BILL_STATUSES));

export const DISCOUNT_KINDS = Object.freeze({
  FLAT: 'FLAT',
  PERCENT: 'PERCENT',
});
export const DISCOUNT_KIND_VALUES = Object.freeze(Object.values(DISCOUNT_KINDS));

/** We record which method was used. We never move money. BUILD-PLAN section 4. */
export const PAYMENT_METHODS = Object.freeze({
  CASH: 'CASH',
  UPI: 'UPI',
  CARD: 'CARD',
  OTHER: 'OTHER',
});
export const PAYMENT_METHOD_VALUES = Object.freeze(Object.values(PAYMENT_METHODS));

export const DISCOUNT_REASON_MAX_LENGTH = 200;
export const VOID_REASON_MAX_LENGTH = 500;
export const PAYMENT_REFERENCE_MAX_LENGTH = 100;

const wholeNumber = {
  validator: Number.isInteger,
  message: 'Must be a whole number.',
};

/** The same check for a field that may be null. Mongoose still runs a validator on null. */
const wholeNumberOrEmpty = {
  validator: (value) => value === null || value === undefined || Number.isInteger(value),
  message: 'Must be a whole number.',
};

/**
 * One line, frozen.
 *
 * `_id: false` on purpose: nothing addresses a bill line individually, because
 * a bill is never edited. `orderLineId` is how a line traces back.
 */
const billLineSchema = new mongoose.Schema(
  {
    orderLineId: { type: mongoose.Schema.Types.ObjectId, required: true },
    menuItemId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'MenuItem' },

    itemName: { type: String, required: true, trim: true },
    variantName: { type: String, trim: true, default: null },

    /** Names only. Their prices are already inside unitPriceInPaise. */
    addOnNames: { type: [String], default: [] },

    quantity: { type: Number, required: true, min: 1, validate: wholeNumber },

    /** Per unit, add-ons included: the price actually charged for one of these. */
    unitPriceInPaise: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_PAISE,
      validate: wholeNumber,
    },

    /** The slab this line falls in. Copied from the order line. */
    taxRateBps: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_BASIS_POINTS,
      validate: wholeNumber,
    },

    /**
     * Stored, not derived, unlike the order's version of this number. An order
     * is live and recomputes on every read; a bill is frozen and must still
     * print the same figures in a year.
     */
    lineTotalInPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: wholeNumber,
    },

    /** Copied from the order line. P03. Null for orders from before P03. */
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    categoryName: { type: String, trim: true, default: null },

    /**
     * This line's share of the bill discount, its net sales, and its share of
     * its rate's GST. P03. Written by allocateLineShares in utils/tax.js on
     * every bill created or re-discounted, and always adding up exactly to the
     * bill's discount and slab figures. Null on bills from before P03, which a
     * report reads as "not recorded". Old bills are not back-filled.
     */
    discountShareInPaise: { type: Number, min: 0, default: null, validate: wholeNumberOrEmpty },
    taxableInPaise: { type: Number, min: 0, default: null, validate: wholeNumberOrEmpty },
    taxInPaise: { type: Number, min: 0, default: null, validate: wholeNumberOrEmpty },
  },
  { _id: false },
);

/**
 * Bill-level only. There is no per-line discount in v1: a line-level discount
 * multiplies the per-slab apportionment by the number of lines, and that
 * arithmetic is where this module could lose a customer's money.
 */
const discountSchema = new mongoose.Schema(
  {
    kind: { type: String, required: true, enum: DISCOUNT_KIND_VALUES },

    /** Set when kind is FLAT. */
    valueInPaise: { type: Number, min: 0, max: MAX_PAISE, default: null },

    /** Set when kind is PERCENT. */
    rateBps: { type: Number, min: 1, max: MAX_BASIS_POINTS, default: null },

    /** What actually came off, whichever kind it was. The arithmetic reads this. */
    amountInPaise: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_PAISE,
      validate: wholeNumber,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: DISCOUNT_REASON_MAX_LENGTH,
    },

    appliedBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    appliedAt: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * One row per distinct tax rate on the bill. This is what prints: a GST invoice
 * shows CGST and SGST against each rate, not one merged figure.
 */
const taxSlabSchema = new mongoose.Schema(
  {
    taxRateBps: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_BASIS_POINTS,
      validate: wholeNumber,
    },

    /** After this slab's share of any discount. */
    taxableInPaise: { type: Number, required: true, min: 0, validate: wholeNumber },
    taxInPaise: { type: Number, required: true, min: 0, validate: wholeNumber },

    /** CGST takes the extra paisa when the slab tax is odd. See utils/tax.js. */
    cgstInPaise: { type: Number, required: true, min: 0, validate: wholeNumber },
    sgstInPaise: { type: Number, required: true, min: 0, validate: wholeNumber },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    method: { type: String, required: true, enum: PAYMENT_METHOD_VALUES },

    amountInPaise: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_PAISE,
      validate: wholeNumber,
    },

    /** A UPI reference or the last four of a card. Never a full card number. */
    reference: {
      type: String,
      trim: true,
      maxlength: PAYMENT_REFERENCE_MAX_LENGTH,
      default: null,
    },

    receivedBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    receivedAt: { type: Date, required: true },
  },
  { _id: true },
);

applyJsonTransform(paymentSchema);

const billSchema = new mongoose.Schema({
  /** The printed number, "2026-27/000148". Unique per restaurant, never reused. */
  billNumber: { type: String, required: true, trim: true },

  /** Indian FY, 1 April to 31 March. The sequence resets here and nowhere else. */
  financialYear: { type: String, required: true, trim: true },

  /** The integer behind billNumber, so a gap is found by arithmetic. */
  billSequence: { type: Number, required: true, min: 1, validate: wholeNumber },

  /**
   * Which series the number belongs to. P02. The financial year, "2026-27", in
   * FINANCIAL_YEAR mode, or the prefix, "CFA/C/", in PREFIX mode. Null on bills
   * created before P02, which means the financial year series. The M19 invoice
   * register groups by it.
   */
  invoiceSeries: { type: String, trim: true, default: null },

  orderId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Order' },

  /** Snapshots, so a bill reads without a join. */
  orderNumber: { type: Number, required: true, validate: wholeNumber },
  orderType: { type: String, required: true },
  tableName: { type: String, trim: true, default: null },

  /** Derived once by businessDateFor. Never recomputed: a reported day stays stable. */
  businessDate: { type: String, required: true },

  status: {
    type: String,
    required: true,
    enum: BILL_STATUS_VALUES,
    default: BILL_STATUSES.UNPAID,
  },

  lines: { type: [billLineSchema], default: [] },

  /** Pre-tax, pre-discount. */
  subtotalInPaise: { type: Number, required: true, min: 0, validate: wholeNumber },

  discount: { type: discountSchema, default: null },

  taxBreakdown: { type: [taxSlabSchema], default: [] },
  totalTaxInPaise: { type: Number, required: true, min: 0, default: 0, validate: wholeNumber },

  /** Signed, -49 to +50. What was added to reach a whole rupee. */
  roundOffInPaise: { type: Number, required: true, min: -49, max: 50, default: 0, validate: wholeNumber },

  /** subtotal - discount + totalTax + roundOff. Always a multiple of 100. */
  grandTotalInPaise: { type: Number, required: true, min: 0, validate: wholeNumber },

  payments: { type: [paymentSchema], default: [] },
  amountPaidInPaise: { type: Number, required: true, min: 0, default: 0, validate: wholeNumber },

  billedBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  billedAt: { type: Date, required: true },
  paidAt: { type: Date, default: null },

  /** CONVENTIONS section 4 void fields. There is no delete. */
  isVoided: { type: Boolean, required: true, default: false },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  voidReason: { type: String, trim: true, maxlength: VOID_REASON_MAX_LENGTH, default: null },

  /**
   * Frozen from the order at bill creation. P03. "Captain" is whoever opened
   * the order (GLOSSARY section 8). The name is read once, so renaming the user
   * later does not rewrite who served last month. Null on bills from before P03.
   */
  captainId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  captainName: { type: String, trim: true, default: null },
  guestCount: { type: Number, min: 0, default: null, validate: wholeNumberOrEmpty },
  orderOpenedAt: { type: Date, default: null },
});

billSchema.plugin(baseSchemaPlugin);
billSchema.plugin(tenantGuardPlugin);

/**
 * The number an auditor quotes, so it is unique per restaurant rather than per
 * branch. Two branches of one restaurant must not both issue 2026-27/000148.
 */
billSchema.index({ restaurantId: 1, billNumber: 1 }, { unique: true });

/** The same guarantee in integers, which is what a gap check reads. */
billSchema.index(
  { restaurantId: 1, branchId: 1, financialYear: 1, billSequence: 1 },
  { unique: true },
);

/**
 * One LIVE bill per order.
 *
 * Partial on isVoided:false, so voiding a bill leaves the order billable again.
 * An index rather than a check-then-write in a controller, for the same reason
 * M2's one-open-order-per-table index exists: the gap between the check and the
 * write is the race.
 */
billSchema.index(
  { restaurantId: 1, orderId: 1 },
  { unique: true, partialFilterExpression: { isVoided: false } },
);

/** The day's bill list, and every M6 sales read. */
billSchema.index({ restaurantId: 1, branchId: 1, businessDate: 1, isVoided: 1 });

export const Bill = mongoose.model('Bill', billSchema);

export default Bill;
