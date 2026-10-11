/**
 * P36: one kitchen ticket per table. docs/prompts/P36-one-kitchen-ticket-per-table.md
 * section 4, API-CONTRACT "P36", DB-SCHEMA section 46.
 *
 * With `kitchen.oneTicketPerOrder` on (the default), an order keeps one ticket:
 * later Sends are rounds on it, under the same KOT number, and every line keeps
 * the station that makes it.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Kot } from '../models/Kot.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { addLines, createCategory, createMenuItem, fireOrder, openOrder, seedFloor } from './helpers/m2Fixtures.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

before(async () => {
  await startTestDatabase();
  await startTestServer();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
});

afterEach(() => resetClockForTests());

const ok = (response, what) => {
  assert.ok(response.status >= 200 && response.status < 300, `${what}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data;
};

const ist = (time, date = '2026-10-05') => new Date(`${date}T${time}:00+05:30`);

/** Live Kitchen and Beverages, a pasta routed to the kitchen and a latte to the bar. */
async function stationFloor() {
  const floor = await seedFloor();
  const { tokens } = floor;
  const kitchen = ok(await request('POST', '/api/v1/stations', { token: tokens.OWNER, body: { name: 'Live Kitchen', displayOrder: 0 } }), 'kitchen');
  const bar = ok(await request('POST', '/api/v1/stations', { token: tokens.OWNER, body: { name: 'Beverages', displayOrder: 1 } }), 'bar');
  const pastaCategory = ok(await createCategory(tokens.OWNER, { name: 'Pasta' }), 'pasta category');
  const coffeeCategory = ok(await createCategory(tokens.OWNER, { name: 'Italian Coffees' }), 'coffee category');
  ok(await request('PATCH', `/api/v1/categories/${pastaCategory.id}`, { token: tokens.OWNER, body: { stationId: kitchen.id } }), 'route pasta');
  ok(await request('PATCH', `/api/v1/categories/${coffeeCategory.id}`, { token: tokens.OWNER, body: { stationId: bar.id } }), 'route coffee');
  const pasta = ok(await createMenuItem(tokens.OWNER, { name: 'Creamy Pesto Pasta', priceInPaise: 43000, categoryId: pastaCategory.id }), 'pasta');
  const latte = ok(await createMenuItem(tokens.OWNER, { name: 'Caffe Latte', priceInPaise: 22000, categoryId: coffeeCategory.id }), 'latte');
  return { ...floor, kitchen, bar, pasta, latte };
}

/** Opens the table with `first` and sends it, then adds `second` and sends that too. */
async function twoSends(floor, first, second) {
  const opened = ok(await openOrder(floor.tokens.WAITER, { tableId: floor.table.id, lines: first }), 'open');
  const one = ok(await fireOrder(floor.tokens.WAITER, opened.id, opened.version), 'first send');
  const added = ok(await addLines(floor.tokens.WAITER, opened.id, { version: one.order.version, lines: second }), 'add');
  const two = ok(await fireOrder(floor.tokens.WAITER, opened.id, added.version), 'second send');
  return { orderId: opened.id, one, two };
}

const kotsOf = (token, query = '') => request('GET', `/api/v1/kots${query}`, { token });

