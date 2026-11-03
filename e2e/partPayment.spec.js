/**
 * Part payment through the screens (2026-11-03): on its own panel, the
 * cashier types the cash part, puts the rest on UPI with one tap, and records
 * both at once. The bill is paid with two payments that add up to its total.
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
const tokenOf = async (golden, name) => (await api('POST', '/auth/login', null, { phone: golden.phones[name], password: golden.password })).accessToken;
const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

test('a cashier records part in cash and the rest by UPI at once', async ({ browser }) => {
  const golden = await resetGolden();
  await at('15:05', DAY);
  const [manager, captain, cashier] = await Promise.all(['Manager', 'Budha Singh', 'Counter'].map((name) => tokenOf(golden, name)));

  // Table 3: a pizza, made and served, billed and printed.
  const { items, tables } = golden.ids;
  const order = await api('POST', '/orders', captain, {
    orderType: 'DINE_IN',
    tableId: tables['Table 3'],
    guestCount: 2,
    lines: [{ menuItemId: items['Half & Half Pizza'], quantity: 1 }],
  });
  const fired = await api('POST', `/orders/${order.id}/fire`, captain, { version: order.version });
  for (const kot of fired.kots) await api('PATCH', `/kots/${kot.id}/ready`, manager);
  const served = await api('GET', `/orders/${order.id}`, captain);
  const bill = await api('POST', '/bills', cashier, { orderId: order.id, version: served.version });
  await api('POST', `/bills/${bill.id}/printed`, cashier);
  const total = bill.grandTotalInPaise;
  const half = Math.floor(total / 200) * 100;

  await at('15:40', DAY);
  const counter = await signIn(browser, { name: 'Counter', phone: golden.phones.Counter, password: golden.password, device: 'computer' });
  const page = counter.page;
  await page.goto(`/bills/${bill.id}`);
  const area = page.getByRole('region', { name: 'Take payment' });

  // Part payment: its own panel, one amount per method, recorded together.
  await area.getByRole('button', { name: /^Part payment/ }).click();
  const parts = page.getByRole('region', { name: 'Part payment' });
  await parts.getByRole('textbox', { name: 'Amount by Cash' }).fill(String(half / 100));
  await expect(parts.getByText('Still to collect')).toBeVisible();
  await parts.getByRole('listitem').filter({ has: page.getByRole('textbox', { name: 'Amount by UPI' }) }).getByRole('button', { name: 'Rest' }).click();
  await expect(parts.getByText('Matches the bill.', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/part-payment.png', fullPage: true });
  await parts.getByRole('button', { name: 'Record 2 payments' }).click();
  await expect(page.getByText('Bill paid in full.', { exact: false })).toBeVisible();

  const paid = await api('GET', `/bills/${bill.id}`, cashier);
  expect(paid.status).toBe('PAID');
  expect(paid.payments.map((payment) => [payment.method, payment.amountInPaise])).toEqual([
    ['CASH', half],
    ['UPI', total - half],
  ]);
});
