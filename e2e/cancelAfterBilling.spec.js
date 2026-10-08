/**
 * P25 Part E, through the screens: a cashier cancels an item on a paid bill,
 * a manager approves with a PIN on the same screen, and the cashier sees the
 * new bill and the cash to give back. Golden day B05 paid in cash: ₹795.00
 * becomes ₹449.00, give back ₹346.00.
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

test.describe.configure({ mode: 'serial' });

test('a cashier cancels an item on a paid bill with a manager’s PIN', async ({ browser }) => {
  const golden = await resetGolden();
  await at('15:50', DAY);
  const [owner, manager, captain, cashier] = await Promise.all(['Owner', 'Manager', 'Budha Singh', 'Counter'].map((name) => tokenOf(golden, name)));
  const managerId = (await api('GET', '/auth/me', manager)).user.id;
  await api('PATCH', `/users/${managerId}/pin`, owner, { pin: '2468' });

  // Golden day B05 on Table 3, made, served, billed and paid in cash.
  const { items, tables } = golden.ids;
  let order = await api('POST', '/orders', captain, {
    orderType: 'DINE_IN',
    tableId: tables['Table 3'],
    guestCount: 2,
    lines: ['Half & Half Pizza', 'Ferrero Hazelnut Shake', 'Water Bottle'].map((name) => ({ menuItemId: items[name], quantity: 1 })),
  });
  const fired = await api('POST', `/orders/${order.id}/fire`, captain, { version: order.version });
  for (const kot of fired.kots) await api('PATCH', `/kots/${kot.id}/ready`, manager);
  order = await api('GET', `/orders/${order.id}`, captain);
  for (const line of order.lines) order = await api('PATCH', `/orders/${order.id}/lines/${line.id}/served`, captain, { version: order.version });
  const bill = await api('POST', '/bills', cashier, { orderId: order.id, version: order.version });
  expect(bill.grandTotalInPaise).toBe(79500);
  await api('POST', `/bills/${bill.id}/payments`, cashier, { method: 'CASH', amountInPaise: 79500 });

  await at('16:10', DAY);
  const counter = await signIn(browser, { name: 'Counter', phone: golden.phones.Counter, password: golden.password, device: 'computer' });
  const page = counter.page;
  await page.goto(`/bills/${bill.id}`);
  await expect(page.getByText('Tax invoice')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel an item' }).click();

  const sheet = page.getByRole('dialog', { name: 'Cancel an item' });
  await sheet.getByText(/Ferrero Hazelnut Shake/).click();
  await sheet.getByRole('button', { name: 'Yes', exact: true }).click();
  await sheet.getByRole('button', { name: 'Guest changed the order', exact: true }).click();
  await sheet.getByRole('button', { name: 'Next' }).click();
  await expect(sheet.getByText(`Bill ${bill.billNumber} for ₹795.00 will be voided. A new bill for ₹449.00 will be made. Give back ₹346.00 in cash.`)).toBeVisible();

  await sheet.getByRole('button', { name: 'Manager', exact: true }).click();
  await sheet.getByLabel('Their PIN').fill('2468');
  await sheet.getByRole('button', { name: 'Cancel and re-bill' }).click();

  await expect(page.getByText(`Bill ${bill.billNumber} voided. Give back ₹346.00 in cash.`)).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(`/bills/${bill.id}$`));
  await expect(page.getByText('Bill total').locator('xpath=..')).toContainText('449.00');
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/cancel-after-billing.png', fullPage: true });
});
