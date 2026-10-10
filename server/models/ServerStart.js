/**
 * One row each time the server process starts listening. P30, DB-SCHEMA
 * section 44.
 *
 * THIS MODEL APPLIES NEITHER baseSchema NOR tenantGuard, and has no
 * `restaurantId`. It is the second exception after `restaurants`, and for a
 * different reason: a start belongs to the server itself, which every
 * restaurant shares, not to any one of them. It holds no restaurant's data,
 * only a time, a release and a reason, so there is nothing a guard would
 * protect. `models/index.js` lists it in `SERVER_MODELS`, which the purge tool
 * and the seed wipe skip.
 *
 * Written once by `serverStartService.recordServerStart`, never updated, and
 * removed by the database 60 days after the start.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';

export const SERVER_START_REASONS = Object.freeze({
  /** No start was recorded before this one. */
  FIRST: 'FIRST',
  /** The release differs from the previous start's: a deploy. */
  DEPLOY: 'DEPLOY',
  /** The same release: a wake from sleep, or a restart after a crash. */
  RESTART: 'RESTART',
});

const SIXTY_DAYS_SECONDS = 60 * 24 * 60 * 60;

const serverStartSchema = new mongoose.Schema(
  {
    startedAt: { type: Date, required: true },
    release: { type: String, default: null },
    nodeEnv: { type: String, required: true },
    reason: { type: String, required: true, enum: Object.values(SERVER_START_REASONS) },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

serverStartSchema.index({ startedAt: -1 }, { expireAfterSeconds: SIXTY_DAYS_SECONDS });

applyJsonTransform(serverStartSchema);

export const ServerStart = mongoose.model('ServerStart', serverStartSchema, 'serverstarts');
