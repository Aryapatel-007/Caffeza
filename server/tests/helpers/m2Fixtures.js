/**
 * Fixtures shared by the M2 test files.
 *
 * tables.test.js, orders.test.js and kitchen.test.js all need a restaurant with
 * every role signed in, a table, and something on the menu to order. Three
 * copies of that setup would be three things to update the next time login or
 * the menu changes shape.
 *
 * Everything here goes through the real API rather than the models, so the
 * fixtures exercise the same validation and permission chain the tests do.
 */
import { ROLES } from '../../config/roles.js';
import { DEFAULT_PASSWORD, seedFullRestaurant, seedUser } from './seed.js';
import { request } from './testServer.js';

export const tokenFor = async (phone) =>
  (await request('POST', '/api/v1/auth/login', { body: { phone, password: DEFAULT_PASSWORD } })).body
    .data.accessToken;

/**
 * A restaurant with one user in each of the six roles, all signed in.
 *
 * Returns the seed output plus `tokens`, keyed by role name, so a test can say
 * what a KITCHEN user is allowed to do without setting one up first.
 */
export async function seedTeam(options = {}) {
  const base = await seedFullRestaurant(options);
  const { restaurant, branch } = base;

  const tokens = { OWNER: await tokenFor(base.phone) };

  for (const role of [ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN, ROLES.STOREKEEPER]) {
    const seeded = await seedUser({ restaurant, branch, name: role, role });
    tokens[role] = await tokenFor(seeded.phone);
  }

  return { ...base, tokens };
}

export const createTable = (token, body = {}) =>
  request('POST', '/api/v1/tables', { token, body: { name: 'T1', ...body } });

/**
 * Category names are unique per branch, so the default is numbered.
 *
 * A fixed default meant the second createMenuItem() in a test quietly got a 409
 * on the category it was creating along the way, and the failure surfaced much
 * later as "cannot read id of undefined".
 */
let categoryCounter = 0;

export const createCategory = (token, body = {}) => {
  categoryCounter += 1;
  return request('POST', '/api/v1/categories', {
    token,
    body: { name: `Section ${categoryCounter}`, ...body },
  });
};

/**
 * A menu item, creating a category for it if one was not supplied.
 *
 * Priced at 24000 paise with 5% tax by default, which is what the contract's
 * own examples use, so a test asserting on a snapshot reads against familiar
 * numbers.
 */
export async function createMenuItem(token, body = {}) {
  const categoryId = body.categoryId ?? (await createCategory(token)).body.data.id;
  return request('POST', '/api/v1/menu-items', {
    token,
    body: {
      categoryId,
      name: 'Paneer Tikka',
      priceInPaise: 24000,
      taxRateBps: 500,
      ...body,
    },
  });
}

/** A restaurant with a table and one dish, which is the minimum to take an order. */
export async function seedFloor(options = {}) {
  const team = await seedTeam(options);
  const table = (await createTable(team.tokens.OWNER)).body.data;
  const item = (await createMenuItem(team.tokens.OWNER)).body.data;
  return { ...team, table, item };
}

export const openOrder = (token, body = {}) =>
  request('POST', '/api/v1/orders', {
    token,
    body: { orderType: 'DINE_IN', ...body },
  });

export const readOrder = (token, orderId) =>
  request('GET', `/api/v1/orders/${orderId}`, { token });

export const addLines = (token, orderId, body) =>
  request('POST', `/api/v1/orders/${orderId}/lines`, { token, body });

export const fireOrder = (token, orderId, version) =>
  request('POST', `/api/v1/orders/${orderId}/fire`, { token, body: { version } });

/**
 * Runs a table's order the whole way to READY_TO_BILL over the real API: one
 * line, fired, marked ready by the kitchen, then served. Being the only line,
 * serving it is what tips the order over on its own.
 *
 * Lives here rather than in one test file because M2 and M3 both need an order
 * in this exact state, and a second copy is how one drifts.
 *
 * `lines` overrides what is ordered, for a bill that needs several tax slabs.
 * Every line is fired and served, so the order always ends up billable.
 */
export async function readyToBillOrder({ tokens, table, item }, lines = null) {
  const requested = lines ?? [{ menuItemId: item.id, quantity: 1 }];

  const opened = (await openOrder(tokens.WAITER, { tableId: table.id, lines: requested })).body.data;
  const fired = (await fireOrder(tokens.WAITER, opened.id, opened.version)).body.data;

  await request('PATCH', `/api/v1/kots/${fired.kot.id}/ready`, { token: tokens.KITCHEN });

  let current = (await readOrder(tokens.WAITER, opened.id)).body.data;

  for (const line of current.lines) {
    const response = await request(
      'PATCH',
      `/api/v1/orders/${opened.id}/lines/${line.id}/served`,
      { token: tokens.WAITER, body: { version: current.version } },
    );
    current = response.body.data;
  }

  return current;
}
