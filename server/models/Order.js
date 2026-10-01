/**
 * An order. The record M3 bills from and M4 deducts stock from.
 *
 * Two things in this file matter more than the rest of it:
 *
 * 1. Every price field on a line is a SNAPSHOT, written when the line was
 *    added. Nothing ever reads a price back out of `menuitems`. That is the
 *    rule in CLAUDE.md and it is the reason this module exists.
 *
 * 2. `version` is optimistic concurrency. Every write filters on it. Read the
 *    note at the bottom before writing any code that touches this collection.
 */
import mongoose from 'mongoose';

import { MAX_PAISE } from '../utils/money.js';
import { MAX_BASIS_POINTS } from '../validators/common.js';
import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const ORDER_TYPES = Object.freeze({
  DINE_IN: 'DINE_IN',
  TAKEAWAY: 'TAKEAWAY',
});
export const ORDER_TYPE_VALUES = Object.freeze(Object.values(ORDER_TYPES));

/**
 * `BILLED` is set by M3 and by nothing in M2. It is in the enum because the
 * field has to accept it, not because anything here writes it.
 */
export const ORDER_STATUSES = Object.freeze({
  OPEN: 'OPEN',
  READY_TO_BILL: 'READY_TO_BILL',
  BILLED: 'BILLED',
  CANCELLED: 'CANCELLED',
});
export const ORDER_STATUS_VALUES = Object.freeze(Object.values(ORDER_STATUSES));

/**
 * The statuses that keep a table occupied.
 *
 * A table is not free the moment the last dish is served: the customers are
 * still sitting there, unbilled, until a bill exists. `READY_TO_BILL` has to
 * hold the table exactly like `OPEN` does, or a waiter can seat a new party on
 * top of a table that is only waiting for the cashier.
 *
 * This is the single definition. The partial unique index below, the table
 * occupancy lookup in controllers/tableController.js, and the TABLE_OCCUPIED
 * check in controllers/orderController.js all read from it, so the three
 * cannot drift apart the way they would if each wrote its own status list.
 */
export const OCCUPYING_ORDER_STATUSES = Object.freeze([
  ORDER_STATUSES.OPEN,
  ORDER_STATUSES.READY_TO_BILL,
]);

export const ORDER_LINE_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  FIRED: 'FIRED',
  READY: 'READY',
  SERVED: 'SERVED',
  CANCELLED: 'CANCELLED',
});
export const ORDER_LINE_STATUS_VALUES = Object.freeze(Object.values(ORDER_LINE_STATUSES));

/** A line that has been to the kitchen. Cancelling one of these needs wasPrepared. */
export const PREPARED_LINE_STATUSES = Object.freeze([
  ORDER_LINE_STATUSES.FIRED,
  ORDER_LINE_STATUSES.READY,
  ORDER_LINE_STATUSES.SERVED,
]);

export const CUSTOMER_NAME_MAX_LENGTH = 100;
export const LINE_NOTES_MAX_LENGTH = 200;
export const CANCEL_REASON_MAX_LENGTH = 200;
export const MIN_GUEST_COUNT = 1;
export const MAX_GUEST_COUNT = 100;
export const MIN_LINE_QUANTITY = 1;
export const MAX_LINE_QUANTITY = 999;

const wholeNumber = {
  validator: Number.isInteger,
  message: 'Must be a whole number.',
};

/**
 * The same check for a field that is allowed to be absent.
 *
 * Mongoose skips its own min and max on a null but still runs a custom
 * validator, and Number.isInteger(null) is false. Without this, a takeaway
 * order fails validation on the null guestCount the schema itself defaulted.
 */
const wholeNumberOrEmpty = {
  validator: (value) => value === null || value === undefined || Number.isInteger(value),
  message: 'Must be a whole number.',
};

/**
 * An add-on as it was at the moment the line was added.
 *
 * `_id: false` on purpose. Nothing addresses one of these by id: an add-on is
 * changed by cancelling the line and adding a new one, because changing what
 * was ordered is not an edit. `addOnId` points back at the menu item's add-on
 * subdocument for reporting, and is never read for a price.
 */
const lineAddOnSchema = new mongoose.Schema(
  {
    addOnId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
    priceInPaise: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_PAISE,
      validate: wholeNumber,
    },
  },
  { _id: false },
);

/**
 * One line on an order.
 *
 * Every field from `itemName` down to `addOns` is a copy taken from the menu
 * item when the line was created. If the owner raises the paneer price at 8pm,
 * a line added at 7pm still carries 7pm's number, and the bill M3 prints is the
 * one the customer agreed to.
 *
 * A line is never removed from the array. Cancelling sets its status and keeps
 * every snapshot value, because a cancelled line is evidence.
 */
