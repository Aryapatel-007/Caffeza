/**
 * The base schema plugin.
 *
 * Every model in this project applies this. It is what makes the tenancy rule
 * structural rather than a thing people remember to do:
 *
 *   schema.plugin(baseSchemaPlugin);
 *   schema.plugin(tenantGuardPlugin);
 *
 * Nothing here is applied yet. There are no models in M0 part A.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './jsonTransform.js';

export function baseSchemaPlugin(schema) {
  schema.add({
    /**
     * The tenant. Every record has one, every query filters on it.
     *
     * TODO(M0-B): add `ref: 'Restaurant'` once the Restaurant model exists.
     */
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    /**
     * The outlet. A restaurant has one to three of these.
     *
     * TODO(M0-B): add `ref: 'Branch'` once the Branch model exists.
     */
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
  });

  // createdAt and updatedAt as real Date objects, which Mongo stores in UTC.
  // Never a formatted string.
  schema.set('timestamps', true);

  // Every collection gets a compound index starting with restaurantId. An
  // index that does not start with restaurantId is almost always a mistake.
  //
  // Note: this makes the single-field restaurantId index above redundant,
  // because a compound index can be used for its leading field. Both are
  // declared because docs/CONVENTIONS.md section 4 asks for both. If index
  // count ever becomes a problem, the single-field one is the one to drop.
  schema.index({ restaurantId: 1, branchId: 1 });

  // The API speaks `id`. Mongo speaks `_id`. The version key is ours and is
  // nobody else business.
  //
  // Extracted to plugins/jsonTransform.js by M1, which needs the same transform
  // on two subdocument schemas that cannot apply this plugin. Behaviour here is
  // unchanged.
  applyJsonTransform(schema);
}

export default baseSchemaPlugin;
