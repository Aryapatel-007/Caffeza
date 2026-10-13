/**
 * A manager's PIN to add to a printed bill. P40, API-CONTRACT P40.
 *
 * Adding dishes to an order whose live bill has been printed revises that
 * bill upward. A cashier needs a manager's PIN for it, as for removing one
 * (P29); an owner or manager approves their own; before the first print, or
 * with `approvals.revisePrintedBill` off, nobody is asked.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { AuditLog } from '../models/AuditLog.js';
import { ALL_MODELS } from '../models/index.js';
import { createMenuItem, readyToBillOrder, seedFloor } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

const ok = (response, what) => {
  assert.ok(response.status >= 200 && response.status < 300, `${what}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data;
};

async function managerApproval(floor, pin = '2468') {
  const manager = ok(await request('GET', '/api/v1/auth/me', { token: floor.tokens.MANAGER }), 'me').user;
  ok(await request('PATCH', `/api/v1/users/${manager.id}/pin`, { token: floor.tokens.OWNER, body: { pin } }), 'pin');
  return { approverId: manager.id, pin };
}

/** A one-dish table billed at the counter, nothing paid; printed when asked. */
async function counterBill({ printed }) {
  const floor = await seedFloor();
  floor.tokens.KITCHEN ??= floor.tokens.MANAGER;
  const extra = ok(await createMenuItem(floor.tokens.OWNER, { name: 'Dahi Puri', priceInPaise: 12000, taxRateBps: 500 }), 'dish');
  const order = await readyToBillOrder(floor, [{ menuItemId: floor.item.id, quantity: 1 }]);
  let bill = ok(await request('POST', '/api/v1/bills', { token: floor.tokens.CASHIER, body: { orderId: order.id, version: order.version } }), 'bill');
  if (printed) {
    ok(await request('POST', `/api/v1/bills/${bill.id}/printed`, { token: floor.tokens.CASHIER }), 'printed');
    bill = ok(await request('GET', `/api/v1/bills/${bill.id}`, { token: floor.tokens.CASHIER }), 'read');
    assert.equal(bill.printCount, 1);
  }
  return { floor, extra, bill, approval: await managerApproval(floor) };
}

async function addDish(token, { floor, extra, bill }, approval) {
  const order = ok(await request('GET', `/api/v1/orders/${bill.orderId}`, { token: floor.tokens.CASHIER }), 'order');
  return request('POST', `/api/v1/orders/${bill.orderId}/lines`, {
    token,
    body: { version: order.version, lines: [{ menuItemId: extra.id, quantity: 1 }], ...(approval ? { approval } : {}) },
  });
}

describe('a cashier adding to a printed bill', () => {
  it('is refused without a manager PIN, and the bill is unchanged', async () => {
    const setup = await counterBill({ printed: true });
    const refused = await addDish(setup.floor.tokens.CASHIER, setup);
    assert.equal(refused.status, 403, JSON.stringify(refused.body));
    assert.equal(refused.body.error.code, 'FORBIDDEN');
    assert.match(refused.body.error.message, /manager has to approve/);

    const unchanged = ok(await request('GET', `/api/v1/bills/${setup.bill.id}`, { token: setup.floor.tokens.CASHIER }), 'read');
    assert.equal(unchanged.lines.length, 1);
    assert.equal(unchanged.grandTotalInPaise, setup.bill.grandTotalInPaise);
    assert.equal(unchanged.revision ?? 0, 0);
  });

  it('is refused with a wrong PIN', async () => {
    const setup = await counterBill({ printed: true });
    const refused = await addDish(setup.floor.tokens.CASHIER, setup, { ...setup.approval, pin: '1111' });
    assert.equal(refused.status, 401, JSON.stringify(refused.body));
  });

  it('revises the bill with the PIN, and the revision and its audit line name the manager', async () => {
    const setup = await counterBill({ printed: true });
    ok(await addDish(setup.floor.tokens.CASHIER, setup, setup.approval), 'add with the PIN');

    const revised = ok(await request('GET', `/api/v1/bills/${setup.bill.id}`, { token: setup.floor.tokens.CASHIER }), 'read');
    assert.equal(revised.billNumber, setup.bill.billNumber);
    assert.equal(revised.lines.length, 2);
    assert.ok(revised.grandTotalInPaise > setup.bill.grandTotalInPaise);
    const revision = revised.revisions.at(-1);
    assert.equal(revision.kind, 'ADDED');
    assert.equal(revision.wasPrinted, true);
    assert.equal(String(revision.approvedBy), setup.approval.approverId);

    const audit = await AuditLog.findOne({ restaurantId: setup.bill.restaurantId, entityId: setup.bill.id, action: 'BILL_REVISED' }).lean();
    assert.equal(audit.details.approvedBy, setup.approval.approverId);
  });
});

describe('when no PIN is asked for adding', () => {
  it('a manager adds to a printed bill on their own', async () => {
    const setup = await counterBill({ printed: true });
    ok(await addDish(setup.floor.tokens.MANAGER, setup), 'manager adds');
  });

  it('a cashier adds to a bill never printed', async () => {
    const setup = await counterBill({ printed: false });
    ok(await addDish(setup.floor.tokens.CASHIER, setup), 'cashier adds before printing');
  });

  it('a cashier adds to a printed bill with the switch off', async () => {
    const setup = await counterBill({ printed: true });
    ok(
      await request('PATCH', '/api/v1/settings', {
        token: setup.floor.tokens.OWNER,
        body: { reason: 'P40 test', approvals: { revisePrintedBill: false } },
      }),
      'switch off',
    );
    ok(await addDish(setup.floor.tokens.CASHIER, setup), 'cashier adds with the switch off');
  });
});
