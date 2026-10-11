/**
 * A WhatsApp template. P37, docs/DB-SCHEMA.md section 47.
 *
 * Meta approves templates, not us: a template is a record with a state, never a
 * string in the code. `approvedCategory` is what Meta decided, which can differ
 * from the `category` we asked for, and every cost is worked out from it.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const TEMPLATE_CATEGORIES = Object.freeze({ UTILITY: 'UTILITY', MARKETING: 'MARKETING', AUTHENTICATION: 'AUTHENTICATION' });
export const TEMPLATE_STATUSES = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAUSED: 'PAUSED',
  DISABLED: 'DISABLED',
});
export const TEMPLATE_BODY_MAX_LENGTH = 1024;
export const TEMPLATE_KEYS = Object.freeze({ BILL_RECEIPT: 'BILL_RECEIPT' });

const categories = Object.values(TEMPLATE_CATEGORIES);

const templateSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true, maxlength: 60 },
  metaName: { type: String, required: true, trim: true, maxlength: 512 },
  category: { type: String, required: true, enum: categories },
  approvedCategory: { type: String, enum: [...categories, null], default: null },
  language: { type: String, required: true, trim: true, maxlength: 15, default: 'en' },
  bodyText: { type: String, required: true, maxlength: TEMPLATE_BODY_MAX_LENGTH },
  variables: { type: [String], default: [] },
  example: { type: [String], default: [] },
  status: { type: String, required: true, enum: Object.values(TEMPLATE_STATUSES), default: TEMPLATE_STATUSES.DRAFT },
  rejectionReason: { type: String, trim: true, maxlength: 500, default: null },
  metaTemplateId: { type: String, trim: true, maxlength: 100, default: null },
  lastSyncedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

templateSchema.plugin(baseSchemaPlugin);
templateSchema.plugin(tenantGuardPlugin);

templateSchema.index({ restaurantId: 1, branchId: 1, key: 1 }, { unique: true });
templateSchema.index({ restaurantId: 1, branchId: 1, metaName: 1, language: 1 });

applyJsonTransform(templateSchema);

export const MessageTemplate = mongoose.model('MessageTemplate', templateSchema);

export default MessageTemplate;