const orderLineSchema = new mongoose.Schema(
  {
    /** Reference only, for M6 reporting. Never read for a price. */
    menuItemId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'MenuItem' },

    itemName: { type: String, required: true, trim: true },

    /** The variant subdocument id from the menu item. M4 attaches recipes to it. */
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    variantName: { type: String, trim: true, default: null },

    /** The variant's price when one was chosen, otherwise the item's base price. */
    unitPriceInPaise: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_PAISE,
      validate: wholeNumber,
    },

    /** M3 reads this, not the live menu. */
    taxRateBps: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_BASIS_POINTS,
      validate: wholeNumber,
    },

    quantity: {
      type: Number,
      required: true,
      min: MIN_LINE_QUANTITY,
      max: MAX_LINE_QUANTITY,
      validate: wholeNumber,
    },

    addOns: { type: [lineAddOnSchema], default: [] },

    notes: { type: String, trim: true, maxlength: LINE_NOTES_MAX_LENGTH, default: null },

    status: {
      type: String,
      required: true,
      enum: ORDER_LINE_STATUS_VALUES,
      default: ORDER_LINE_STATUSES.PENDING,
    },

    kotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kot', default: null },

    addedBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    addedAt: { type: Date, required: true, default: Date.now },
    firedAt: { type: Date, default: null },
    readyAt: { type: Date, default: null },
    servedAt: { type: Date, default: null },

    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelReason: { type: String, trim: true, maxlength: CANCEL_REASON_MAX_LENGTH, default: null },

    /**
     * Was the kitchen already cooking this when it was cancelled?
     *
     * Required when cancelling a line that reached the kitchen, absent when
     * cancelling one that did not. M4 reads it to decide whether the
     * ingredients are gone. M2 records it and does nothing else with it.
     */
    wasPrepared: { type: Boolean, default: null },

    /**
     * The menu item's category when the line was added. P03.
     *
     * Frozen at add time for the same reason the price is: if a dish moves
     * category between the order and the bill, the sale belongs to the category
     * it was ordered under, and a category report never reads today's menu for
     * an old sale. Null on lines added before P03.
     */
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    categoryName: { type: String, trim: true, default: null },
  },
  { _id: true },
);

applyJsonTransform(orderLineSchema);

const orderSchema = new mongoose.Schema({
  /** Sequential per restaurant, from `counters`. Never reused. Gaps acceptable. */
  orderNumber: { type: Number, required: true, min: 1, validate: wholeNumber },

  orderType: { type: String, required: true, enum: ORDER_TYPE_VALUES },

  tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', default: null },

  /** Snapshot, so renaming a table does not rewrite last month's orders. */
  tableName: { type: String, trim: true, default: null },

  guestCount: {
    type: Number,
    min: MIN_GUEST_COUNT,
    max: MAX_GUEST_COUNT,
    validate: wholeNumberOrEmpty,
    default: null,
  },

  customerName: { type: String, trim: true, maxlength: CUSTOMER_NAME_MAX_LENGTH, default: null },
  customerPhone: { type: String, trim: true, default: null },

  status: {
    type: String,
    required: true,
    enum: ORDER_STATUS_VALUES,
    default: ORDER_STATUSES.OPEN,
  },

  /**
   * Optimistic concurrency. Starts at 1, incremented by the server on every
   * successful write. Not Mongoose's `__v`, which is about array positions.
   */
  version: { type: Number, required: true, default: 1, min: 1, validate: wholeNumber },

  lines: { type: [orderLineSchema], default: [] },

  openedBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  openedAt: { type: Date, required: true, default: Date.now },
  readyToBillAt: { type: Date, default: null },

  /** Reserved for M3. Null until billed. M2 never sets it. */
  billId: { type: mongoose.Schema.Types.ObjectId, default: null },

  isCancelled: { type: Boolean, required: true, default: false },
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cancelReason: { type: String, trim: true, maxlength: CANCEL_REASON_MAX_LENGTH, default: null },

  /**
   * Mirrors `status`: true for OPEN and READY_TO_BILL, false for BILLED and
   * CANCELLED. Internal, never in a response.
   *
   * It exists for one reason. MongoDB's partialFilterExpression does not
   * support $in: it accepts one at index-creation time without complaint and
   * then silently matches nothing, so the unique index looks right and
   * enforces nothing. Equality is supported, so the partial index below
   * filters on this boolean instead of on status directly. Every ordinary
   * query is free to keep using `status: { $in: OCCUPYING_ORDER_STATUSES } }`,
   * because $in works fine outside a partialFilterExpression -- it is only
   * broken there.
   *
   * Kept in sync by the hooks right below, not by every call site
   * remembering to set a second field alongside status.
   */
  occupiesTable: { type: Boolean, required: true, default: true },
});

orderSchema.plugin(baseSchemaPlugin);
orderSchema.plugin(tenantGuardPlugin);

/** occupiesTable as derived from a status value, for the hooks below. */
function occupiesTableFor(status) {
  return OCCUPYING_ORDER_STATUSES.includes(status);
}

/** Covers `new Order(...).save()` and `order.status = x; order.save()`. */
orderSchema.pre('save', function syncOccupiesTableOnSave(next) {
  if (this.isNew || this.isModified('status')) {
    this.occupiesTable = occupiesTableFor(this.status);
  }
  next();
});

