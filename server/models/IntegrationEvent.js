/**
 * One line per call to or from a partner. P25 Part G, docs/DB-SCHEMA.md
 * section 33. Diagnostics, not financial records: a TTL index removes lines
 * after 180 days. `request` and `response` are already redacted by
 * services/integrations/redact.js when stored.
 */
import mongoose from 'mongoose';

import { INTEGRATION_PROVIDERS } from './IntegrationConnection.js';
import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const EVENT_OUTCOMES = Object.freeze({ OK: 'OK', FAILED: 'FAILED', DUPLICATE: 'DUPLICATE', IGNORED: 'IGNORED', REJECTED: 'REJECTED' });
export const EVENT_RETENTION_SECONDS = 180 * 24 * 60 * 60;

const eventSchema = new mongoose.Schema({
  connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntegrationConnection', required: true },
  provider: { type: String, required: true, enum: INTEGRATION_PROVIDERS },
  direction: { type: String, required: true, enum: ['IN', 'OUT'] },
  kind: { type: String, required: true, trim: true, maxlength: 60 },
  externalId: { type: String, trim: true, maxlength: 100, default: null },
  outcome: { type: String, required: true, enum: Object.values(EVENT_OUTCOMES) },
  httpStatus: { type: Number, default: null },
  durationMs: { type: Number, default: null },
  request: { type: mongoose.Schema.Types.Mixed, default: null },
  response: { type: mongoose.Schema.Types.Mixed, default: null },
  error: { type: String, trim: true, maxlength: 500, default: null },
  at: { type: Date, required: true },
});

eventSchema.plugin(baseSchemaPlugin);
eventSchema.plugin(tenantGuardPlugin);

/** A connection's log, newest first. */
eventSchema.index({ restaurantId: 1, connectionId: 1, at: -1 });
/** Every line about one order or payment. */
eventSchema.index({ restaurantId: 1, provider: 1, externalId: 1 });
/** Diagnostics expire. A TTL index must be one date field, so it cannot lead with restaurantId; it only deletes. */
eventSchema.index({ at: 1 }, { expireAfterSeconds: EVENT_RETENTION_SECONDS });

applyJsonTransform(eventSchema);

export const IntegrationEvent = mongoose.model('IntegrationEvent', eventSchema);
