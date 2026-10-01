/**
 * Money a platform sent, in one batch covering a range of business dates. M17,
 * built in P09. Shapes from docs/DB-SCHEMA.md section 23.
 *
 * The expected amount is never stored: it is worked out on read from each
 * covered payment's frozen commission, by services/payoutService.js, so a
 * commission changed later never moves an existing payout's expected figure.
 *
 * A wrong entry is voided, never edited or deleted.
 */
import mongoose from 'mongoose';

import { MAX_PAISE } from '../utils/money.js';
import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

const platformPayoutSchema = new mongoose.Schema({
  /** A PLATFORM payment method's code, and its name frozen when recorded. */
  method: { type: String, required: true, trim: true },
  methodName: { type: String, required: true, trim: true },

  /** Business dates, inclusive. */
  periodFrom: { type: String, required: true },
  periodTo: { type: String, required: true },

  amountReceivedInPaise: {
    type: Number,
    required: true,
    min: 0,
    max: MAX_PAISE,
    validate: { validator: Number.isInteger, message: 'Must be a whole number of paise.' },
  },

  /** The date it reached the bank. */
  receivedOn: { type: String, required: true },
  reference: { type: String, trim: true, maxlength: 100, default: null },
  note: { type: String, trim: true, maxlength: 200, default: null },

  recordedBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  recordedAt: { type: Date, required: true },

  isVoided: { type: Boolean, required: true, default: false },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  voidReason: { type: String, trim: true, maxlength: 200, default: null },
});

platformPayoutSchema.plugin(baseSchemaPlugin);
platformPayoutSchema.plugin(tenantGuardPlugin);

/** The overlap check and the list. */
platformPayoutSchema.index({ restaurantId: 1, method: 1, periodFrom: 1, periodTo: 1 });

applyJsonTransform(platformPayoutSchema);

export const PlatformPayout = mongoose.model('PlatformPayout', platformPayoutSchema);

export default PlatformPayout;
