/**
 * A captain's phone, an order of seven sent dishes, the Review sheet open: it
 * must read as a list, with Change beside each dish and no sideways scroll.
 * From Z Chaat's screenshot of 14 October, where each dish took three rows.
 */
import { expect, test } from '@playwright/test';

import { at, resetGolden } from './helpers/clock.js';
import { signIn } from './helpers/people.js';

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

test('a captain reads a long order on a phone', async ({ browser }) => {
  const golden = await resetGolden();
  await at('13:10', DAY);
  const captainToken = (await api('POST', '/auth/login', null, { phone: golden.phones['Khuman Singh'], password: golden.password })).accessToken;
  const dishes = ['Mumbaiya Pav Bhaji Platter', 'Chilli Garlic Noodle Bowl', 'Creamy Pesto Pasta', 'Half & Half Pizza', 'Mexican Bowl', 'Ferrero Hazelnut Shake', 'Caffe Latte'];
  const order = await api('POST', '/orders', captainToken, {
    orderType: 'DINE_IN',
    tableId: golden.ids.tables['Table 12'],
    guestCount: 4,
    lines: dishes.map((name) => ({ menuItemId: golden.ids.items[name], quantity: 1 })),
  });
  await api('POST', `/orders/${order.id}/fire`, captainToken, { version: order.version });

  const captain = await signIn(browser, { name: 'Khuman Singh', phone: golden.phones['Khuman Singh'], password: golden.password, device: 'phone' });
  const page = captain.page;
  await page.goto(`/orders/${order.id}`);
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const sheet = page.getByRole('dialog').first();
  await expect(sheet.getByRole('button', { name: 'Change', exact: true })).toHaveCount(7);

  // At least five dishes and their Change in view at once, and nothing wider than the screen.
  // Polled: the sheet slides up when it opens.
  const inView = () =>
    page.evaluate(
      () => [...document.querySelectorAll('[role="dialog"] button')].filter((button) => button.textContent.trim() === 'Change' && button.getBoundingClientRect().bottom <= window.innerHeight).length,
    );
  await expect.poll(inView).toBeGreaterThanOrEqual(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'e2e/screenshots/captain-phone-order.png' });
});
