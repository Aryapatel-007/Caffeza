/**
 * The six roles. This list is closed.
 *
 * Every permission check anywhere in the codebase reads from this file. If a
 * role is not in here it is not a role, and a value that is not in here is
 * always treated as failure, never as success.
 */
export const ROLES = Object.freeze({
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  WAITER: 'WAITER',
  KITCHEN: 'KITCHEN',
  STOREKEEPER: 'STOREKEEPER',
});

/** The role values as an array, for Zod enums and Mongoose enum validators. */
export const ROLE_VALUES = Object.freeze(Object.values(ROLES));

/** True only for a string that is exactly one of the six roles. */
export function isValidRole(value) {
  return typeof value === 'string' && ROLE_VALUES.includes(value);
}
