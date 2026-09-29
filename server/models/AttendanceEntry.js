/**
 * One clock-in, and the clock-out that closes it, for one person.
 *
 * Shapes come from docs/DB-SCHEMA.md section 7. The record M6's hours-worked
 * report reads and any future payroll build sums.
 *
 * The one thing worth reading before editing this file is the partial unique
 * index below. It is what makes "one open shift per person" a database
 * constraint rather than a race between two tablets.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

/** How a clock event happened. Server-set on every path, never from a client. */
export const CLOCK_SOURCES = Object.freeze(['SELF', 'STATION', 'MANAGER']);

/**
 * What a correction changed. `CREATION` marks the seed entry that a manual
 * create writes, so the audit trail starts with why the entry exists at all.
 */
export const CORRECTION_FIELDS = Object.freeze(['clockInAt', 'clockOutAt', 'CREATION']);

export const REASON_MAX_LENGTH = 500;

/** An open shift older than this is flagged for a manager. Never auto-closed. */
export const OPEN_SHIFT_ALERT_MINUTES = 12 * 60;

const isWholeOrNull = {
  validator: (value) => value === null || Number.isInteger(value),
  message: 'Must be a whole number of minutes.',
};

/**
 * One recorded change to an entry. Append only: a correction is never edited or
 * removed once written, because the audit trail is the point.
 */
const correctionSchema = new mongoose.Schema(
  {
    correctedAt: { type: Date, required: true },
    correctedBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    field: { type: String, required: true, enum: CORRECTION_FIELDS },
    previousValue: { type: String, default: null },
    newValue: { type: String, default: null },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: REASON_MAX_LENGTH,
    },
  },
  { _id: true },
);

/**
 * baseSchemaPlugin cannot be applied to a subdocument. Without this transform a
 * response would ship an entry with `id` whose corrections still carried `_id`
 * and `__v`. Same reason M1's variant and add-on schemas call it.
 */
applyJsonTransform(correctionSchema);

const attendanceEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },

  /** UTC. The server's clock, except on the manager create endpoint. */
  clockInAt: { type: Date, required: true },

  /**
   * UTC. `null` while the shift is open.
   *
   * Stored as an explicit `null`, not left unset, because the partial unique
   * index below filters on `clockOutAt: null` and MongoDB partial filters
   * cannot express `$exists: false`.
   */
  clockOutAt: { type: Date, default: null },

  /** Integer whole minutes, `null` while open. Recomputed on every write. */
  workedMinutes: { type: Number, default: null, validate: isWholeOrNull },

  /**
   * The business day this shift belongs to, "YYYY-MM-DD". Derived at clock-in
   * from the restaurant's business-day boundary and never recomputed, so a day
   * already reported on stays stable. See utils/time.js.
   */
  businessDate: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Must be a date like 2026-08-29.'],
  },

  clockInSource: { type: String, required: true, enum: CLOCK_SOURCES },

  /** `null` while open, otherwise one of CLOCK_SOURCES. */
  clockOutSource: {
    type: String,
    default: null,
    validate: {
      validator: (value) => value === null || CLOCK_SOURCES.includes(value),
      message: 'Invalid clock-out source.',
    },
  },

  corrections: { type: [correctionSchema], default: [] },

  /** The CONVENTIONS section 4 void fields. There is no delete. */
  isVoided: { type: Boolean, required: true, default: false },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, default: null, ref: 'User' },
  voidReason: { type: String, trim: true, maxlength: REASON_MAX_LENGTH, default: null },
});

attendanceEntrySchema.plugin(baseSchemaPlugin);
attendanceEntrySchema.plugin(tenantGuardPlugin);

/** The register read and one person's history: a user's entries, newest first. */
attendanceEntrySchema.index({ restaurantId: 1, branchId: 1, userId: 1, clockInAt: -1 });

/** The summary read: grouped by user across a range of business days. */
attendanceEntrySchema.index({ restaurantId: 1, branchId: 1, businessDate: 1 });

/**
 * One open shift per person, enforced by the database.
 *
 * Two tablets can call clock-in for the same person in the same second. A
 * service-layer "do they already have an open shift" check has a window between
 * its read and its write where both calls pass. This index closes it: at most
 * one document per { restaurantId, branchId, userId } may have `clockOutAt`
 * null, so the second insert fails and the service turns that into a clean
 * 409 ALREADY_CLOCKED_IN.
 *
 * The filter is `{ clockOutAt: null }`. Equality to null is a legal partial
 * filter expression and matches an explicit null; `$exists: false` is not
 * legal, which is why an open shift stores `clockOutAt: null` rather than
 * leaving the field unset. A closed shift holds a real date and is not covered
 * by this index, so a person may have many closed entries and only one open.
 */
attendanceEntrySchema.index(
  { restaurantId: 1, branchId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { clockOutAt: null } },
);

applyJsonTransform(attendanceEntrySchema);

export const AttendanceEntry = mongoose.model('AttendanceEntry', attendanceEntrySchema);

export default AttendanceEntry;
