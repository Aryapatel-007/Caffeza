/**
 * A kitchen station. "Live Kitchen", "Beverages". M18, built in P05.
 *
 * A category is routed to a station, so firing an order makes one KOT per
 * station and the coffee bar never reads the kitchen's ticket. Shapes from
 * docs/DB-SCHEMA.md section 19.
 *
 * An ordinary tenant collection. Never deleted: a station that is no longer
 * used is deactivated, and the categories that pointed at it fall back to the
 * default station, the first active one by displayOrder.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const STATION_NAME_MAX_LENGTH = 40;

const stationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: STATION_NAME_MAX_LENGTH,
  },

  /** Derived from `name`, for case-insensitive uniqueness. Same technique as categories. */
  nameLower: { type: String, required: true },

  displayOrder: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: { validator: Number.isInteger, message: 'Must be a whole number.' },
  },

  /** Whether this station wants paper KOTs. Read by the kitchen screen's auto-print. */
  printsTickets: { type: Boolean, required: true, default: false },

  /** The delete. There is no DELETE route. */
  isActive: { type: Boolean, required: true, default: true },
});

stationSchema.plugin(baseSchemaPlugin);
stationSchema.plugin(tenantGuardPlugin);

stationSchema.pre('validate', function deriveNameLower() {
  if (typeof this.name === 'string') this.nameLower = this.name.trim().toLowerCase();
});

/** Two stations in one branch cannot share a name, case-insensitively. */
stationSchema.index({ restaurantId: 1, branchId: 1, nameLower: 1 }, { unique: true });

/** The routing read at fire time: the active stations, in order. */
stationSchema.index({ restaurantId: 1, branchId: 1, isActive: 1, displayOrder: 1 });

applyJsonTransform(stationSchema, { strip: ['nameLower'] });

export const Station = mongoose.model('Station', stationSchema);

export default Station;
