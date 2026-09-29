/**
 * Branches.
 *
 * Read only in version 1. Branches are created by the provisioning script and
 * there is no create, update or delete endpoint. The list always holds exactly
 * one entry today.
 */
import { Branch } from '../models/Branch.js';
import { sendList } from '../utils/response.js';

/**
 * GET /branches
 *
 * Note the filter is written out rather than using `scoped(req)`.
 *
 * `scoped(req)` spreads both restaurantId and branchId, and a branch has no
 * branchId field: its own _id serves that purpose. With strictQuery set to
 * throw, passing one here fails outright. This is the tenancy root exception
 * from docs/DB-SCHEMA.md, and it is the only collection where the shared
 * helper does not apply.
 *
 * The tenant guard is still satisfied, because it only ever checks
 * restaurantId.
 */
export async function listBranches(req, res) {
  const filter = { restaurantId: req.restaurantId };

  const [branches, total] = await Promise.all([
    Branch.find(filter).sort({ createdAt: 1 }).skip((req.query.page - 1) * req.query.limit).limit(req.query.limit),
    Branch.countDocuments(filter),
  ]);

  return sendList(res, branches.map((branch) => branch.toJSON()), {
    page: req.query.page,
    limit: req.query.limit,
    total,
  });
}
