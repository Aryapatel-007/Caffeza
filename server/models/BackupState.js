/**
 * The backups' running state. P54, DB-SCHEMA section 56.
 *
 * Like `backupruns`, about the server and not a restaurant: no `restaurantId`,
 * no baseSchema, no tenantGuard, listed in `SERVER_MODELS`, and never in a
 * full copy or the change diary. Three documents by `_id`:
 *   journal    where the change diary is, and any gap
 *   snapshots  the slow-down rule's current setting
 *   storage    bytes of every kept-forever file uploaded, which outlive the 90-day runs
 */
import mongoose from 'mongoose';

export const BACKUP_STATE_IDS = Object.freeze({ JOURNAL: 'journal', SNAPSHOTS: 'snapshots', STORAGE: 'storage' });
export const FULL_COPIES = Object.freeze({ EVERY_6_HOURS: 'EVERY_6_HOURS', DAILY: 'DAILY' });

const backupStateSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true, enum: Object.values(BACKUP_STATE_IDS) },
    // journal
    resumeToken: { type: mongoose.Schema.Types.Mixed, default: null },
    lastFlushAt: { type: Date, default: null },
    lastEventClusterTime: { type: mongoose.Schema.Types.Mixed, default: null },
    lastEventAt: { type: Date, default: null },
    gapSince: { type: Date, default: null },
    // Gap markers not yet written to the bucket, retried until they are.
    pendingGapMarkers: { type: [Date], default: [] },
    // snapshots
    fullCopies: { type: String, enum: Object.values(FULL_COPIES), default: FULL_COPIES.EVERY_6_HOURS },
    changedAt: { type: Date, default: null },
    // storage
    foreverBytes: { type: Number, default: 0 },
  },
  { timestamps: false, versionKey: false },
);

export const BackupState = mongoose.model('BackupState', backupStateSchema, 'backupstate');
