/**
 * The queue for outgoing partner calls and incoming events. P25 Part G,
 * docs/DB-SCHEMA.md section 34. Run by services/integrations/jobRunner.js.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const JOB_STATUSES = Object.freeze({ QUEUED: 'QUEUED', RUNNING: 'RUNNING', DONE: 'DONE', FAILED: 'FAILED', DEAD: 'DEAD' });
export const DEFAULT_MAX_ATTEMPTS = 6;

const jobSchema = new mongoose.Schema({
  connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntegrationConnection', required: true },
  type: { type: String, required: true, trim: true, maxlength: 60 },
  payload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  dedupeKey: { type: String, trim: true, maxlength: 200, default: null },
  status: { type: String, required: true, enum: Object.values(JOB_STATUSES), default: JOB_STATUSES.QUEUED },
  runAfter: { type: Date, required: true },
  lockedUntil: { type: Date, default: null },
  attempts: { type: Number, required: true, default: 0 },
  maxAttempts: { type: Number, required: true, default: DEFAULT_MAX_ATTEMPTS },
  lastError: { type: String, trim: true, maxlength: 500, default: null },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
  forBridge: { type: Boolean, required: true, default: false },
  acknowledgedAt: { type: Date, default: null },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { minimize: false });

jobSchema.plugin(baseSchemaPlugin);
jobSchema.plugin(tenantGuardPlugin);

/**
 * The runner claims due jobs of every restaurant in one loop, so this index
 * does not lead with restaurantId: a sanctioned use of the tenant guard's escape hatch. Each job
 * it claims then runs scoped to its own restaurant.
 */
jobSchema.index({ status: 1, forBridge: 1, runAfter: 1 });
/** A key already used is not queued twice. */
jobSchema.index({ restaurantId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
/** A bridge's next job, and the alerts read. */
jobSchema.index({ restaurantId: 1, connectionId: 1, status: 1, runAfter: 1 });

applyJsonTransform(jobSchema);

export const IntegrationJob = mongoose.model('IntegrationJob', jobSchema);
