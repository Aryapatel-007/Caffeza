/**
 * P49. A dish not sent yet is removed from the captain's phone with no
 * question asked, and leaves nothing on the order.
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

test('a captain removes a dish before sending, with no reason asked', async ({ browser }) => {
  const golden = await resetGolden();
  await at('13:10', DAY);
  const token = (await api('POST', '/auth/login', null, { phone: golden.phones['Khuman Singh'], password: golden.password })).accessToken;
  const order = await api('POST', '/orders', token, {
    orderType: 'DINE_IN',
    tableId: golden.ids.tables['Table 12'],
    guestCount: 2,
    lines: ['Mexican Bowl', 'Caffe Latte'].map((name) => ({ menuItemId: golden.ids.items[name], quantity: 1 })),
  });

  const captain = await signIn(browser, { name: 'Khuman Singh', phone: golden.phones['Khuman Singh'], password: golden.password, device: 'phone' });
  const page = captain.page;
  await page.goto(`/orders/${order.id}`);
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const sheet = page.getByRole('dialog').first();
  await sheet.getByRole('button', { name: 'Remove Caffe Latte' }).click();
  await expect(page.getByText('Caffe Latte removed.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Cancel Caffe Latte' })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Remove Caffe Latte' })).toHaveCount(0);

  const after = await api('GET', `/orders/${order.id}`, token);
  expect(after.lines.map((line) => [line.itemName, line.status])).toEqual([['Mexican Bowl', 'PENDING']]);
});
