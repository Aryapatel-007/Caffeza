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
    // P29 Part F. What stayed in the drawer, and what was taken out after the count.
    keptForTomorrowInPaise: { type: Number, default: null },
    takenOutAtCloseInPaise: { type: Number, default: null },
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

  /**
   * P29 Part F. Cash left in the drawer for the next day, which the next
   * business date's opening float is proposed from, and the rest taken out
   * after the count: it never changes expected cash or the difference. Null
   * on a close from before P29, or when nothing was said.
   */
  keptForTomorrowInPaise: { type: Number, min: 0, default: null, validate: { validator: (value) => value === null || Number.isInteger(value), message: wholeNumber.message } },
  keptForTomorrowCount: { type: [cashCountRowSchema], default: undefined },
  takenOutAtCloseInPaise: { type: Number, min: 0, default: null },
  takenOutTo: { type: String, enum: ['BANK_DEPOSIT', 'OWNER', 'OTHER', null], default: null },
  takenOutBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
});

dayClosureSchema.plugin(baseSchemaPlugin);
dayClosureSchema.plugin(tenantGuardPlugin);

dayClosureSchema.index({ restaurantId: 1, branchId: 1, businessDate: 1 }, { unique: true });

applyJsonTransform(dayClosureSchema);

export const DayClosure = mongoose.model('DayClosure', dayClosureSchema);

export default DayClosure;
