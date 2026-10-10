/**
 * P33, through the screens: two kitchen tablets, one marks a ticket ready and
 * the other shows it within two seconds without a reload. Then the second
 * tablet's live channel is cut, and it still catches up on its own within its
 * ten-second poll: the safety net the 2026-08-29 decision asked for.
 */
import { expect, test } from '@playwright/test';

import { resetGolden } from './helpers/clock.js';
import { signIn } from './helpers/people.js';
import { openStation, tickDish, tickets } from './pages/kitchen.js';

const APP = 'http://127.0.0.1:5055/api/v1';

async function api(method, path, token, body) {
  const response = await fetch(`${APP}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(parsed)}`);
  return parsed.data;
}
const tokenOf = async (golden, name) => (await api('POST', '/auth/login', null, { phone: golden.phones[name], password: golden.password })).accessToken;

async function fireDishes(golden, token, table, dishes) {
  const { items, tables } = golden.ids;
  const order = await api('POST', '/orders', token, {
    orderType: 'DINE_IN',
    tableId: tables[table],
    guestCount: 2,
    lines: dishes.map((name) => ({ menuItemId: items[name], quantity: 1 })),
  });
  await api('POST', `/orders/${order.id}/fire`, token, { version: order.version });
}

test.describe.configure({ mode: 'serial' });

test('a ticket marked ready on one tablet leaves the other at once, and the poll still catches up without the channel', async ({ browser }) => {
  const golden = await resetGolden();
  const captainToken = await tokenOf(golden, 'Khuman Singh');
  // With LIVE_CHANNEL=off there is no channel to test; every other spec covers the polling.
  const { live } = await api('GET', '/auth/me', captainToken);
  test.skip(!live.enabled, 'The live channel is off (LIVE_CHANNEL=off).');
  await fireDishes(golden, captainToken, 'Table 12', ['Creamy Pesto Pasta']);

  const first = await signIn(browser, { name: 'Manager', phone: golden.phones.Manager, password: golden.password, device: 'tablet' });
  const second = await signIn(browser, { name: 'Manager', phone: golden.phones.Manager, password: golden.password, device: 'tablet' });

  // The second tablet's live channel goes through a route the test can cut.
  let cut = false;
  const open = [];
  await second.page.routeWebSocket(/\/api\/v1\/live\//, (socket) => {
    if (cut) {
      socket.close();
      return;
    }
    socket.connectToServer();
    open.push(socket);
  });

  await openStation(first.page, 'Live Kitchen');
  await openStation(second.page, 'Live Kitchen');
  await expect(tickets(second.page, 'Table 12')).toHaveCount(1);
  expect(open.length, 'the second tablet never opened its live channel').toBeGreaterThan(0);

  // Healthy channel: the second tablet polls only every 60 seconds, so only the channel can do this in 2.
  await tickDish(first.page, 'Table 12', 'Creamy Pesto Pasta');
  await expect(tickets(second.page, 'Table 12')).toHaveCount(0, { timeout: 2_000 });

  // Cut the channel, and keep it cut.
  cut = true;
  for (const socket of open) await socket.close();

  // A new ticket still reaches the second tablet, on its own ten-second poll.
  await fireDishes(golden, captainToken, 'Table 14', ['Half & Half Pizza']);
  await expect(tickets(first.page, 'Table 14')).toHaveCount(1, { timeout: 2_000 });
  await expect(tickets(second.page, 'Table 14')).toHaveCount(1, { timeout: 15_000 });
  await second.page.screenshot({ path: 'e2e/screenshots/live-channel-cut.png', fullPage: true });
});
