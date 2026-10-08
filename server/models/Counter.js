/**
 * Atomic sequence generator.
 *
 * Built in M2 because order and KOT numbers need it first. M3 will want bill
 * numbers from something like it, and the note at the bottom of this file is
 * the one thing to read before assuming it can just reuse this.
 *
 * There is no controller and no route for this collection. It is written only
 * by services/counterService.js and read by nobody.
 */
import mongoose from 'mongoose';

import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

/**
 * The sequences that exist. Closed, like the role list.
 *
 * `BILL` was added by M3, but NOT by reusing `nextNumber` below. It is reserved
 * inside the transaction that inserts the bill, by `reserveBillNumber` in
 * services/billNumberService.js, because a bill sequence cannot tolerate the
 * gaps this file's pattern produces. Read the note at the bottom.
 */
export const COUNTER_NAMES = Object.freeze({
  ORDER: 'ORDER',
  KOT: 'KOT',
  BILL: 'BILL',
  // P23. References W-42 and R-17. Gap-tolerant, like ORDER and KOT.
  ONLINE_ORDER: 'ONLINE_ORDER',
  RESERVATION: 'RESERVATION',
});

export const COUNTER_NAME_VALUES = Object.freeze(Object.values(COUNTER_NAMES));

const counterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: COUNTER_NAME_VALUES,
  },

  /** The last number issued. Starts at 0, so the first number handed out is 1. */
  value: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'Must be a whole number.',
    },
  },
});

counterSchema.plugin(baseSchemaPlugin);
counterSchema.plugin(tenantGuardPlugin);

/**
 * What a sequence resets on, when it resets on anything.
 *
 * Null for ORDER and KOT, which run forever. "2026-27" on a BILL counter,
 * because a bill sequence restarts each Indian financial year and an
 * accountant expects to see 2026-27/000001 again in April.
 *
 * Additive: existing ORDER and KOT documents have no `scope`, which indexes as
 * null, so their uniqueness is unchanged.
 */
counterSchema.add({
  scope: { type: String, trim: true, default: null },
});

/**
 * One counter per restaurant, branch, name and scope.
 *
 * Unique because two counter documents for the same sequence would each hand
 * out numbers without knowing about the other, which is the exact duplicate
 * this collection exists to prevent.
 */
counterSchema.index({ restaurantId: 1, branchId: 1, name: 1, scope: 1 }, { unique: true });

export const Counter = mongoose.model('Counter', counterSchema);

export default Counter;

/* ------------------------------------------------------------------------- *
 * ON GAPS, AND WHY M3 CANNOT COPY THIS AS-IS
 *
 * A number is reserved by incrementing this document, and the order or KOT is
 * written afterwards. If that write fails, the number is spent and the sequence
 * has a hole in it.
 *
 * For order numbers and kitchen ticket numbers that is fine. Nobody audits a
 * kitchen ticket sequence, and a missing number costs nothing.
 *
 * For bill numbers it is not fine. A gap in a bill sequence is a question from
 * an accountant, and "the server restarted" is not an answer anybody wants to
 * give. M3 has to reserve and commit a bill number differently. It is flagged
 * here rather than in M3 so that it is not solved by accident with the wrong
 * approach, which is what happens when someone finds this file and copies it.
 * ------------------------------------------------------------------------- */
