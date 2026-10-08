/**
 * A computer allowed to post into Tally for one connection. P25 Part K,
 * docs/DB-SCHEMA.md section 39.
 *
 * A row is made when the owner asks for a pairing code, and becomes a bridge
 * when the code is used. Neither the code nor the token is ever stored, only
 * their SHA-256.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

const tallyBridgeSchema = new mongoose.Schema({
  connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntegrationConnection', required: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 40 },
  machineName: { type: String, trim: true, maxlength: 60, default: null },
  pairingCodeHash: { type: String, default: null, select: false },
  pairingExpiresAt: { type: Date, default: null },
  tokenHash: { type: String, default: null, select: false },
  lastSeenAt: { type: Date, default: null },
  tallyVersionSeen: { type: String, trim: true, maxlength: 60, default: null },
  companiesSeen: { type: [String], default: [] },
  ledgersSeen: { type: [String], default: [] },
  ledgersSeenAt: { type: Date, default: null },
  pairedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  pairedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
});

tallyBridgeSchema.plugin(baseSchemaPlugin);
tallyBridgeSchema.plugin(tenantGuardPlugin);

/** Found by code or token before the restaurant is known. */
tallyBridgeSchema.index({ pairingCodeHash: 1 }, { unique: true, partialFilterExpression: { pairingCodeHash: { $type: 'string' } } });
tallyBridgeSchema.index({ tokenHash: 1 }, { unique: true, partialFilterExpression: { tokenHash: { $type: 'string' } } });
/** The list. */
tallyBridgeSchema.index({ restaurantId: 1, connectionId: 1, revokedAt: 1 });

applyJsonTransform(tallyBridgeSchema);

export const TallyBridge = mongoose.model('TallyBridge', tallyBridgeSchema);

export default TallyBridge;
