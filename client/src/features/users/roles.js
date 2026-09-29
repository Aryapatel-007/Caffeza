/**
 * The six roles, for the client.
 *
 * Mirrors server/config/roles.js. The server is what enforces any of this;
 * these labels exist so a dropdown does not show UPPER_SNAKE at a user.
 */
export const ROLES = Object.freeze({
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  WAITER: 'WAITER',
  KITCHEN: 'KITCHEN',
  STOREKEEPER: 'STOREKEEPER',
});

export const ROLE_LABELS = Object.freeze({
  OWNER: 'Owner',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  WAITER: 'Waiter',
  KITCHEN: 'Kitchen',
  STOREKEEPER: 'Storekeeper',
});

export const ROLE_VALUES = Object.freeze(Object.values(ROLES));

/**
 * The roles this user may assign.
 *
 * A manager cannot create or promote to owner. Hiding the option keeps them
 * out of a form they would only get a 403 from, which is a kindness, not a
 * security control. The server refuses it either way.
 */
export function assignableRoles(actorRole) {
  return actorRole === ROLES.OWNER ? ROLE_VALUES : ROLE_VALUES.filter((role) => role !== ROLES.OWNER);
}

export function roleOptions(actorRole) {
  return assignableRoles(actorRole).map((role) => ({ value: role, label: ROLE_LABELS[role] }));
}
