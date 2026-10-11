/**
 * Whether the incoming requests inbox is on. P25 Part H: online orders are
 * on, or a delivery platform is connected and on, because platform orders
 * arrive in the same inbox. The server applies the same rule. P39: the inbox
 * poll also answers while WhatsApp is on, for the chats alert; the takeaway
 * screen itself still needs one of these two.
 */
export const TILL_ROLES = ['OWNER', 'MANAGER', 'CASHIER'];

export function inboxOn(features) {
  return Boolean(features?.online?.enabled) || (features?.online?.platformChannels?.length ?? 0) > 0;
}

/** Platform orders and chats are for the till; online orders follow the owner's alert roles. */
export function alertRoleOn(features, role) {
  const online = features?.online;
  if (online?.enabled && online.alertRoles?.includes(role)) return true;
  return ((online?.platformChannels?.length ?? 0) > 0 || Boolean(online?.chats)) && TILL_ROLES.includes(role);
}

/** P39. Chats are read and answered at the till. */
export const chatsOn = (features, role) => Boolean(features?.online?.chats) && TILL_ROLES.includes(role);
