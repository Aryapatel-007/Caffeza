/**
 * Which of our dishes a platform's item is. P25 Part H, docs/DB-SCHEMA.md
 * section 35. Configuration, like a recipe: a mapping is removed outright.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

const mappingSchema = new mongoose.Schema({
  connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntegrationConnection', required: true },
  externalItemId: { type: String, required: true, trim: true, maxlength: 100 },
  externalVariantId: { type: String, trim: true, maxlength: 100, default: null },
  externalName: { type: String, trim: true, maxlength: 200, default: null },
  menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
  // { "<external add-on id>": "<our add-on id>" }
  addOnMap: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  lastSeenAt: { type: Date, default: null },
}, { minimize: false });

mappingSchema.plugin(baseSchemaPlugin);
mappingSchema.plugin(tenantGuardPlugin);

/** One mapping per external item and variant, per connection. */
mappingSchema.index({ restaurantId: 1, connectionId: 1, externalItemId: 1, externalVariantId: 1 }, { unique: true });
/** Which channels sell a dish, read when its availability changes. */
mappingSchema.index({ restaurantId: 1, menuItemId: 1 });

applyJsonTransform(mappingSchema);

export const PlatformItemMapping = mongoose.model('PlatformItemMapping', mappingSchema);
