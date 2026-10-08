/**
 * One business date's close. M16, built in P10. Shapes from docs/DB-SCHEMA.md
 * section 25.
 *
 * Written by Day Close and reopened by the owner, never deleted. `snapshot` is
 * the full output of computeDayFigures at the latest close: the printed close
 * and the R2 report read the same object. `history` keeps every close and
 * reopen.
 */
import mongoose from 'mongoose';

import { cashCountRowSchema } from './CashMovement.js';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const DAY_STATUSES = Object.freeze({ CLOSED: 'CLOSED', REOPENED: 'REOPENED' });

const historySchema = new mongoose.Schema(
  {
    action: { type: String, required: true, enum: ['CLOSED', 'REOPENED'] },
    by: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    at: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 500, default: null },
    countedCashInPaise: { type: Number, default: null },
    expectedCashInPaise: { type: Number, default: null },
    differenceInPaise: { type: Number, default: null },
    // P25 Part F. The count by notes and coins behind this close, when it was counted that way.
    cashCount: { type: [cashCountRowSchema], default: undefined },
  },
  { _id: false },
);

const wholeNumber = { validator: Number.isInteger, message: 'Must be a whole number of paise.' };

const dayClosureSchema = new mongoose.Schema({
  businessDate: { type: String, required: true },
  status: { type: String, required: true, enum: Object.values(DAY_STATUSES) },

  countedCashInPaise: { type: Number, required: true, min: 0, validate: wholeNumber },
  expectedCashInPaise: { type: Number, required: true, validate: wholeNumber },
  /** Counted minus expected. Negative means cash is missing. */
  differenceInPaise: { type: Number, required: true, validate: wholeNumber },
  note: { type: String, trim: true, maxlength: 500, default: null },

  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  checks: { type: [mongoose.Schema.Types.Mixed], default: [] },

  closedBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  closedAt: { type: Date, required: true },

  history: { type: [historySchema], default: [] },

  /** P25 Part F. The latest close's count by notes and coins, or absent when counted as a total. */
  cashCount: { type: [cashCountRowSchema], default: undefined },
});

dayClosureSchema.plugin(baseSchemaPlugin);
dayClosureSchema.plugin(tenantGuardPlugin);

dayClosureSchema.index({ restaurantId: 1, branchId: 1, businessDate: 1 }, { unique: true });

applyJsonTransform(dayClosureSchema);

export const DayClosure = mongoose.model('DayClosure', dayClosureSchema);

export default DayClosure;
