/**
 * The On Hold account ledger. M16, built in P09. Shapes from
 * docs/DB-SCHEMA.md section 22.
 *
 * APPEND ONLY. An entry is never edited or deleted; a mistake is reversed by
 * another entry. services/accountService.js is the only place that writes one.
 *
 * `amountInPaise` is always positive and `direction` carries the sign, so a
 * balance is the UP amounts minus the DOWN amounts and nothing else.
 */
import mongoose from 'mongoose';

import { MAX_PAISE } from '../utils/money.js';
import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const ACCOUNT_ENTRY_TYPES = Object.freeze({
  OPENING: 'OPENING',
  CHARGE: 'CHARGE',
  CHARGE_REVERSED: 'CHARGE_REVERSED',
  COLLECTION: 'COLLECTION',
  ADJUSTMENT: 'ADJUSTMENT',
});
export const ACCOUNT_ENTRY_TYPE_VALUES = Object.freeze(Object.values(ACCOUNT_ENTRY_TYPES));

export const ENTRY_DIRECTIONS = Object.freeze({ UP: 'UP', DOWN: 'DOWN' });
export const ENTRY_DIRECTION_VALUES = Object.freeze(Object.values(ENTRY_DIRECTIONS));

/** The direction every type but ADJUSTMENT is fixed to. */
export const FIXED_DIRECTION = Object.freeze({
  OPENING: 'UP',
  CHARGE: 'UP',
  CHARGE_REVERSED: 'DOWN',
  COLLECTION: 'DOWN',
});

const accountEntrySchema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Account' },
  type: { type: String, required: true, enum: ACCOUNT_ENTRY_TYPE_VALUES },
  direction: { type: String, required: true, enum: ENTRY_DIRECTION_VALUES },
  amountInPaise: {
    type: Number,
    required: true,
    min: 1,
    max: MAX_PAISE,
    validate: { validator: Number.isInteger, message: 'Must be a whole number of paise.' },
  },

  billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', default: null },
  billNumber: { type: String, trim: true, default: null },

  /** For a COLLECTION, frozen like a payment. */
  method: { type: String, trim: true, default: null },
  methodName: { type: String, trim: true, default: null },
  methodKind: { type: String, enum: ['IN_HAND', 'PLATFORM', null], default: null },

  reference: { type: String, trim: true, maxlength: 100, default: null },
  /** An adjustment's reason lives here. */
  note: { type: String, trim: true, maxlength: 200, default: null },

  /** The business date of the moment the entry was written. Collections count on it. */
  businessDate: { type: String, required: true },
  at: { type: Date, required: true },
  by: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
});

accountEntrySchema.plugin(baseSchemaPlugin);
accountEntrySchema.plugin(tenantGuardPlugin);

accountEntrySchema.pre('validate', function directionMatchesType() {
  const fixed = FIXED_DIRECTION[this.type];
  if (fixed && this.direction !== fixed) {
    this.invalidate('direction', `A ${this.type} entry is always ${fixed}.`);
  }
});

/** Statements and balances. */
accountEntrySchema.index({ restaurantId: 1, accountId: 1, at: 1 });

/** A day's collections, for Day Close and R2 section C. */
accountEntrySchema.index({ restaurantId: 1, branchId: 1, businessDate: 1, type: 1 });

applyJsonTransform(accountEntrySchema);

export const AccountEntry = mongoose.model('AccountEntry', accountEntrySchema);

export default AccountEntry;
