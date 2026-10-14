/**
 * One row per backup attempt. P54, DB-SCHEMA section 56.
 *
 * THIS MODEL APPLIES NEITHER baseSchema NOR tenantGuard, and has no
 * `restaurantId`, for the same reason as `serverstarts`: a backup belongs to
 * the server, which every restaurant shares, not to any one of them. It holds
 * times, sizes, object keys and plain error words, never a document.
 * `models/index.js` lists it in `SERVER_MODELS`, which the purge tool and the
 * seed wipe skip, and neither a full copy nor the change diary includes it.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';

export const BACKUP_KINDS = Object.freeze({ SNAPSHOT: 'SNAPSHOT', JOURNAL: 'JOURNAL' });
export const BACKUP_STATUSES = Object.freeze({ RUNNING: 'RUNNING', OK: 'OK', FAILED: 'FAILED' });
export const BACKUP_FOLDERS = Object.freeze({ MONTHLY: 'monthly', DAILY: 'daily', SIX_HOURS: '6h', JOURNAL: 'journal' });

const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;

const backupRunSchema = new mongoose.Schema(
  {
    kind: { type: String, required: true, enum: Object.values(BACKUP_KINDS) },
    status: { type: String, required: true, enum: Object.values(BACKUP_STATUSES), default: BACKUP_STATUSES.RUNNING },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    folder: { type: String, enum: [...Object.values(BACKUP_FOLDERS), null], default: null },
    objectKey: { type: String, default: null },
    bytes: { type: Number, default: 0 },
    sha256: { type: String, default: null },
    fromClusterTime: { type: mongoose.Schema.Types.Mixed, default: null },
    toClusterTime: { type: mongoose.Schema.Types.Mixed, default: null },
    eventCount: { type: Number, default: 0 },
    collections: { type: [{ _id: false, name: String, count: Number }], default: [] },
    databaseBytes: { type: Number, default: 0 },
    error: { type: String, default: null },
  },
  { timestamps: false },
);

backupRunSchema.index({ startedAt: 1 }, { expireAfterSeconds: NINETY_DAYS_SECONDS });
backupRunSchema.index({ kind: 1, status: 1, startedAt: -1 });
// One full copy at a time: a second RUNNING snapshot row cannot be written.
backupRunSchema.index(
  { kind: 1 },
  { unique: true, name: 'one_running_snapshot', partialFilterExpression: { kind: BACKUP_KINDS.SNAPSHOT, status: BACKUP_STATUSES.RUNNING } },
);

applyJsonTransform(backupRunSchema);

export const BackupRun = mongoose.model('BackupRun', backupRunSchema, 'backupruns');
