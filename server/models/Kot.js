/**
 * A kitchen ticket. The chit that comes out of the printer by the pass.
 *
 * Created by firing an order, never directly. There is no POST /kots and there
 * will not be one: a ticket that does not correspond to lines on an order is a
 * ticket the kitchen cooks for nobody.
 *
 * Everything on it is denormalised from the order at the moment of firing, so
 * the kitchen screen renders a whole service off one query with no joins.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';
import { liveAnnouncePlugin } from './plugins/liveAnnounce.js';
import { LINE_NOTES_MAX_LENGTH, ORDER_TYPE_VALUES } from './Order.js';

export const KOT_LINE_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  READY: 'READY',
  CANCELLED: 'CANCELLED',
});
export const KOT_LINE_STATUS_VALUES = Object.freeze(Object.values(KOT_LINE_STATUSES));

const wholeNumber = {
  validator: Number.isInteger,
  message: 'Must be a whole number.',
};

/**
 * One dish on the ticket.
 *
 * There is no price here and there must not be one. A kitchen ticket showing
 * money is a leak of information the kitchen has no use for, and it invites a
 * conversation about margins over a hot pass.
 *
 * `addOnNames` is names only, for the same reason.
 */
const kotLineSchema = new mongoose.Schema(
  {
    /** The `_id` of the matching line inside the order. These must not drift. */
    orderLineId: { type: mongoose.Schema.Types.ObjectId, required: true },

    itemName: { type: String, required: true, trim: true },
    variantName: { type: String, trim: true, default: null },
    quantity: { type: Number, required: true, min: 1, validate: wholeNumber },
    addOnNames: { type: [String], default: [] },
    notes: { type: String, trim: true, maxlength: LINE_NOTES_MAX_LENGTH, default: null },

    status: {
      type: String,
      required: true,
      enum: KOT_LINE_STATUS_VALUES,
      default: KOT_LINE_STATUSES.PENDING,
    },

    readyAt: { type: Date, default: null },
  },
  { _id: true },
);

applyJsonTransform(kotLineSchema);

const kotSchema = new mongoose.Schema({
  /** Sequential per restaurant, from `counters`. Gaps acceptable. */
  kotNumber: { type: Number, required: true, min: 1, validate: wholeNumber },

  orderId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Order' },

  /** Denormalised, so the kitchen screen needs no join per ticket. */
  orderNumber: { type: Number, required: true, validate: wholeNumber },
  orderType: { type: String, required: true, enum: ORDER_TYPE_VALUES },
  tableName: { type: String, trim: true, default: null },

  lines: { type: [kotLineSchema], default: [] },

  firedBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  firedAt: { type: Date, required: true, default: Date.now },

  /**
   * The station this ticket went to, frozen when it was created. P05.
   * Null when the restaurant has no active stations. Renaming or moving a
   * station later never rewrites a ticket already printed.
   */
  stationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Station', default: null },
  stationName: { type: String, trim: true, default: null },
});

kotSchema.plugin(baseSchemaPlugin);
kotSchema.plugin(tenantGuardPlugin);
// P33. Tells open screens that read these topics to read again, after the write commits.
kotSchema.plugin(liveAnnouncePlugin, { topics: ['kots'] });

/**
 * Ascending, not descending. A kitchen works oldest ticket first, so the
 * screen's natural order is the opposite of every other list in this product.
 */
kotSchema.index({ restaurantId: 1, branchId: 1, createdAt: 1 });

kotSchema.index({ restaurantId: 1, orderId: 1 });

/** The station filter on the kitchen screen. P05. */
kotSchema.index({ restaurantId: 1, branchId: 1, stationId: 1, createdAt: 1 });

kotSchema.index({ restaurantId: 1, kotNumber: 1 }, { unique: true });

applyJsonTransform(kotSchema);

export const Kot = mongoose.model('Kot', kotSchema);

export default Kot;

/* ------------------------------------------------------------------------- *
 * THERE IS NO STORED STATUS ON A TICKET
 *
 * A ticket's status is derived from its lines, in kotStatusOf() in
 * services/kitchenService.js:
 *
 *   PENDING      no line is ready
 *   IN_PROGRESS  some are
 *   COMPLETED    every line that was not cancelled is ready
 *
 * Storing it would mean two places that both know whether a ticket is done,
 * and the moment one of them is updated without the other, the kitchen screen
 * and the floor disagree about whether the food exists.
 * ------------------------------------------------------------------------- */
