/**
 * A dish's photo. P24, docs/DB-SCHEMA.md section 30.
 *
 * Kept out of `menuitems`, so the ordering screen's read of the menu never
 * carries image bytes. One per item. Removing a photo deletes this row: a
 * photo is configuration, like a recipe, not a record of something that
 * happened.
 */
import mongoose from 'mongoose';

import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const MENU_PHOTO_CONTENT_TYPES = Object.freeze(['image/png', 'image/webp', 'image/jpeg']);

const menuPhotoSchema = new mongoose.Schema({
  menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  contentType: { type: String, required: true, enum: MENU_PHOTO_CONTENT_TYPES },
  data: { type: Buffer, required: true },
  sha256: { type: String, required: true, match: /^[0-9a-f]{64}$/ },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  sizeBytes: { type: Number, required: true },
  setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  setAt: { type: Date, required: true },
});

menuPhotoSchema.plugin(baseSchemaPlugin);
menuPhotoSchema.plugin(tenantGuardPlugin);

menuPhotoSchema.index({ restaurantId: 1, menuItemId: 1 }, { unique: true });

export const MenuPhoto = mongoose.model('MenuPhoto', menuPhotoSchema);

export default MenuPhoto;
