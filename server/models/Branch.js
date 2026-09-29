/**
 * One physical outlet.
 *
 * Version 1 creates exactly one per restaurant, named "Main", and never a
 * second. The field exists on every other record so multi-outlet works later
 * without a migration, but the feature is not built and there is no create,
 * update or delete endpoint for it.
 *
 * Note the plugin pair. This is the tenancy-root exception from
 * docs/DB-SCHEMA.md: a branch belongs to a restaurant but is not inside a
 * branch, so it gets `restaurantId` and no `branchId`. Its own `_id` is what
 * every other collection stores as `branchId`.
 *
 * The tenant guard still applies in full. It only ever checks `restaurantId`,
 * which is exactly the scoping a branch needs.
 *
 * One consequence worth knowing: `scoped(req)` spreads `branchId`, and this
 * schema has no such path, so with strictQuery set to throw a query built that
 * way fails. Branch queries filter on `restaurantId` alone. See
 * controllers/branchController.js.
 */
import mongoose from 'mongoose';

import { baseSchemaTenantRootPlugin } from './plugins/baseSchemaTenantRoot.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
  },
  { _id: false },
);

const branchSchema = new mongoose.Schema({
  /** Defaults to "Main" at provisioning. */
  name: { type: String, required: true, trim: true },

  address: { type: addressSchema, default: () => ({}) },

  contactPhone: { type: String, trim: true },

  isActive: { type: Boolean, required: true, default: true },
});

// Adds restaurantId, timestamps and the toJSON transform. No branchId.
branchSchema.plugin(baseSchemaTenantRootPlugin);
branchSchema.plugin(tenantGuardPlugin);

export const Branch = mongoose.model('Branch', branchSchema);

export default Branch;
