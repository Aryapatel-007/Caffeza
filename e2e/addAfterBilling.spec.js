/**
 * P26, through the screens: a table has paid, then orders one more dish. The
 * manager taps Add items on the bill, adds the dish on the order, the kitchen
 * makes it, and the new bill carries the cash already paid and asks only for
 * the difference.
 */
import { expect, test } from '@playwright/test';

import { at, resetGolden } from './helpers/clock.js';
import { signIn } from './helpers/people.js';
import { markReady } from './pages/kitchen.js';
import { addItems, billOrder, sendToKitchen, serveAll } from './pages/order.js';

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

test('a paid table orders one more dish', async ({ browser }) => {
  const golden = await resetGolden();
  await at('13:00', DAY);
  const [manager, captain, cashier] = await Promise.all(['Manager', 'Khuman Singh', 'Counter'].map((name) => tokenOf(golden, name)));

  // Table 5 has a Masala Tea, billed and paid in cash: ₹95.00.
  const { items, tables } = golden.ids;
  let order = await api('POST', '/orders', captain, { orderType: 'DINE_IN', tableId: tables['Table 5'], guestCount: 2, lines: [{ menuItemId: items['Masala Tea'], quantity: 1 }] });
  const fired = await api('POST', `/orders/${order.id}/fire`, captain, { version: order.version });
  for (const kot of fired.kots) await api('PATCH', `/kots/${kot.id}/ready`, manager);
  order = await api('GET', `/orders/${order.id}`, captain);
  for (const line of order.lines) order = await api('PATCH', `/orders/${order.id}/lines/${line.id}/served`, captain, { version: order.version });
  const bill = await api('POST', '/bills', cashier, { orderId: order.id, version: order.version });
  await api('POST', `/bills/${bill.id}/payments`, cashier, { method: 'CASH', amountInPaise: bill.grandTotalInPaise });

  await at('13:30', DAY);
  const counter = await signIn(browser, { name: 'Manager', phone: golden.phones.Manager, password: golden.password, device: 'computer' });
  const page = counter.page;
  await page.goto(`/bills/${bill.id}`);
  await page.getByRole('button', { name: 'Add items', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Add items' });
  await expect(sheet.getByText(/already paid moves onto the new bill/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Void and add items' }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}`));

  await addItems(page, ['Caffe Latte']);
  await sendToKitchen(page);
  await markReady(page, 'Beverages', 'Table 5');
  await page.goto(`/orders/${order.id}`);
  await serveAll(page);
  await billOrder(page);

  // The new bill: the latte added, the cash already paid carried, the rest due.
  await expect(page.getByText('Caffe Latte').first()).toBeVisible();
  await expect(page.getByText('Masala Tea').first()).toBeVisible();
  await expect(page.getByText('Payments').locator('xpath=..')).toContainText('Cash');
  await expect(page.getByText(`${(bill.grandTotalInPaise / 100).toFixed(2)}`).first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/add-after-billing.png', fullPage: true });
});
