/**
 * P50. A captain opens a table by mistake and closes it from the phone, with
 * no reason asked; once a dish is sent, Close table is gone.
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

test('a captain closes a table opened by mistake', async ({ browser }) => {
  const golden = await resetGolden();
  await at('13:10', DAY);
  const token = (await api('POST', '/auth/login', null, { phone: golden.phones['Khuman Singh'], password: golden.password })).accessToken;
  const order = await api('POST', '/orders', token, {
    orderType: 'DINE_IN',
    tableId: golden.ids.tables['Table 12'],
    guestCount: 2,
    lines: [{ menuItemId: golden.ids.items['Caffe Latte'], quantity: 1 }],
  });

  const captain = await signIn(browser, { name: 'Khuman Singh', phone: golden.phones['Khuman Singh'], password: golden.password, device: 'phone' });
  const page = captain.page;
  await page.goto(`/orders/${order.id}`);
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('dialog').first().getByRole('button', { name: 'Close table', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Close Table 12?' });
  await expect(confirm.getByText('The dishes not sent go with it.')).toBeVisible();
  await confirm.getByRole('button', { name: 'Close table', exact: true }).click();
  await expect(page).toHaveURL(/\/floor$/);

  const after = await api('GET', `/orders/${order.id}`, token);
  expect([after.status, after.cancelReasonCode, after.lines.length]).toEqual(['CANCELLED', 'OPENED_BY_MISTAKE', 0]);
  const tables = await api('GET', '/tables', token);
  expect(tables.find((table) => table.id === golden.ids.tables['Table 12']).occupancy.state).toBe('FREE');

  // Once a dish is sent, the captain has no Close table.
  const sent = await api('POST', '/orders', token, {
    orderType: 'DINE_IN',
    tableId: golden.ids.tables['Table 12'],
    guestCount: 2,
    lines: [{ menuItemId: golden.ids.items['Caffe Latte'], quantity: 1 }],
  });
  await api('POST', `/orders/${sent.id}/fire`, token, { version: sent.version });
  await page.goto(`/orders/${sent.id}`);
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('dialog').first().getByRole('button', { name: 'Change', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close table', exact: true })).toHaveCount(0);
});
