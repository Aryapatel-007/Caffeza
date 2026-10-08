/**
 * Whether the incoming requests inbox is on. P25 Part H: online orders are
 * on, or a delivery platform is connected and on, because platform orders
 * arrive in the same inbox. The server applies the same rule.
 */
export const TILL_ROLES = ['OWNER', 'MANAGER', 'CASHIER'];

export function inboxOn(features) {
  return Boolean(features?.online?.enabled) || (features?.online?.platformChannels?.length ?? 0) > 0;
}

/** Platform orders are for the till; online orders follow the owner's alert roles. */
export function alertRoleOn(features, role) {
  const online = features?.online;
  if (online?.enabled && online.alertRoles?.includes(role)) return true;
  return (online?.platformChannels?.length ?? 0) > 0 && TILL_ROLES.includes(role);
}
