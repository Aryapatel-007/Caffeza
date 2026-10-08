/**
 * One partner connection per restaurant, branch and provider. P25 Part G,
 * docs/DB-SCHEMA.md section 32.
 *
 * `credentials` is a box from secretBox.encryptJson, never returned by any
 * endpoint (`select: false`, and stripped in toJSON too). A response shows
 * only `credentialHints`, the last four characters of each secret field.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const INTEGRATION_PROVIDERS = Object.freeze(['SWIGGY', 'ZOMATO', 'SANDBOX_PLATFORM', 'PINE_LABS', 'TALLY']);
export const INTEGRATION_ENVIRONMENTS = Object.freeze(['SANDBOX', 'UAT', 'PRODUCTION']);
export const CONNECTION_STATUSES = Object.freeze({ DRAFT: 'DRAFT', ACTIVE: 'ACTIVE', PAUSED: 'PAUSED', ERROR: 'ERROR' });
export const LAST_ERROR_MAX_LENGTH = 300;

const connectionSchema = new mongoose.Schema({
  provider: { type: String, required: true, enum: INTEGRATION_PROVIDERS },
  environment: { type: String, required: true, enum: INTEGRATION_ENVIRONMENTS },
  status: { type: String, required: true, enum: Object.values(CONNECTION_STATUSES), default: CONNECTION_STATUSES.DRAFT },
  credentials: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
  credentialHints: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  config: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  webhookKeyHash: { type: String, default: null },
  /** P25 Part H. An order channel's store, open or closed on the platform, as staff last set it. */
  storeOpen: { type: Boolean, required: true, default: true },
  lastSuccessAt: { type: Date, default: null },
  lastErrorAt: { type: Date, default: null },
  lastError: { type: String, trim: true, maxlength: LAST_ERROR_MAX_LENGTH, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { minimize: false });

connectionSchema.plugin(baseSchemaPlugin);
connectionSchema.plugin(tenantGuardPlugin);

/** One connection per partner per outlet. */
connectionSchema.index({ restaurantId: 1, branchId: 1, provider: 1 }, { unique: true });

/**
 * A webhook finds its connection by the key alone, before the restaurant is
 * known, so this index does not lead with restaurantId: one of the three
 * sanctioned uses of the tenant guard's escape hatch in M21.
 */
connectionSchema.index(
  { webhookKeyHash: 1 },
  { unique: true, partialFilterExpression: { webhookKeyHash: { $type: 'string' } } },
);

applyJsonTransform(connectionSchema, { strip: ['credentials', 'webhookKeyHash'] });

export const IntegrationConnection = mongoose.model('IntegrationConnection', connectionSchema);
