/**
 * A table booking. P23 (M14), docs/DB-SCHEMA.md section 27.
 *
 * From the public page (`ONLINE`, starts REQUESTED and waits for a person) or
 * typed in by staff from a phone call (`PHONE`, starts CONFIRMED). Seating it
 * opens an ordinary dine-in order through services/orderOpenService.js.
 */
import mongoose from 'mongoose';

import { DECLINE_REASON_CODES } from '../config/onlineReasons.js';
import { consentSchema, GUEST_NAME_MAX_LENGTH, REQUEST_NOTE_MAX_LENGTH } from './OnlineOrder.js';
import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const RESERVATION_STATUSES = Object.freeze({
  REQUESTED: 'REQUESTED',
  CONFIRMED: 'CONFIRMED',
  DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED',
  /** Also derived on read for a REQUESTED booking past `answerBy`. */
  EXPIRED: 'EXPIRED',
  SEATED: 'SEATED',
  NO_SHOW: 'NO_SHOW',
});
export const RESERVATION_STATUS_VALUES = Object.freeze(Object.values(RESERVATION_STATUSES));

/** The statuses a booking still holds a place in. */
export const OPEN_RESERVATION_STATUSES = Object.freeze([
  RESERVATION_STATUSES.REQUESTED,
  RESERVATION_STATUSES.CONFIRMED,
]);

export const RESERVATION_SOURCES = Object.freeze({ ONLINE: 'ONLINE', PHONE: 'PHONE' });

const reservationSchema = new mongoose.Schema({
  reference: { type: String, required: true, trim: true },
  source: { type: String, required: true, enum: Object.values(RESERVATION_SOURCES) },
  idempotencyKey: { type: String, trim: true, default: null },

  guestName: { type: String, required: true, trim: true, maxlength: GUEST_NAME_MAX_LENGTH },
  guestPhone: { type: String, required: true, trim: true },
  partySize: { type: Number, required: true, min: 1, max: 50 },
  at: { type: Date, required: true },
  businessDate: { type: String, required: true },
  note: { type: String, trim: true, maxlength: REQUEST_NOTE_MAX_LENGTH, default: null },

  status: { type: String, required: true, enum: RESERVATION_STATUS_VALUES },
  answerBy: { type: Date, default: null },
  /** SHA-256 of the guest's status token. Online only. Stripped from every response. */
  statusTokenHash: { type: String, default: null },
  marketingConsent: { type: consentSchema, default: () => ({}) },

  tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', default: null },
  tableName: { type: String, trim: true, default: null },

  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  declineReasonCode: { type: String, enum: [...DECLINE_REASON_CODES, null], default: null },
  declineNote: { type: String, trim: true, maxlength: REQUEST_NOTE_MAX_LENGTH, default: null },

  seatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  seatedAt: { type: Date, default: null },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cancelledAt: { type: Date, default: null },
  cancelNote: { type: String, trim: true, maxlength: REQUEST_NOTE_MAX_LENGTH, default: null },

  noShowBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  noShowAt: { type: Date, default: null },
});

reservationSchema.plugin(baseSchemaPlugin);
reservationSchema.plugin(tenantGuardPlugin);

reservationSchema.index({ restaurantId: 1, branchId: 1, businessDate: 1, at: 1 });
reservationSchema.index({ restaurantId: 1, branchId: 1, status: 1, createdAt: 1 });
reservationSchema.index({ restaurantId: 1, reference: 1 }, { unique: true });
reservationSchema.index(
  { restaurantId: 1, branchId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
reservationSchema.index({ restaurantId: 1, tableId: 1, status: 1, at: 1 });
reservationSchema.index({ restaurantId: 1, branchId: 1, guestPhone: 1, status: 1 });

applyJsonTransform(reservationSchema, { strip: ['statusTokenHash'] });

export const Reservation = mongoose.model('Reservation', reservationSchema);

export default Reservation;
