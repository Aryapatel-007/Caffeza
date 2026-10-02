/**
 * M8 Audit Trail, built in P17. docs/API-CONTRACT.md "M8".
 *
 * The golden day supplies real audit lines: six discounts, a void and a No
 * Charge by the Manager, cancels by the captain, the setup's settings change.
 * A second restaurant, with inventory and attendance on, covers the actions
 * M8 itself adds and the attendance merge.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { AuditLog, MANAGER_VISIBLE_ACTIONS } from '../models/AuditLog.js';
import { ALL_MODELS } from '../models/index.js';
import { ROLES } from '../config/roles.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { buildGoldenDay, GOLDEN_DATE, ist } from './helpers/goldenDay.js';
import { DEFAULT_PASSWORD, seedFullRestaurant, seedUser } from './helpers/seed.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

let golden;
let other;

async function login(phone) {
  const response = await request('POST', '/api/v1/auth/login', { body: { phone, password: DEFAULT_PASSWORD } });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data.accessToken;
}

const range = `from=${GOLDEN_DATE}&to=2026-09-27`;
const audit = (query, token) => request('GET', `/api/v1/audit?${query}`, { token });

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
  golden = await buildGoldenDay({ name: 'Cafezza' });

  // Close 26 September as the Manager, then the owner reopens it: DAY_CLOSED and DAY_REOPENED.
  setClockForTests(ist('09:00', '2026-09-27'));
  const close = await request('POST', '/api/v1/day-close', {
    token: golden.tokens.MANAGER,
    body: { businessDate: GOLDEN_DATE, countedCashInPaise: 340000, note: 'Four rupees short' },
  });
  assert.equal(close.status, 201, JSON.stringify(close.body));
  setClockForTests(ist('09:30', '2026-09-27'));
  const reopen = await request('POST', `/api/v1/day-close/${GOLDEN_DATE}/reopen`, {
    token: golden.tokens.OWNER,
    body: { reason: 'Checking a bill' },
  });
  assert.equal(reopen.status, 200, JSON.stringify(reopen.body));
  resetClockForTests();

  const seeded = await seedFullRestaurant({ name: 'Other Cafe', ownerName: 'Other Owner' });
  const manager = await seedUser({ restaurant: seeded.restaurant, branch: seeded.branch, name: 'Other Manager', role: ROLES.MANAGER });
  const waiter = await seedUser({ restaurant: seeded.restaurant, branch: seeded.branch, name: 'Other Waiter', role: ROLES.WAITER });
  other = {
    ...seeded,
    owner: await login(seeded.phone),
    manager: await login(manager.phone),
    waiterId: String(waiter.user._id),
  };
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

afterEach(() => resetClockForTests());

// ---------------------------------------------------------------------------

describe('GET /audit', () => {
  it('is 401 with no token and 403 for a cashier or waiter', async () => {
    assert.equal((await audit(range)).status, 401);
    assert.equal((await audit(range, golden.tokens.CASHIER)).status, 403);
    assert.equal((await audit(range, golden.tokens.WAITER)).status, 403);
  });

  it('gives the owner every line, newest first, with the actor resolved and the role at the time', async () => {
    const response = await audit(`${range}&limit=200`, golden.tokens.OWNER);
    assert.equal(response.status, 200);
    const lines = response.body.data;
    const actions = new Set(lines.map((line) => line.action));
    for (const action of ['DISCOUNT_APPLIED', 'BILL_VOIDED', 'NO_CHARGE_GIVEN', 'LINE_CANCELLED_AFTER_PREP', 'ORDER_CANCELLED', 'SETTINGS_CHANGED', 'DAY_CLOSED', 'DAY_REOPENED', 'BILL_CHARGED_TO_ACCOUNT', 'CASH_PAID_OUT']) {
      if (action === 'ORDER_CANCELLED') continue; // the golden day cancels lines, not whole orders
      assert.ok(actions.has(action), action);
    }
    for (let index = 1; index < lines.length; index += 1) assert.ok(new Date(lines[index - 1].at) >= new Date(lines[index].at));
    const voided = lines.find((line) => line.action === 'BILL_VOIDED');
    assert.deepEqual(
      [voided.entityLabel, voided.actorName, voided.actorRole, voided.amountInPaise, voided.source],
      ['CFA/C/22452', 'Manager', 'MANAGER', 34700, 'AUDIT_LOG'],
    );
    assert.equal(response.body.meta.total, lines.length);
  });

  it('a MANAGER sees LINE_CANCELLED_AFTER_PREP, and not NO_CHARGE_GIVEN, DAY_REOPENED or SETTINGS_CHANGED; the total does not leak', async () => {
    const response = await audit(`${range}&limit=200`, golden.tokens.MANAGER);
    assert.equal(response.status, 200);
    const actions = new Set(response.body.data.map((line) => line.action));
    assert.ok(actions.has('LINE_CANCELLED_AFTER_PREP'));
    for (const hidden of ['NO_CHARGE_GIVEN', 'DAY_REOPENED', 'SETTINGS_CHANGED', 'BILL_VOIDED', 'DISCOUNT_APPLIED']) assert.ok(!actions.has(hidden), hidden);
    for (const action of actions) assert.ok(MANAGER_VISIBLE_ACTIONS.includes(action), action);
    assert.equal(response.body.meta.total, response.body.data.length);

    const asked = await audit(`${range}&action=NO_CHARGE_GIVEN,DAY_REOPENED`, golden.tokens.MANAGER);
    assert.equal(asked.status, 200);
    assert.deepEqual(asked.body.data, []);
    assert.equal(asked.body.meta.total, 0);
  });

  it('an OWNER sees NO_CHARGE_GIVEN, DAY_REOPENED and SETTINGS_CHANGED', async () => {
    const response = await audit(`${range}&action=NO_CHARGE_GIVEN,DAY_REOPENED,SETTINGS_CHANGED`, golden.tokens.OWNER);
    assert.deepEqual([...new Set(response.body.data.map((line) => line.action))].sort(), ['DAY_REOPENED', 'NO_CHARGE_GIVEN', 'SETTINGS_CHANGED']);
  });

  it('filters by action, entity type and actor, pages, and refuses a range over 366 days or an unknown action', async () => {
    const voids = await audit(`${range}&action=BILL_VOIDED`, golden.tokens.OWNER);
    assert.equal(voids.body.data.length, 1);
    const actorId = voids.body.data[0].actorId;
    const byManager = await audit(`${range}&actorId=${actorId}&entityType=BILL&limit=200`, golden.tokens.OWNER);
    assert.ok(byManager.body.data.every((line) => line.actorId === actorId && line.entityType === 'BILL'));
    const paged = await audit(`${range}&limit=2&page=2`, golden.tokens.OWNER);
    assert.equal(paged.body.data.length, 2);
    assert.equal(paged.body.meta.page, 2);
    assert.equal((await audit('from=2025-01-01&to=2026-09-27', golden.tokens.OWNER)).status, 422);
    assert.equal((await audit(`${range}&action=NOT_A_THING`, golden.tokens.OWNER)).status, 400);
  });

  it('never shows another restaurant\'s lines', async () => {
    const response = await audit(`${range}&limit=200`, other.owner);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.filter((line) => line.entityLabel === 'CFA/C/22452').length, 0);
  });
});

describe('GET /audit/entity/:entityType/:entityId', () => {
  it('reads one bill\'s history oldest first; 404 for another restaurant or nothing recorded', async () => {
    const billId = golden.ids.bills.B11;
    const response = await request('GET', `/api/v1/audit/entity/BILL/${billId}`, { token: golden.tokens.OWNER });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data.map((line) => line.action), ['BILL_VOIDED']);
    assert.equal((await request('GET', `/api/v1/audit/entity/BILL/${billId}`, { token: other.owner })).status, 404);
    assert.equal((await request('GET', `/api/v1/audit/entity/BILL/${golden.ids.bills.B03}`, { token: golden.tokens.OWNER })).status, 404);
  });

  it('applies the manager restriction: a voided bill\'s history is empty for a MANAGER, an order\'s waste is not', async () => {
    const bill = await request('GET', `/api/v1/audit/entity/BILL/${golden.ids.bills.B11}`, { token: golden.tokens.MANAGER });
    assert.equal(bill.status, 200);
    assert.deepEqual(bill.body.data, []);
    const order = await request('GET', `/api/v1/audit/entity/ORDER/${golden.ids.orders.B13}`, { token: golden.tokens.MANAGER });
    assert.deepEqual(order.body.data.map((line) => line.action), ['LINE_CANCELLED_AFTER_PREP']);
  });
});

describe('GET /audit/summary', () => {
  it('is OWNER only', async () => {
    assert.equal((await request('GET', `/api/v1/audit/summary?${range}`, { token: golden.tokens.MANAGER })).status, 403);
  });

  it('the golden day: Manager voided ₹347.00 on 1 bill, applied ₹423.90 of discounts on 6, approved ₹230.00 of No Charge on 1', async () => {
    const response = await request('GET', `/api/v1/audit/summary?${range}`, { token: golden.tokens.OWNER });
    assert.equal(response.status, 200);
    const { byActor, byAction, totalEventCount } = response.body.data;
    const manager = byActor.find((row) => row.actorName === 'Manager');
    assert.deepEqual(
      [manager.voidCount, manager.voidAmountInPaise, manager.discountCount, manager.discountAmountInPaise, manager.noChargeCount, manager.noChargeAmountInPaise, manager.paymentCorrectionCount],
      [1, 34700, 6, 42390, 1, 23000, 0],
    );
    assert.equal(byActor[0].actorName, 'Manager', 'ranked by value voided');
    assert.equal(totalEventCount, byAction.reduce((sum, row) => sum + row.count, 0));
    assert.equal(byAction.find((row) => row.action === 'DISCOUNT_APPLIED').amountInPaise, 42390);
  });
});

// ---------------------------------------------------------------------------

describe('The actions M8 adds', () => {
  const today = () => new Date().toISOString().slice(0, 10);
  const otherRange = () => `from=2026-01-01&to=${today()}&limit=200`;
  const linesOf = async (action) => (await audit(`${otherRange()}&action=${action}`, other.owner)).body.data;

  it('writes USER_ROLE_CHANGED, USER_DEACTIVATED, USER_REACTIVATED, USER_PASSWORD_RESET and USER_PIN_RESET, with the staff name resolved, not stored', async () => {
    const id = other.waiterId;
    const steps = [
      ['PATCH', `/api/v1/users/${id}`, { role: 'CASHIER' }],
      ['PATCH', `/api/v1/users/${id}/status`, { isActive: false }],
      ['PATCH', `/api/v1/users/${id}/status`, { isActive: true }],
      ['PATCH', `/api/v1/users/${id}/password`, { newPassword: 'a new long password' }],
      ['PATCH', `/api/v1/users/${id}/pin`, { pin: '4821' }],
    ];
    for (const [method, url, body] of steps) {
      const response = await request(method, url, { token: other.manager, body });
      assert.equal(response.status, 200, `${url} ${JSON.stringify(response.body)}`);
    }
    for (const action of ['USER_ROLE_CHANGED', 'USER_DEACTIVATED', 'USER_REACTIVATED', 'USER_PASSWORD_RESET', 'USER_PIN_RESET']) {
      const [line] = await linesOf(action);
      assert.ok(line, action);
      assert.equal(line.entityType, 'USER');
      assert.equal(line.entityId, id);
      assert.equal(line.entityLabel, 'Other Waiter');
      assert.equal(line.actorName, 'Other Manager');
    }
    const [role] = await linesOf('USER_ROLE_CHANGED');
    assert.deepEqual(role.details, { fromRole: 'WAITER', toRole: 'CASHIER' });
    const stored = await AuditLog.find({ restaurantId: other.restaurant._id, entityType: 'USER' }).lean();
    assert.ok(stored.every((line) => line.entityLabel === null && !JSON.stringify(line.details).includes('Other Waiter')));
  });

  it('writes MENU_PRICE_CHANGED for a price or tax change, never for a rename', async () => {
    const category = await request('POST', '/api/v1/categories', { token: other.owner, body: { name: 'Coffee' } });
    const item = await request('POST', '/api/v1/menu-items', {
      token: other.owner,
      body: { categoryId: category.body.data.id, name: 'Latte', priceInPaise: 20000, taxRateBps: 500 },
    });
    assert.equal(item.status, 201, JSON.stringify(item.body));
    const itemId = item.body.data.id;
    assert.equal((await request('PATCH', `/api/v1/menu-items/${itemId}`, { token: other.owner, body: { name: 'Caffe Latte' } })).status, 200);
    assert.equal((await linesOf('MENU_PRICE_CHANGED')).length, 0);
    assert.equal((await request('PATCH', `/api/v1/menu-items/${itemId}`, { token: other.owner, body: { priceInPaise: 22000 } })).status, 200);
    const [line] = await linesOf('MENU_PRICE_CHANGED');
    assert.equal(line.entityLabel, 'Caffe Latte');
    assert.equal(line.amountInPaise, 22000);
    assert.deepEqual(line.details.changes, [{ field: 'priceInPaise', from: 20000, to: 22000 }]);
  });

  it('writes RECIPE_CHANGED when a recipe\'s ingredients change or it is deleted, not when it is created', async () => {
    const [menuItem] = (await request('GET', '/api/v1/menu-items', { token: other.owner })).body.data;
    const milk = await request('POST', '/api/v1/ingredients', { token: other.owner, body: { name: 'Milk', baseUnit: 'ML' } });
    assert.equal(milk.status, 201, JSON.stringify(milk.body));
    const put = (qtyInBase) =>
      request('PUT', '/api/v1/recipes', {
        token: other.owner,
        body: { menuItemId: menuItem.id, items: [{ ingredientId: milk.body.data.id, qtyInBase }] },
      });
    const created = await put(200);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal((await linesOf('RECIPE_CHANGED')).length, 0);
    assert.equal((await put(200)).status, 200);
    assert.equal((await linesOf('RECIPE_CHANGED')).length, 0, 'saving the same items is not a change');
    assert.equal((await put(250)).status, 200);
    assert.equal((await linesOf('RECIPE_CHANGED')).length, 1);
    assert.equal((await request('DELETE', `/api/v1/recipes/${created.body.data.id}`, { token: other.owner })).status, 200);
    const lines = await linesOf('RECIPE_CHANGED');
    assert.equal(lines.length, 2);
    assert.equal(lines[0].details.deleted, true);
  });

  it('merges attendance corrections for the owner, marked with the current role, and never for a manager', async () => {
    const created = await request('POST', '/api/v1/attendance', {
      token: other.manager,
      body: { userId: other.waiterId, clockInAt: new Date(Date.now() - 5 * 3600_000).toISOString(), reason: 'Forgot to clock in' },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const corrected = await request('PATCH', `/api/v1/attendance/${created.body.data.id}`, {
      token: other.manager,
      body: { clockOutAt: new Date(Date.now() - 3600_000).toISOString(), reason: 'Left at closing' },
    });
    assert.equal(corrected.status, 200, JSON.stringify(corrected.body));

    const owner = (await audit(`${otherRange()}&action=ATTENDANCE_CORRECTED`, other.owner)).body.data;
    assert.ok(owner.length >= 1);
    const line = owner.find((entry) => entry.reason === 'Left at closing');
    assert.deepEqual(
      [line.source, line.entityType, line.actorName, line.actorRole, line.actorRoleIsCurrent],
      ['ATTENDANCE_CORRECTION', 'ATTENDANCE', 'Other Manager', 'MANAGER', true],
    );
    assert.match(line.entityLabel, /^Other Waiter, \d{4}-\d{2}-\d{2}$/);
    assert.equal(await AuditLog.countDocuments({ restaurantId: other.restaurant._id, action: 'ATTENDANCE_CORRECTED' }), 0);

    const manager = (await audit(`${otherRange()}`, other.manager)).body.data;
    assert.ok(manager.every((entry) => entry.source === 'AUDIT_LOG'));

    const history = await request('GET', `/api/v1/audit/entity/ATTENDANCE/${created.body.data.id}`, { token: other.owner });
    assert.equal(history.status, 200);
    assert.ok(history.body.data.some((entry) => entry.reason === 'Left at closing'));
  });
});

describe('Append-only, by construction', () => {
  it('refuses every update, replace and delete, and a save of an existing line', async () => {
    const line = await AuditLog.findOne({ restaurantId: golden.restaurant._id });
    const filter = { restaurantId: golden.restaurant._id, _id: line._id };
    const attempts = [
      () => AuditLog.updateOne(filter, { reason: 'changed' }),
      () => AuditLog.updateMany(filter, { reason: 'changed' }),
      () => AuditLog.findOneAndUpdate(filter, { reason: 'changed' }),
      () => AuditLog.replaceOne(filter, { reason: 'changed' }),
      () => AuditLog.deleteOne(filter),
      () => AuditLog.deleteMany(filter),
      () => AuditLog.findOneAndDelete(filter),
      () => line.deleteOne(),
      () => {
        line.reason = 'changed';
        return line.save();
      },
    ];
    for (const attempt of attempts) {
      await assert.rejects(attempt, (error) => error.name === 'AuditLogImmutableError' || /append-only/.test(error.message));
    }
    const unchanged = await AuditLog.findOne(filter).lean();
    assert.notEqual(unchanged.reason, 'changed');
  });
});
