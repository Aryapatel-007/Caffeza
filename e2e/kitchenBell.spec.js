/**
 * P45 through the screens: the kitchen screen rings for a ticket sent after it
 * opened, not for the ones already there, and stays silent with Sound off.
 * The rings are counted through a hook only a test sets, as prints are.
 */
import { expect, test } from '@playwright/test';

import { at, resetGolden } from './helpers/clock.js';
import { signIn } from './helpers/people.js';
import { openStation, tickets } from './pages/kitchen.js';

const DAY = '2026-09-26';
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

async function send(token, golden, table, dish) {
  const order = await api('POST', '/orders', token, {
    orderType: 'DINE_IN',
    tableId: golden.ids.tables[table],
    guestCount: 2,
    lines: [{ menuItemId: golden.ids.items[dish], quantity: 1 }],
  });
  await api('POST', `/orders/${order.id}/fire`, token, { version: order.version });
}

test.describe.configure({ mode: 'serial' });

test('the kitchen rings for a new ticket, once, and not with Sound off', async ({ browser }) => {
  const golden = await resetGolden();
  await at('13:10', DAY);
  const captain = await tokenOf(golden, 'Khuman Singh');
  await send(captain, golden, 'Table 12', 'Creamy Pesto Pasta');

  const station = await signIn(browser, { name: 'Manager', phone: golden.phones.Manager, password: golden.password, device: 'tablet' });
  await station.context.addInitScript(() => {
    window.__rings = 0;
    window.__E2E_SOUND__ = () => {
      window.__rings += 1;
    };
  });
  const page = station.page;
  await openStation(page, 'Live Kitchen');
  await page.reload();
  await expect(tickets(page, 'Table 12')).toHaveCount(1);
  const rings = () => page.evaluate(() => window.__rings);

  // 2026-10-14: the bell is off until this device turns it on.
  await page.getByRole('button', { name: 'Sound off' }).click();
  await expect(page.getByRole('button', { name: 'Sound on' })).toBeVisible();

  // The tap on Sound off above was the page's first tap, so the browser already allows sound.
  await expect(page.getByText('Tap anywhere to turn on the sound for new tickets.')).toHaveCount(0);
  expect(await rings(), 'the ticket already there does not ring').toBe(0);

  // A new ticket rings once.
  await send(captain, golden, 'Table 3', 'Half & Half Pizza');
  await expect(tickets(page, 'Table 3')).toHaveCount(1, { timeout: 20_000 });
  await expect.poll(rings).toBe(1);

  // With Sound off, nothing rings.
  await page.getByRole('button', { name: 'Sound on' }).click();
  await expect(page.getByRole('button', { name: 'Sound off' })).toBeVisible();
  await send(captain, golden, 'Table 5', 'Mexican Bowl');
  await expect(tickets(page, 'Table 5')).toHaveCount(1, { timeout: 20_000 });
  expect(await rings()).toBe(1);
});
