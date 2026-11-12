/**
 * P66 through the screens: a cashier pays a bill part by UPI and the rest in
 * cash on the part payment panel, both recorded in one request; a manager opens Edit bill on a paid bill,
 * changes how it was paid, then bills it again with prices including GST.
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
const rupeesInput = (paise) => (paise / 100).toFixed(2);

/** Table 3: a pizza, made and served, billed and printed. */
async function printedBill(golden) {
  const [manager, captain, cashier] = await Promise.all(['Manager', 'Budha Singh', 'Counter'].map((name) => tokenOf(golden, name)));
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
  return { bill, manager, cashier };
}

test('a cashier records UPI and cash together with Part payment', async ({ browser }) => {
  const golden = await resetGolden();
  await at('15:05', DAY);
  const { bill, cashier } = await printedBill(golden);
  const part = Math.floor(bill.grandTotalInPaise / 200) * 100;

  await at('15:40', DAY);
  const counter = await signIn(browser, { name: 'Counter', phone: golden.phones.Counter, password: golden.password, device: 'computer' });
  const page = counter.page;
  await page.goto(`/bills/${bill.id}`);
  const skip = page.getByRole('button', { name: 'Take payment without printing' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.getByRole('region', { name: 'Take payment' }).getByRole('button', { name: 'Part payment' }).click();

  const panel = page.getByRole('region', { name: 'Part payment' });
  await panel.getByLabel('Amount by UPI').fill(rupeesInput(part));
  await panel.getByLabel('Amount by Cash').fill(rupeesInput(bill.grandTotalInPaise - part));
  await page.screenshot({ path: 'e2e/screenshots/part-payment-split.png', fullPage: true });
  await panel.getByRole('button', { name: 'Record 2 payments' }).click();
  await expect(page.getByText(/^Part payment recorded: .*Bill paid in full\./)).toBeVisible();

  const paid = await api('GET', `/bills/${bill.id}`, cashier);
  expect(paid.status).toBe('PAID');
  // In the panel's method order, recorded together.
  expect(paid.payments.map((payment) => [payment.method, payment.amountInPaise]).sort()).toEqual(
    [['CASH', bill.grandTotalInPaise - part], ['UPI', part]].sort(),
  );
});

test('a manager changes a paid bill from Edit bill', async ({ browser }) => {
  const golden = await resetGolden();
  await at('15:05', DAY);
  const { bill, cashier } = await printedBill(golden);
  await api('POST', `/bills/${bill.id}/payments`, cashier, { method: 'CASH', amountInPaise: bill.grandTotalInPaise });
  const part = Math.floor(bill.grandTotalInPaise / 200) * 100;

  await at('15:45', DAY);
  const manager = await signIn(browser, { name: 'Manager', phone: golden.phones.Manager, password: golden.password, device: 'computer' });
  const page = manager.page;
  await page.goto(`/bills/${bill.id}`);

  // Change payments: all cash becomes part cash, the rest UPI.
  await page.getByRole('button', { name: 'Edit bill' }).click();
  await page.getByRole('dialog', { name: 'Edit bill' }).getByRole('button', { name: /^Change payments/ }).click();
  const rows = page.getByRole('dialog', { name: 'Change payments' });
  await rows.getByLabel('Amount 1').fill(rupeesInput(part));
  await rows.getByRole('button', { name: '+ Add another method' }).click();
  await rows.getByLabel('Method 2').selectOption({ label: 'UPI' });
  await rows.getByLabel('Reason').fill('Guest paid part by UPI');
  await rows.getByRole('button', { name: 'Save payments' }).click();
  await expect(page.getByText('Payments changed.')).toBeVisible();
  const changed = await api('GET', `/bills/${bill.id}`, cashier);
  expect(changed.payments.map((payment) => [payment.method, payment.amountInPaise])).toEqual([
    ['CASH', part],
    ['UPI', bill.grandTotalInPaise - part],
  ]);

  // Change discount or GST: bill it again with prices including GST.
  await page.getByRole('button', { name: 'Edit bill' }).click();
  await page.getByRole('dialog', { name: 'Edit bill' }).getByRole('button', { name: /^Change discount or GST/ }).click();
  const reprice = page.getByRole('dialog', { name: 'Change discount or GST' });
  await reprice.getByLabel('Price includes GST').check();
  await reprice.getByLabel('Reason').fill('Owner said the price includes GST');
  await expect(reprice.getByText('New bill total', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/edit-bill-reprice.png', fullPage: true });
  await reprice.getByRole('button', { name: 'Make the new bill' }).click();
  await expect(page.getByText(/^New bill .* made\./)).toBeVisible();
  await expect(page.getByText('Prices include GST')).toBeVisible();

  const newId = page.url().split('/bills/')[1];
  const repriced = await api('GET', `/bills/${newId}`, cashier);
  expect(repriced.pricesIncludeGst).toBe(true);
  expect(repriced.grandTotalInPaise).toBeLessThan(bill.grandTotalInPaise);
  expect(repriced.status).toBe('PAID');
});
