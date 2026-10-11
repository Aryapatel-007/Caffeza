/**
 * One guest's WhatsApp chat with one branch. P39, docs/DB-SCHEMA.md section 48.
 *
 * Names the guest by `customerId`, never by number. The turns are personal
 * data: the last 30 are kept, and the whole chat is removed 30 days after its
 * last message.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const CONVERSATION_STATUSES = Object.freeze({ BOT: 'BOT', NEEDS_STAFF: 'NEEDS_STAFF', STAFF: 'STAFF', CLOSED: 'CLOSED' });
export const TURN_ROLES = Object.freeze({ GUEST: 'GUEST', ASSISTANT: 'ASSISTANT', STAFF: 'STAFF', TOOL: 'TOOL' });
export const MAX_TURNS = 30;
export const TURN_TEXT_MAX_LENGTH = 1000;
export const CONVERSATION_RETENTION_SECONDS = 30 * 24 * 60 * 60;

const turnSchema = new mongoose.Schema(
  {
    role: { type: String, required: true, enum: Object.values(TURN_ROLES) },
    text: { type: String, default: '', maxlength: TURN_TEXT_MAX_LENGTH },
    at: { type: Date, required: true },
    toolName: { type: String, default: null },
  },
  { _id: false },
);

const conversationSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  status: { type: String, required: true, enum: Object.values(CONVERSATION_STATUSES), default: CONVERSATION_STATUSES.BOT },
  lastInboundAt: { type: Date, default: null },
  lastMessageAt: { type: Date, required: true },
  turns: { type: [turnSchema], default: [] },
  pendingBooking: { type: mongoose.Schema.Types.Mixed, default: null },
  handoffReason: { type: String, trim: true, maxlength: 300, default: null },
  aiCallsDate: { type: String, default: null },
  aiCallsToday: { type: Number, required: true, default: 0, min: 0 },
});

conversationSchema.plugin(baseSchemaPlugin);
conversationSchema.plugin(tenantGuardPlugin);

conversationSchema.index({ restaurantId: 1, branchId: 1, customerId: 1 }, { unique: true });
conversationSchema.index({ restaurantId: 1, branchId: 1, status: 1, lastMessageAt: -1 });
/** MongoDB's TTL needs one date field, so this does not lead with restaurantId, as `integrationevents`. */
conversationSchema.index({ lastMessageAt: 1 }, { expireAfterSeconds: CONVERSATION_RETENTION_SECONDS });

applyJsonTransform(conversationSchema);

export const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
