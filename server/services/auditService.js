/**
 * Writing the audit trail.
 *
 * One function, deliberately. Every money-or-trust event goes through it, so
 * "what gets audited" is a list of call sites rather than a convention people
 * remember unevenly.
 *
 * BUILD-PLAN section 7 requires who, when and why on voiding a bill, applying
 * a discount, correcting an attendance entry and adjusting stock. This covers
 * the three that touch this collection; M5's attendance corrections stay
 * embedded on the entry, a decision recorded on 2026-08-30.
 *
 * Append only. There is no update and no delete here, and adding one would
 * defeat the point: a tamperable audit log is worse than none, because it is
 * trusted.
 */
import { AuditLog } from '../models/AuditLog.js';
import { nowUtc } from '../utils/time.js';

/**
 * Records one audited event.
 *
 * `session` is passed through so the log entry commits with the change it
 * describes. An audit row that survives a rolled-back void would be a record of
 * something that never happened, which is worse than no record at all.
 *
 * The actor's role is snapshotted rather than referenced, because roles change
 * and the log must keep saying what was true at the time.
 */
export async function recordAudit(
  req,
  { action, entityType, entityId, entityLabel = null, reason, amountInPaise = null, details = null },
  session = null,
) {
  const [entry] = await AuditLog.create(
    [
      {
        restaurantId: req.restaurantId,
        branchId: req.branchId,
        action,
        entityType,
        entityId,
        entityLabel,
        actorId: req.user.id,
        actorRole: req.user.role,
        at: nowUtc(),
        reason,
        amountInPaise,
        details,
      },
    ],
    session ? { session } : {},
  );

  return entry;
}

export default { recordAudit };