describe('one ticket per order', () => {
  it('puts a second Send on the same ticket, under the same number, as round 2', async () => {
    const floor = await seedFloor();
    const { one, two } = await twoSends(floor, [{ menuItemId: floor.item.id, quantity: 1 }], [{ menuItemId: floor.item.id, quantity: 2 }]);

    assert.equal(two.kot.id, one.kot.id);
    assert.equal(two.kot.kotNumber, one.kot.kotNumber);
    assert.equal(one.round, 1);
    assert.equal(two.round, 2);
    assert.equal(two.kot.rounds, 2);
    assert.deepEqual(two.kot.lines.map((line) => [line.round, line.quantity]), [[1, 1], [2, 2]]);
    assert.ok(new Date(two.kot.lastFiredAt) >= new Date(two.kot.firedAt));
    // Every order line points at that one ticket.
    assert.deepEqual([...new Set(two.order.lines.map((line) => line.kotId))], [one.kot.id]);

    const tickets = ok(await kotsOf(floor.tokens.KITCHEN), 'list');
    assert.equal(tickets.length, 1);
    assert.equal(await Kot.countDocuments({ restaurantId: floor.restaurant._id }), 1);
  });

  it('holds several stations on one ticket, each station listing it and marking only its own dishes', async () => {
    const floor = await stationFloor();
    const opened = ok(
      await openOrder(floor.tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: floor.pasta.id, quantity: 1 }, { menuItemId: floor.latte.id, quantity: 1 }] }),
      'open',
    );
    const fired = ok(await fireOrder(floor.tokens.WAITER, opened.id, opened.version), 'send');
    assert.equal(fired.kots.length, 1);
    const kot = fired.kot;
    assert.equal(kot.stationId, null, 'a ticket for two stations has no one station of its own');
    assert.deepEqual(kot.lines.map((line) => [line.itemName, line.stationName]), [['Creamy Pesto Pasta', 'Live Kitchen'], ['Caffe Latte', 'Beverages']]);

    for (const station of [floor.kitchen, floor.bar]) {
      const list = ok(await kotsOf(floor.tokens.KITCHEN, `?stationId=${station.id}`), station.name);
      assert.deepEqual(list.map((entry) => entry.id), [kot.id], station.name);
    }

    // The bar marks its part ready; the kitchen's pasta is still to make.
    const marked = ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready?stationId=${floor.bar.id}`, { token: floor.tokens.KITCHEN }), 'bar ready');
    assert.deepEqual(marked.lines.map((line) => [line.itemName, line.status]), [['Creamy Pesto Pasta', 'PENDING'], ['Caffe Latte', 'READY']]);
    assert.equal(marked.status, 'IN_PROGRESS');

    // The bar takes its tick back, and only its own.
    const undone = ok(await request('POST', `/api/v1/kots/${kot.id}/undo-ready?stationId=${floor.bar.id}`, { token: floor.tokens.KITCHEN }), 'bar undo');
    assert.deepEqual(undone.lines.map((line) => line.status), ['PENDING', 'PENDING']);

    // A station with no dish on the ticket is refused.
    const other = ok(await request('POST', '/api/v1/stations', { token: floor.tokens.OWNER, body: { name: 'Tandoor', displayOrder: 2 } }), 'tandoor');
    const refused = await request('PATCH', `/api/v1/kots/${kot.id}/ready?stationId=${other.id}`, { token: floor.tokens.KITCHEN });
    assert.equal(refused.status, 422);
  });

  it("prints a round's own dishes for one station, headed ROUND 2", async () => {
    const floor = await stationFloor();
    const { two } = await twoSends(
      floor,
      [{ menuItemId: floor.pasta.id, quantity: 1 }],
      [{ menuItemId: floor.pasta.id, quantity: 2 }, { menuItemId: floor.latte.id, quantity: 1 }],
    );
    const ticket = (query) => request('GET', `/api/v1/kots/${two.kot.id}/ticket?width=32${query}`, { token: floor.tokens.KITCHEN });

    const roundTwoKitchen = ok(await ticket(`&round=2&stationId=${floor.kitchen.id}`), 'round 2, kitchen').text;
    assert.match(roundTwoKitchen, /LIVE KITCHEN/);
    assert.match(roundTwoKitchen, /KOT \d+ {2}ROUND 2/);
    assert.match(roundTwoKitchen, /2 x Creamy Pesto Pasta/);
    assert.doesNotMatch(roundTwoKitchen, /1 x Creamy Pesto Pasta/);
    assert.doesNotMatch(roundTwoKitchen, /Caffe Latte/);

    const whole = ok(await ticket(''), 'whole').text;
    assert.match(whole, /1 x Creamy Pesto Pasta/);
    assert.match(whole, /2 x Creamy Pesto Pasta/);
    assert.match(whole, /Caffe Latte/);
    assert.doesNotMatch(whole, /ROUND/);

    // Round 1 had no latte: nothing to print for the bar.
    assert.equal((await ticket(`&round=1&stationId=${floor.bar.id}`)).status, 422);
    assert.equal((await ticket('&round=0')).status, 400);
  });

  it('with the setting off, makes a ticket per station per Send, as P05', async () => {
    const floor = await stationFloor();
    ok(await request('PATCH', '/api/v1/settings', { token: floor.tokens.OWNER, body: { reason: 'A ticket per station', kitchen: { oneTicketPerOrder: false } } }), 'off');
    const { one, two } = await twoSends(floor, [{ menuItemId: floor.pasta.id, quantity: 1 }, { menuItemId: floor.latte.id, quantity: 1 }], [{ menuItemId: floor.pasta.id, quantity: 1 }]);
    assert.equal(one.kots.length, 2);
    assert.notEqual(two.kot.id, one.kots[0].id);
    assert.equal(await Kot.countDocuments({ restaurantId: floor.restaurant._id }), 3);
  });

  it('still lists a ticket from before P36, whose lines have no station, by its own station', async () => {
    const floor = await stationFloor();
    const opened = ok(await openOrder(floor.tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: floor.latte.id, quantity: 1 }] }), 'open');
    const fired = ok(await fireOrder(floor.tokens.WAITER, opened.id, opened.version), 'send');
    // As a ticket written before P36: the station on the ticket, none on the lines.
    await Kot.collection.updateOne(
      { _id: (await Kot.findOne({ restaurantId: floor.restaurant._id }))._id },
      { $unset: { 'lines.$[].stationId': '', 'lines.$[].stationName': '', 'lines.$[].firedAt': '', 'lines.$[].round': '', rounds: '', lastFiredAt: '' } },
    );
    const list = ok(await kotsOf(floor.tokens.KITCHEN, `?stationId=${floor.bar.id}`), 'bar');
    assert.deepEqual(list.map((entry) => entry.id), [fired.kot.id]);
    assert.equal(list[0].lines[0].stationName, 'Beverages', "a line goes by the ticket's station");
    assert.equal(list[0].rounds, 1);
    assert.equal(ok(await kotsOf(floor.tokens.KITCHEN, `?stationId=${floor.kitchen.id}`), 'kitchen').length, 0);
  });

  it("measures a round's kitchen time from its own Send, in R13", async () => {
    const floor = await stationFloor();
    setClockForTests(ist('19:00'));
    const opened = ok(await openOrder(floor.tokens.WAITER, { tableId: floor.table.id, lines: [{ menuItemId: floor.pasta.id, quantity: 1 }] }), 'open');
    const one = ok(await fireOrder(floor.tokens.WAITER, opened.id, opened.version), 'first send');
    setClockForTests(ist('19:10'));
    const added = ok(await addLines(floor.tokens.WAITER, opened.id, { version: one.order.version, lines: [{ menuItemId: floor.pasta.id, quantity: 1 }] }), 'add');
    ok(await fireOrder(floor.tokens.WAITER, opened.id, added.version), 'second send');
    setClockForTests(ist('19:15'));
    ok(await request('PATCH', `/api/v1/kots/${one.kot.id}/ready`, { token: floor.tokens.KITCHEN }), 'ready');

    const data = ok(await request('GET', '/api/v1/reports/v2/tables?from=2026-10-05&to=2026-10-05', { token: floor.tokens.OWNER }), 'R13');
    const kitchen = data.sections.find((entry) => entry.key === 'kitchen');
    const row = kitchen.rows.find((entry) => entry.name === 'Live Kitchen');
    assert.equal(row.itemsMade, 2);
    // 15 minutes for round 1 and 5 for round 2: 10.00 on average, not 15.00 from the first Send.
    assert.equal(row.kitchenTime, 1000);
  });
});
