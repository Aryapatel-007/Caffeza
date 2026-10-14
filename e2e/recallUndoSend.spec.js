/**
 * P41 through the screens: a captain sends dishes and takes the Send back
 * with Undo; the kitchen brings a finished ticket back with Recall; the floor
 * shows tiles only.
 */
import { expect, test } from '@playwright/test';

import { at, resetGolden } from './helpers/clock.js';
import { signIn } from './helpers/people.js';
import { gotoFloor, tile } from './pages/floor.js';
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

test.describe.configure({ mode: 'serial' });

test('a captain undoes a Send, and the kitchen recalls a finished ticket', async ({ browser }) => {
  const golden = await resetGolden();
  await at('13:10', DAY);
  const [captainToken, manager] = await Promise.all(['Khuman Singh', 'Manager'].map((name) => tokenOf(golden, name)));
  const { items, tables } = golden.ids;

  // Table 12: a pasta, not sent yet.
  const order = await api('POST', '/orders', captainToken, {
    orderType: 'DINE_IN',
    tableId: tables['Table 12'],
    guestCount: 2,
    lines: [{ menuItemId: items['Creamy Pesto Pasta'], quantity: 1 }],
  });

  const captain = await signIn(browser, { name: 'Khuman Singh', phone: golden.phones['Khuman Singh'], password: golden.password, device: 'phone' });
  await gotoFloor(captain.page);
  await expect(tile(captain.page, 'Table 12')).toBeVisible();
  // P41. Tiles only: no Plan / Tiles switch anywhere on the floor.
  await expect(captain.page.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0);
  await expect(captain.page.getByRole('button', { name: 'Tiles', exact: true })).toHaveCount(0);

  await captain.page.goto(`/orders/${order.id}`);
  await captain.page.getByRole('button', { name: /^Send 1 to (the )?kitchen/ }).filter({ visible: true }).first().click();
  const bar = captain.page.getByRole('status').filter({ hasText: 'Sent to the kitchen.' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(captain.page.getByText('Taken back from the kitchen. The dishes are on the order, not sent.')).toBeVisible();

  const undone = await api('GET', `/orders/${order.id}`, captainToken);
  expect(undone.lines.map((line) => [line.status, line.cancelReasonCode ?? null])).toEqual([
    ['CANCELLED', 'SENT_BY_MISTAKE'],
    ['PENDING', null],
  ]);
  await expect(captain.page.getByRole('button', { name: /^Send 1 to (the )?kitchen/ }).filter({ visible: true }).first()).toBeEnabled();

  // Table 3: a pizza sent and finished; the kitchen brings it back.
  const pizza = await api('POST', '/orders', captainToken, {
    orderType: 'DINE_IN',
    tableId: tables['Table 3'],
    guestCount: 2,
    lines: ['Half & Half Pizza', 'Chilli Garlic Noodle Bowl'].map((name) => ({ menuItemId: items[name], quantity: 1 })),
  });
  const fired = await api('POST', `/orders/${pizza.id}/fire`, captainToken, { version: pizza.version });
  await api('PATCH', `/kots/${fired.kot.id}/ready`, manager);

  await at('13:20', DAY);
  const station = await signIn(browser, { name: 'Manager', phone: golden.phones.Manager, password: golden.password, device: 'tablet' });
  await openStation(station.page, 'Live Kitchen');
  await expect(tickets(station.page, 'Table 3')).toHaveCount(0);

  await station.page.getByRole('button', { name: 'Recall', exact: true }).click();
  const sheet = station.page.getByRole('dialog', { name: 'Recall' });
  // How far back: the ticket finished 10 minutes ago shows in every range.
  const ranges = sheet.getByRole('group', { name: 'How far back' });
  await expect(ranges.getByRole('button', { name: '1 hour' })).toHaveAttribute('aria-pressed', 'true');
  await ranges.getByRole('button', { name: 'Last 30 min' }).click();
  await expect(ranges.getByRole('button', { name: 'Last 30 min' })).toHaveAttribute('aria-pressed', 'true');
  const row = sheet.locator('li').filter({ hasText: 'Table 3' });
  await expect(row).toContainText('Half & Half Pizza');
  await row.getByRole('button', { name: 'Recall', exact: true }).click();
  await expect(sheet.locator('li').filter({ hasText: 'Table 3' })).toHaveCount(0);
  await sheet.getByRole('button', { name: /close/i }).first().click();

  await expect(tickets(station.page, 'Table 3')).toHaveCount(1);
  await expect(tickets(station.page, 'Table 3')).toContainText('Chilli Garlic Noodle Bowl');
  await station.page.screenshot({ path: 'e2e/screenshots/kitchen-recall.png', fullPage: true });
  await gotoFloor(captain.page);
  await captain.page.screenshot({ path: 'e2e/screenshots/floor-tiles.png', fullPage: true });
});
