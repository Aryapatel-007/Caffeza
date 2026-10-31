/**
 * Part payment through the screens (2026-11-01): a cashier takes half of a
 * bill in cash with one tap on Half, the screen says what stays outstanding,
 * then the rest by UPI, which the keypad already holds. The bill is paid with
 * two payments that add up to its bill total.
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

test('a cashier takes half in cash and the rest by UPI', async ({ browser }) => {
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

  // Half, in cash.
  await area.getByRole('button', { name: /^Cash/ }).click();
  await area.getByRole('button', { name: /^Half/ }).click();
  await expect(area.getByText(`${rupees(total - half)} stays outstanding for the next method`, { exact: false })).toBeVisible();
  await area.getByRole('button', { name: /^Record payment/ }).click();
  await expect(page.getByText(`Part payment recorded. ${rupees(total - half)} still outstanding.`)).toBeVisible();

  // The panel starts again: Paid so far, and the rest ready for the next method.
  await expect(area.getByText('Paid so far', { exact: false })).toBeVisible();
  await expect(area.getByText('Part paid. Pick the method for the remaining', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/part-payment.png', fullPage: true });
  await area.getByRole('button', { name: /^UPI/ }).click();
  await area.getByRole('button', { name: /^Record payment/ }).click();
  await expect(page.getByText('Payment recorded. Bill paid in full.')).toBeVisible();

  const paid = await api('GET', `/bills/${bill.id}`, cashier);
  expect(paid.status).toBe('PAID');
  expect(paid.payments.map((payment) => [payment.method, payment.amountInPaise])).toEqual([
    ['CASH', half],
    ['UPI', total - half],
  ]);
});
