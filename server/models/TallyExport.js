/**
 * One build of one closed business date's Tally vouchers. P25 Part J,
 * docs/DB-SCHEMA.md section 38.
 *
 * Not unique per date: a stale export stays, and its redo is a new row.
 * Debits equal credits, or the build fails before anything is written.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const TALLY_EXPORT_STATUSES = Object.freeze({
  BUILT: 'BUILT',
  DOWNLOADED: 'DOWNLOADED',
  QUEUED: 'QUEUED',
  POSTED: 'POSTED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
  STALE: 'STALE',
});

/**
 * Statuses that may have put vouchers into Tally. A date in one of them is not
 * exported again until the owner confirms the old vouchers were deleted there.
 * The contract names POSTED and DOWNLOADED; QUEUED, PARTIAL and UNKNOWN may
 * also have reached Tally, so they hold the date too.
 */
export const TALLY_EXPORT_HOLDING = Object.freeze(['DOWNLOADED', 'QUEUED', 'POSTED', 'PARTIAL', 'UNKNOWN']);

const tallyExportSchema = new mongoose.Schema({
  connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntegrationConnection', required: true },
  businessDate: { type: String, required: true },
  granularity: { type: String, required: true, enum: ['DAILY_SUMMARY', 'PER_BILL'] },
  version: { type: String, required: true, enum: ['TALLY_PRIME', 'TALLY_ERP9'] },
  status: { type: String, required: true, enum: Object.values(TALLY_EXPORT_STATUSES), default: TALLY_EXPORT_STATUSES.BUILT },
  voucherCount: { type: Number, required: true, min: 0 },
  debitInPaise: { type: Number, required: true, min: 0 },
  creditInPaise: { type: Number, required: true, min: 0 },
  xml: { type: String, required: true, select: false },
  xmlSha256: { type: String, required: true },
  builtFromCloseAt: { type: Date, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntegrationJob', default: null },
  response: { type: String, default: null, select: false },
  lineErrors: { type: [String], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  postedAt: { type: Date, default: null },
  redoneFromId: { type: mongoose.Schema.Types.ObjectId, ref: 'TallyExport', default: null },
  acknowledgedAt: { type: Date, default: null },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
});

tallyExportSchema.plugin(baseSchemaPlugin);
tallyExportSchema.plugin(tenantGuardPlugin);

/** The calendar, and the "already exported" check. */
tallyExportSchema.index({ restaurantId: 1, connectionId: 1, businessDate: 1, createdAt: -1 });

applyJsonTransform(tallyExportSchema);

export const TallyExport = mongoose.model('TallyExport', tallyExportSchema);

export default TallyExport;
