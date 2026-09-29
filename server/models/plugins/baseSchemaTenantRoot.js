/**
 * The base schema plugin, for a tenancy root that has no branch.
 *
 * `branches` is the only collection that needs this. A branch belongs to a
 * restaurant but is not inside a branch: its own `_id` is what every other
 * collection stores as `branchId`.
 *
 * This is a separate file rather than an option on `baseSchema.js` on purpose.
 * The difference has to be visible at the import line, because a reader
 * skimming a model needs to see immediately that this one is an exception to
 * the rule in docs/CONVENTIONS.md section 4 rather than a mistake.
 *
 *   import { baseSchemaTenantRootPlugin } from './plugins/baseSchemaTenantRoot.js';
 *
 * `tenantGuardPlugin` still applies. It only ever checks `restaurantId`, which
 * is exactly the scoping a branch needs.
 */
import mongoose from 'mongoose';

export function baseSchemaTenantRootPlugin(schema) {
  schema.add({
    /**
     * The tenant.
     *
     * TODO(M0-C): add `ref: 'Restaurant'` if populate is ever needed. It is not
     * today, and a ref that nobody populates is decoration.
     */
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
  });

  // No branchId. That is the whole point of this plugin.

  schema.set('timestamps', true);

  schema.set('toJSON', {
    versionKey: false,
    transform(_document, record) {
      record.id = record._id?.toString();
      delete record._id;
      delete record.__v;
      return record;
    },
  });
}

export default baseSchemaTenantRootPlugin;
