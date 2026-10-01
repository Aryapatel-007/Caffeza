/**
 * An On Hold account, such as "W-330 Office": someone who runs a tab. M16,
 * built in P09. Shapes from docs/DB-SCHEMA.md section 21.
 *
 * The outstanding balance is never stored here. It is computed from
 * `accountentries` by services/accountService.js, so it cannot drift from the
 * ledger. The opening balance is set once, at creation, and is also written as
 * an OPENING entry, which is what the balance actually reads.
 */
import mongoose from 'mongoose';

import { MAX_PAISE } from '../utils/money.js';
import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const ACCOUNT_NAME_MAX_LENGTH = 40;
export const ACCOUNT_CONTACT_MAX_LENGTH = 60;
export const ACCOUNT_PHONE_MAX_LENGTH = 15;
export const ACCOUNT_NOTE_MAX_LENGTH = 200;

const accountSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: ACCOUNT_NAME_MAX_LENGTH },

  /** Derived from `name`, for case-insensitive uniqueness. Same technique as stations. */
  nameLower: { type: String, required: true },

  contactName: { type: String, trim: true, maxlength: ACCOUNT_CONTACT_MAX_LENGTH, default: null },
  phone: { type: String, trim: true, maxlength: ACCOUNT_PHONE_MAX_LENGTH, default: null },
  note: { type: String, trim: true, maxlength: ACCOUNT_NOTE_MAX_LENGTH, default: null },

  /** Set at creation and never edited. The OPENING entry is what the balance reads. */
  openingBalanceInPaise: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: MAX_PAISE,
    validate: { validator: Number.isInteger, message: 'Must be a whole number of paise.' },
  },

  isActive: { type: Boolean, required: true, default: true },
});

accountSchema.plugin(baseSchemaPlugin);
accountSchema.plugin(tenantGuardPlugin);

accountSchema.pre('validate', function deriveNameLower() {
  if (typeof this.name === 'string') this.nameLower = this.name.trim().toLowerCase();
});

accountSchema.index({ restaurantId: 1, branchId: 1, nameLower: 1 }, { unique: true });

applyJsonTransform(accountSchema, { strip: ['nameLower'] });

export const Account = mongoose.model('Account', accountSchema);

export default Account;