/**
 * Covers `Order.findOneAndUpdate(...)`, which is how applyVersionedUpdate in
 * services/orderService.js writes every status change (fire, serve, cancel),
 * and `Order.updateOne(...)`, which is how a direct status write -- such as
 * M3 setting BILLED, or a test faking one ahead of M3 existing -- reaches this
 * collection without going through the service.
 *
 * Mongoose runs this as query middleware, so there is no document to read
 * `isModified` off. The incoming status is read straight out of the update.
 */
function syncOccupiesTableOnStatusUpdate(next) {
  const update = this.getUpdate() ?? {};
  const nextStatus = update.status ?? update.$set?.status;

  if (nextStatus !== undefined) {
    this.set('occupiesTable', occupiesTableFor(nextStatus));
  }
  next();
}

orderSchema.pre('findOneAndUpdate', syncOccupiesTableOnStatusUpdate);
orderSchema.pre('updateOne', syncOccupiesTableOnStatusUpdate);

/** The order list read. */
orderSchema.index({ restaurantId: 1, branchId: 1, status: 1, createdAt: -1 });

/** One order number per restaurant, forever. */
orderSchema.index({ restaurantId: 1, orderNumber: 1 }, { unique: true });

/**
 * ONE LIVE ORDER PER TABLE. This index is the answer to the two waiters problem.
 *
 * It is partial, filtered to `occupiesTable: true` -- true for OCCUPYING_ORDER_
 * STATUSES (OPEN and READY_TO_BILL), false otherwise -- so a table can carry
 * any number of closed orders through its life and exactly one live one at a
 * time. Two waiters pressing "new order" on T1 in the same millisecond both
 * reach the database; one insert succeeds and the other comes back as a
 * duplicate key error, which orderController turns into 409 TABLE_OCCUPIED
 * carrying the winner's id, so the second waiter opens the first waiter's
 * order instead of a second one.
 *
 * READY_TO_BILL keeps a table occupied too, not just OPEN, because a table
 * whose food is all served is not free. The party is still sitting there,
 * unbilled, and a table that reads as free the moment the last dish goes out
 * is a table a waiter can double-book on top of a customer waiting for the
 * check.
 *
 * The filter is `occupiesTable: true`, not `status: { $in: OCCUPYING_ORDER_
 * STATUSES } }`, on purpose. partialFilterExpression only supports equality,
 * $exists, $gt/$gte/$lt/$lte, $type, and a top-level $and of those -- not $in.
 * MongoDB accepts an $in there without error, which makes the mistake very
 * easy to make and very quiet: the index looks exactly right in
 * `db.orders.getIndexes()` and enforces nothing, because nothing matches an
 * operator the partial filter cannot evaluate. `occupiesTable` exists so this
 * index has an equality condition to filter on; see the field's own comment
 * and the two hooks above it for how it stays in sync with `status`.
 *
 * `status` is deliberately NOT in the index key. It was in the key when the
 * filter was `status: { $in: [...] } }`, and moving to `occupiesTable` without
 * dropping it from the key would have kept today's bug alive in a new shape:
 * an OPEN order and a READY_TO_BILL order on the same table both have
 * `occupiesTable: true`, but they have different `status`, so a key of
 * (restaurantId, tableId, status) would treat them as two different keys and
 * let both exist. The key is (restaurantId, tableId) alone, so any two
 * documents on the same table that both match the partial filter collide,
 * regardless of which occupying status either one is in.
 *
 * The check-then-write version of this in application code is the race, not the
 * fix. Between the check and the write there is a gap, and on a Friday night
 * something will land in it. Do not replace this index with a findOne.
 */
orderSchema.index(
  { restaurantId: 1, tableId: 1 },
  { unique: true, partialFilterExpression: { occupiesTable: true } },
);

/** For M6, which will ask what sold. */
orderSchema.index({ restaurantId: 1, 'lines.menuItemId': 1 });

applyJsonTransform(orderSchema, { strip: ['occupiesTable'] });

export const Order = mongoose.model('Order', orderSchema);

export default Order;

/* ------------------------------------------------------------------------- *
 * THERE IS NO lineTotalInPaise FIELD
 *
 * A line total is (unitPriceInPaise + sum of add-on prices) * quantity, and it
 * is computed on read in services/orderService.js. A stored total can disagree
 * with the parts it was built from; a computed one cannot. The same goes for
 * the order subtotal.
 *
 * HOW TO WRITE TO THIS COLLECTION
 *
 * Never read an order, change it in memory, and save it. That is:
 *
 *   const order = await Order.findOne(...);   // both waiters read version 7
 *   order.lines.push(line);                   // both add their own line
 *   await order.save();                       // the second overwrites the first
 *
 * Every write goes through applyVersionedUpdate() in services/orderService.js,
 * which puts the client's version into the update filter so the database
 * decides who wins. The loser gets 409 VERSION_CONFLICT and reloads, which is
 * the whole point of the version field.
 * ------------------------------------------------------------------------- */
